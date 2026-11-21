package com.littledays.app;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import java.io.*;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** Runs the production Java on Android ART; no mocked android.jar implementations. */
public final class DeltaUpdateProbe {
    static KeyPair keys;
    static File root;
    static int passed;
    static final int SHELL = BuildConfig.VERSION_CODE;
    static final byte[] HTML = "<html>offline</html>".getBytes(StandardCharsets.UTF_8);
    static final byte[] OLD = "unchanged font".getBytes(StandardCharsets.UTF_8);
    static final byte[] NEW = "new js".getBytes(StandardCharsets.UTF_8);

    public static void main(String[] args) throws Exception {
        keys = KeyPairGenerator.getInstance("RSA").generateKeyPair();
        root = new File("/data/local/tmp/cozy-delta-" + UUID.randomUUID());
        require(root.mkdir(), "test root");
        try {
            reuseAndDeletion();
            badMetadata();
            badFiles();
            fallbackAndActivation();
            System.out.println("PASS " + passed + " Android delta assertions");
        } finally { remove(root); }
    }

    static void reuseAndDeletion() throws Exception {
        Fixture f = new Fixture();
        f.local.put("icons/deleted.svg", OLD);
        File staged = directory("reuse");
        DeltaWebUpdates.assemble(staged, SHELL, f.release, verifier(), f, f, f::progress, () -> {});
        require(f.downloads.equals(List.of("assets/new.js")), "only added/changed file downloads");
        require(!new File(staged, "icons/deleted.svg").exists(), "deleted files excluded");
        require(new File(staged, "assets/font.woff2").length() == OLD.length, "font copied locally");
        require(f.lastTotal == NEW.length && f.lastReceived == NEW.length, "actual delta byte progress");
        f.local.putAll(f.target);
        f.downloads.clear();
        DeltaWebUpdates.assemble(directory("reuse-all"), SHELL, f.release, verifier(), f, f, f::progress, () -> {});
        require(f.downloads.isEmpty() && f.lastTotal == 0, "zero downloads when everything unchanged");
        f.local.put("assets/new.js", OLD);
        f.downloads.clear();
        DeltaWebUpdates.assemble(directory("changed"), SHELL, f.release, verifier(), f, f, f::progress, () -> {});
        require(f.downloads.equals(List.of("assets/new.js")), "same path changed hash downloads");
    }

    static void badMetadata() throws Exception {
        for (String mode : List.of("signature", "shell", "web", "schema", "binding", "traversal", "duplicate", "missing-index", "conflict", "oversize")) {
            Fixture f = new Fixture();
            JSONObject json = f.json();
            JSONArray files = json.getJSONArray("files");
            switch (mode) {
                case "shell": json.put("shell", SHELL + 1); break;
                case "web": json.put("web", 3); break;
                case "schema": json.put("schema", 2); break;
                case "binding": json.put("packageSha256", "a".repeat(64)); break;
                case "traversal": files.getJSONObject(1).put("path", "assets/../escape"); break;
                case "duplicate": files.put(files.getJSONObject(0)); break;
                case "missing-index": files.getJSONObject(0).put("path", "assets/index.html"); break;
                case "conflict": files.put(entry("assets/font.woff2/child", NEW)); break;
                case "oversize": files.getJSONObject(0).put("bytes", WebFileManifest.MAX_TOTAL + 1); break;
            }
            f.payload = json.toString().getBytes(StandardCharsets.UTF_8);
            f.signature = sign(f.payload);
            if (mode.equals("signature")) f.signature[0] ^= 1;
            expectFailure(() -> DeltaWebUpdates.assemble(directory("bad-" + mode), SHELL, f.release,
                verifier(), f, f, f::progress, () -> {}));
            require(f.inventoryReads == 0 && f.downloads.isEmpty(), mode + " rejected before source access/download");
        }
        for (String path : List.of("assets//x", "assets/./x", "assets/../x", "/index.html", "assets/x\\y", "assets/x?y")) {
            require(!WebFileManifest.safePath(path), "unsafe path " + path);
        }
    }

    static void badFiles() throws Exception {
        for (String mode : List.of("download-hash", "truncated", "reused-corruption", "network", "inventory")) {
            Fixture f = new Fixture(); f.failure = mode;
            expectFailure(() -> DeltaWebUpdates.assemble(directory(mode), SHELL, f.release, verifier(), f, f, f::progress, () -> {}));
            require(true, mode + " blocks activation");
        }
    }

