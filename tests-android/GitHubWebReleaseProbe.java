package com.littledays.app;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

// Runs on the emulator's Android runtime with app_process, without building an APK.
public final class GitHubWebReleaseProbe {
    private static final String SHA = "dc86824a41c165ece971ff691aff6e08bbfe6e1d1f531688b47ee78c283a85cd";
    private static final int BYTES = 2302;

    public static void main(String[] args) throws Exception {
        checkSelection();
        System.out.println("PASS: channels, shell and revision comparison, manifest and redirects");

        var stable = new GitHubWebReleases(5, false);
        var offered = stable.check(1, 0, (url, limit, asset, optional) -> {
            String body = OnlineWebUpdates.read(url, limit, asset, optional);
            if (!asset) System.out.println("API " + url.getPath() + ": " + (body == null ? "404" : "200"));
            return body;
        });
        System.out.println("PASS: anonymous Android release check; offered=" + (offered == null ? "none" : offered.web));

        // Small immutable public Release Asset exercises the same networking and integrity code.
        var url = new URL("https://github.com/jqlang/jq/releases/download/jq-1.8.2/sha256sum.txt");
        var progress = new AtomicLong();
        File destination = File.createTempFile("cozy-github-", ".txt", new File("/data/local/tmp"));
        try {
            new OnlineWebUpdates().download(new OnlineWebUpdates.Release(2, BYTES, SHA, url, true),
                destination, (received, total) -> {
                    require(total == BYTES && received <= total, "reported asset size");
                    progress.set(received);
                }, () -> require(progress.get() == BYTES, "reported final byte count"));
            require(destination.length() == BYTES, "downloaded asset size");
        } finally {
            destination.delete();
        }
        System.out.println("PASS: anonymous Android asset download, CDN redirect, progress and SHA-256");

        if (args.length > 0) {
            int expected = Integer.parseInt(args[0]);
            var staged = new GitHubWebReleases(5, true).check(1, 0, OnlineWebUpdates::read);
            require(staged != null && staged.web == expected, "expected prerelease revision");
            require(offered == null, "stable channel excluded prerelease");
            var stagedProgress = new AtomicLong();
            File update = File.createTempFile("cozy-github-pre-", ".cozyupdate", new File("/data/local/tmp"));
            try {
                new OnlineWebUpdates().download(staged, update, (received, total) -> stagedProgress.set(received),
                    () -> require(stagedProgress.get() == staged.bytes, "signed candidate final byte count"));
                require(update.length() == staged.bytes, "signed candidate size");
            } finally {
                update.delete();
            }
            System.out.println("PASS: isolated prerelease " + staged.web + "; SHA-256 " + staged.sha256);
        }
    }

    private static void checkSelection() throws Exception {
        var stable = new GitHubWebReleases(5, false);
        var pre = new GitHubWebReleases(5, true);
        var records = new JSONArray().put(record(6, 99, false, false)).put(record(5, 10, true, true))
            .put(record(5, 9, true, false)).put(record(5, 2, false, false)).put(record(5, 4, false, false));
        GitHubWebReleases.Read fixture = (url, limit, asset, optional) -> {
            if (url.getPath().endsWith("/latest")) return record(6, 99, false, false).toString();
            if (!asset) return records.toString();
            return manifest(url.getPath().contains("-web-9/") ? 9 : 4, BYTES);
        };
        require(stable.check(1, 0, fixture).web == 4, "stable selects newest compatible ordinary release");
        require(pre.check(1, 0, fixture).web == 9, "preview ignores drafts and ordinary releases");
        require(stable.check(4, 0, fixture) == null, "installed revision filtered");
        require(pre.check(1, 9, fixture) == null, "failed revision filtered");
        require(stable.check(1, 0, (url, limit, asset, optional) ->
            asset ? manifest(4, BYTES) : record(5, 4, false, false).toString()).web == 4, "/latest ordinary release");
        requireFailure(() -> stable.check(1, 0, (url, limit, asset, optional) ->
            asset ? manifest(4, BYTES + 1) : record(5, 4, false, false).toString()), "manifest size mismatch");
        requireFailure(() -> stable.check(1, 0, (url, limit, asset, optional) ->
            asset ? manifest(3, BYTES) : record(5, 4, false, false).toString()), "manifest revision mismatch");
        URI github = URI.create("https://github.com/example");
        require(GitHubWebReleases.assetRedirect(github, "https://release-assets.githubusercontent.com/a?sig=x")
            .getHost().equals("release-assets.githubusercontent.com"), "accept CDN redirect");
        for (String target : new String[]{"http://release-assets.githubusercontent.com/path",
                "https://release-assets.githubusercontent.com.example.com/path",
                "https://github.com@release-assets.githubusercontent.com/path", null}) {
            requireFailure(() -> GitHubWebReleases.assetRedirect(github, target), "reject invalid redirect");
        }
    }

    private static JSONObject record(int shell, int revision, boolean prerelease, boolean draft) throws Exception {
        String tag = "android-web-shell-" + shell + "-web-" + revision;
        String root = "https://github.com/yez780055-cell/cozy-days-app/releases/download/" + tag + "/";
        String filename = OnlineWebUpdates.packageName(shell, revision);
        return new JSONObject().put("tag_name", tag).put("prerelease", prerelease).put("draft", draft).put("assets",
            new JSONArray().put(asset(root, "latest.json", 120)).put(asset(root, filename, BYTES).put("digest", "sha256:" + SHA)));
    }

    private static String manifest(int revision, int bytes) throws Exception {
        return new JSONObject().put("schema", 1).put("shell", 5).put("web", revision)
            .put("bytes", bytes).put("sha256", SHA).toString();
    }

    private static JSONObject asset(String root, String name, int bytes) throws Exception {
        return new JSONObject().put("name", name).put("size", bytes).put("state", "uploaded")
            .put("browser_download_url", root + name);
    }

    private interface Checked { void run() throws Exception; }

    private static void requireFailure(Checked action, String message) throws Exception {
        try {
            action.run();
        } catch (IOException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void require(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
    }
}
