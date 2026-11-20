package com.littledays.app;

import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

final class GitHubWebReleases {
    static final int MAX_RESPONSE = 2 * 1024 * 1024;
    private static final String REPOSITORY = "yez780055-cell/cozy-days-app";
    private static final String API = "https://api.github.com/repos/" + REPOSITORY + "/releases";
    private static final String ASSETS = "https://github.com/" + REPOSITORY + "/releases/download/";

    interface Read { String get(URL url, int limit, boolean githubAsset, boolean optional) throws Exception; }

    private final int shell;
    private final boolean prerelease;
    private final Pattern tagPattern;

    GitHubWebReleases(int shell, boolean prerelease) {
        this.shell = shell;
        this.prerelease = prerelease;
        tagPattern = Pattern.compile("android-web-shell-" + shell + "-web-([1-9][0-9]{0,9})");
    }

    OnlineWebUpdates.Release check(int current, int failed, Read read) throws Exception {
        JSONObject selected = null;
        if (!prerelease) {
            String latest = read.get(new URL(API + "/latest"), MAX_RESPONSE, false, true);
            if (latest != null) {
                JSONObject release = new JSONObject(latest);
                if (revision(release) >= 2) selected = release;
            }
        }
        // A regular APK release, or a release for another shell, may be GitHub's latest.
        if (selected == null) {
            JSONArray releases = new JSONArray(read.get(new URL(API + "?per_page=100"), MAX_RESPONSE, false, false));
            int highest = 1;
            for (int i = 0; i < releases.length(); i++) {
                JSONObject release = releases.getJSONObject(i);
                int web = revision(release);
                if (web > highest) {
                    highest = web;
                    selected = release;
                }
            }
        }
        if (selected == null) return null;
        int web = revision(selected);
        if (web <= current || web == failed) return null;

        String filename = OnlineWebUpdates.packageName(shell, web);
        String base = ASSETS + selected.getString("tag_name") + "/";
        JSONArray assets = selected.getJSONArray("assets");
        JSONObject manifest = asset(assets, base, "latest.json");
        long manifestBytes = OnlineWebUpdates.integer(manifest, "size");
        if (manifestBytes < 1 || manifestBytes > OnlineWebUpdates.MAX_CATALOG) {
            throw new IOException("Invalid GitHub manifest size");
        }
        JSONObject pkg = asset(assets, base, filename);
        URL packageUrl = new URL(base + filename);
        JSONObject json = new JSONObject(read.get(new URL(base + "latest.json"), OnlineWebUpdates.MAX_CATALOG, true, false));
        OnlineWebUpdates.Release release = OnlineWebUpdates.parseCatalog(json, shell, packageUrl, true);
        String digest = pkg.isNull("digest") ? "" : pkg.getString("digest");
        if (release.web != web || release.bytes != OnlineWebUpdates.integer(pkg, "size")
                || (!digest.isEmpty() && !digest.equals("sha256:" + release.sha256))) {
            throw new IOException("GitHub release assets do not match the manifest");
        }
        return release;
    }

    private int revision(JSONObject release) {
        // Require explicit boolean flags so an incomplete record cannot cross channels.
        if (!Boolean.FALSE.equals(release.opt("draft")) || !Boolean.valueOf(prerelease).equals(release.opt("prerelease"))) return 0;
        var match = tagPattern.matcher(release.optString("tag_name"));
        if (!match.matches()) return 0;
        long revision = Long.parseLong(match.group(1));
        return revision <= Integer.MAX_VALUE ? (int) revision : 0;
    }

    private static JSONObject asset(JSONArray assets, String base, String filename) throws Exception {
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if (filename.equals(asset.optString("name")) && "uploaded".equals(asset.optString("state"))
                    && (base + filename).equals(asset.optString("browser_download_url"))) return asset;
        }
        throw new IOException("Missing GitHub release asset: " + filename);
    }

    static URI assetRedirect(URI current, String location) throws IOException {
        try {
            URI target = current.resolve(location);
            String host = target.getHost();
            if ("https".equals(target.getScheme()) && target.getUserInfo() == null && target.getPort() == -1
                    && target.getRawFragment() == null
                    && ("release-assets.githubusercontent.com".equals(host) || "objects.githubusercontent.com".equals(host))) {
                return target;
            }
        } catch (IllegalArgumentException | NullPointerException ignored) {
            // Treat malformed redirects like any other invalid response.
        }
        throw new IOException("Invalid GitHub asset redirect");
    }
}