    static void fallbackAndActivation() throws Exception {
        TestContext context = new TestContext(directory("context"));
        WebBundles bundles = new WebBundles(context, DeltaUpdateProbe::verifier);
        bundles.install(new ByteArrayInputStream(archive(2, true)), 2, () -> {});
        bundles.beginTrial(); bundles.confirmStartup();
        File stable = new File(context.getFilesDir(), "cozy-web-bundles/" + SHELL + "-2");
        require(bundles.activeRevision() == 2 && stable.isDirectory(), "full import remains supported");
        final int[] attempts = {0};
        Fixture f = new Fixture(); f.signature[0] ^= 1;
        File staged = DeltaWebUpdates.prepareOrFull(
            () -> bundles.prepareDelta(f.release, f, f::progress, () -> {}), bundles::discardStaged,
            () -> { attempts[0]++; return bundles.prepareFull(new ByteArrayInputStream(archive(3, true)), 3, () -> {}); });
        require(attempts[0] == 1 && bundles.activeRevision() == 2, "signature failure tries full once before activation");
        require(!new File(staged, "assets/new.js").exists(), "failed delta staging cleaned before full assembly");
        bundles.activate(staged, 3);
        require(bundles.isPending(), "activation starts existing pending protocol");
        bundles.beginTrial();
        require(bundles.onStartup().equals(stable) && bundles.activeRevision() == 2, "interrupted trial rolls back to stable offline");
        require(bundles.failedRevision() == 3, "failed web revision remembered");
        expectFailure(() -> DeltaWebUpdates.prepareOrFull(
            () -> { throw new IOException("delta offline"); }, bundles::discardStaged,
            () -> { attempts[0]++; return bundles.prepareFull(new ByteArrayInputStream(new byte[]{1}), 4, () -> {}); }));
        require(attempts[0] == 2 && bundles.activeRevision() == 2 && stable.isDirectory(), "both failures preserve stable version");
        require(!new File(context.getFilesDir(), "cozy-web-bundles/staging").exists(), "failed full staging removed");
        File prepared = bundles.prepareFull(new ByteArrayInputStream(archive(4, true)), 4, () -> {});
        context.failCommit = true;
        expectFailure(() -> bundles.activate(prepared, 4));
        context.failCommit = false;
        require(bundles.activeRevision() == 2 && stable.isDirectory(), "state commit failure preserves stable pointer");
        bundles.install(new ByteArrayInputStream(archive(5, true)), 5, () -> {});
        bundles.beginTrial(); bundles.confirmStartup();
        require(!bundles.isPending() && bundles.activeRevision() == 5 && bundles.onStartup().isDirectory(), "confirmed update cold-starts offline");
        bundles.reset();
        require(bundles.onStartup() == null && bundles.activeRevision() == 1, "restore APK fallback remains supported");
    }

    interface Action { void run() throws Exception; }
    static void expectFailure(Action action) throws Exception {
        try { action.run(); } catch (Exception expected) { return; }
        throw new AssertionError("Expected failure");
    }
    static void require(boolean value, String name) {
        if (!value) throw new AssertionError(name);
        passed++; System.out.println("PASS " + name);
    }
    static File directory(String name) throws Exception {
        File dir = new File(root, name); if (!dir.mkdir()) throw new IOException("mkdir " + name); return dir;
    }
    static Signature verifier() throws Exception {
        Signature v = Signature.getInstance("SHA256withRSA"); v.initVerify(keys.getPublic()); return v;
    }
    static byte[] sign(byte[] bytes) throws Exception {
        Signature s = Signature.getInstance("SHA256withRSA"); s.initSign(keys.getPrivate()); s.update(bytes); return s.sign();
    }
    static JSONObject entry(String path, byte[] bytes) throws Exception {
        return new JSONObject().put("path", path).put("bytes", bytes.length)
            .put("sha256", WebFileManifest.hash(new ByteArrayInputStream(bytes)));
    }
    static byte[] archive(int web, boolean valid) throws Exception {
        ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(zipBytes)) {
            zip.putNextEntry(new ZipEntry("index.html")); zip.write(HTML); zip.closeEntry();
            zip.putNextEntry(new ZipEntry("cozy-update.json"));
            zip.write(("{\"shell\":" + SHELL + ",\"web\":" + web + "}").getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
        }
        byte[] payload = zipBytes.toByteArray(), signature = sign(payload);
        if (!valid) signature[0] ^= 1;
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        DataOutputStream output = new DataOutputStream(result);
        output.writeInt(0x434f5a31); output.writeShort(signature.length); output.write(signature); output.write(payload);
        return result.toByteArray();
    }
    static void remove(File file) {
        File[] children = file.listFiles(); if (children != null) for (File child : children) remove(child); file.delete();
    }

    static final class Fixture implements DeltaWebUpdates.Source, DeltaWebUpdates.Transport {
        final Map<String, byte[]> local = new LinkedHashMap<>(), target = new LinkedHashMap<>();
        final List<String> downloads = new ArrayList<>();
        final OnlineWebUpdates.Release release = new OnlineWebUpdates.Release(2, 135, "0".repeat(64), null, false);
        byte[] payload, signature;
        long lastTotal, lastReceived;
        int inventoryReads;
        String failure = "";
        Fixture() throws Exception {
            local.put("index.html", HTML); local.put("assets/font.woff2", OLD);
            target.putAll(local); target.put("assets/new.js", NEW);
            payload = json().toString().getBytes(StandardCharsets.UTF_8); signature = sign(payload);
        }
        JSONObject json() throws Exception {
            JSONArray files = new JSONArray();
            for (var item : target.entrySet()) files.put(entry(item.getKey(), item.getValue()));
            return new JSONObject().put("schema", 1).put("shell", SHELL).put("web", release.web)
                .put("packageBytes", release.bytes).put("packageSha256", release.sha256).put("files", files);
        }
        public List<WebFileManifest.Entry> inventory() throws Exception {
            inventoryReads++;
            if (failure.equals("inventory")) throw new IOException("no reliable inventory");
            JSONArray entries = new JSONArray(); for (var item : local.entrySet()) entries.put(entry(item.getKey(), item.getValue()));
            return WebFileManifest.entries(entries);
        }
        public InputStream open(String path) {
            return new ByteArrayInputStream(failure.equals("reused-corruption") ? new byte[local.get(path).length] : local.get(path));
        }
        public byte[] metadata(String name, int limit) { return name.equals(WebFileManifest.NAME) ? payload : signature; }
        public void download(WebFileManifest.Entry entry, File file, OnlineWebUpdates.Progress progress) throws Exception {
            downloads.add(entry.path);
            if (failure.equals("network")) throw new IOException("offline");
            byte[] bytes = target.get(entry.path);
            if (failure.equals("download-hash")) bytes = new byte[bytes.length];
            if (failure.equals("truncated")) bytes = new byte[0];
            Files.write(file.toPath(), bytes); progress.update(bytes.length, entry.bytes);
        }
        void progress(long received, long total) { lastReceived = received; lastTotal = total; }
    }

    static final class TestContext extends ContextWrapper {
        final File dir;
        final Map<String, Object> state = new HashMap<>();
        boolean failCommit;
        TestContext(File dir) { super(null); this.dir = dir; }
        @Override public Context getApplicationContext() { return this; }
        @Override public File getFilesDir() { return dir; }
        @Override public File getCacheDir() { return dir; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{SharedPreferences.class}, (p, method, args) -> {
                String m = method.getName();
                if (m.equals("edit")) {
                    Map<String, Object> changes = new HashMap<>(); final boolean[] clear = {false};
                    return Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{SharedPreferences.Editor.class}, (editor, edit, values) -> {
                        String e = edit.getName();
                        if (e.equals("clear")) clear[0] = true;
                        else if (e.equals("remove")) changes.put((String) values[0], null);
                        else if (e.startsWith("put")) changes.put((String) values[0], values[1]);
                        else if (e.equals("commit") || e.equals("apply")) {
                            if (failCommit) return false;
                            if (clear[0]) state.clear();
                            changes.forEach((key, value) -> { if (value == null) state.remove(key); else state.put(key, value); });
                            return e.equals("commit") ? true : null;
                        }
                        return editor;
                    });
                }
                if (m.startsWith("get")) return state.getOrDefault((String) args[0], args[1]);
                throw new UnsupportedOperationException(m);
            });
        }
    }
}
