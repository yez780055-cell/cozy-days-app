package com.littledays.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Separate protocol: never changes the COZ1 archive or the schema=1 catalog. */
final class WebFileManifest {
    static final String NAME = "web-manifest.json";
    static final String SIGNATURE = "web-manifest.sig";
    static final String LOCAL = "cozy-files.json";
    static final int MAX_BYTES = 512 * 1024;
    static final long MAX_TOTAL = 96L * 1024 * 1024;
    static final int MAX_FILES = 1_999; // COZ1's 2,000 ZIP entries also include version metadata.

    static final class Entry {
        final String path;
        final long bytes;
        final String sha256;
        Entry(String path, long bytes, String sha256) {
            this.path = path; this.bytes = bytes; this.sha256 = sha256;
        }
        String objectName() { return "file-" + sha256; }
    }

    final List<Entry> files;
    final byte[] payload;

    private WebFileManifest(List<Entry> files, byte[] payload) {
        this.files = files; this.payload = payload;
    }

    static WebFileManifest verify(byte[] payload, byte[] signature, Signature verifier,
            int shell, OnlineWebUpdates.Release release) throws Exception {
        if (payload.length == 0 || payload.length > MAX_BYTES || signature.length < 128 || signature.length > 512) {
            throw new IOException("Invalid file manifest size");
        }
        verifier.update(payload);
        if (!verifier.verify(signature)) throw new SecurityException("File manifest signature does not match the APK");
        JSONObject json = new JSONObject(new String(payload, java.nio.charset.StandardCharsets.UTF_8));
        if (OnlineWebUpdates.integer(json, "schema") != 1 || OnlineWebUpdates.integer(json, "shell") != shell
                || OnlineWebUpdates.integer(json, "web") != release.web
                || OnlineWebUpdates.integer(json, "packageBytes") != release.bytes
                || !release.sha256.equals(json.getString("packageSha256"))) {
            throw new IOException("File manifest does not match the offered release");
        }
        return new WebFileManifest(entries(json.getJSONArray("files")), payload);
    }

    static List<Entry> entries(JSONArray array) throws Exception {
        if (array.length() < 1 || array.length() > MAX_FILES) throw new IOException("Invalid file count");
        List<Entry> files = new ArrayList<>();
        HashSet<String> paths = new HashSet<>();
        long total = 0;
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.getJSONObject(i);
            String path = item.getString("path");
            long bytes = OnlineWebUpdates.integer(item, "bytes");
            String sha = item.getString("sha256");
            if (!safePath(path) || !paths.add(path) || bytes < 0 || bytes > MAX_TOTAL
                    || !sha.matches("[a-f0-9]{64}")) throw new IOException("Invalid file manifest entry");
            total += bytes;
            if (total > MAX_TOTAL) throw new IOException("Web files exceed limits");
            files.add(new Entry(path, bytes, sha));
        }
        if (!paths.contains("index.html")) throw new IOException("Missing web entry point");
        // A file cannot also be another file's parent directory.
        for (String path : paths) {
            for (int slash = path.indexOf('/'); slash >= 0; slash = path.indexOf('/', slash + 1)) {
                if (paths.contains(path.substring(0, slash))) throw new IOException("Conflicting file paths");
            }
        }
        return files;
    }

    static boolean safePath(String path) {
        if (!path.equals("index.html") && !path.matches("(assets|icons)/[A-Za-z0-9][A-Za-z0-9._/-]*")) return false;
        for (String segment : path.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) return false;
        }
        return true;
    }

    static File target(File root, String path) throws IOException {
        if (!safePath(path)) throw new IOException("Unsafe web file path");
        File file = new File(root, path).getCanonicalFile();
        if (!file.getPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("Unsafe file target");
        return file;
    }

    static String hash(InputStream input) throws Exception {
        return describe("index.html", input).sha256;
    }

    static Entry describe(String path, InputStream input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[32 * 1024];
        long total = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
            total += count;
            if (total > MAX_TOTAL) throw new IOException("Local web file exceeds limits");
            digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return new Entry(path, total, hex.toString());
    }

    static void verifyFile(File file, Entry entry) throws Exception {
        if (!file.isFile() || file.length() != entry.bytes) throw new IOException("Incorrect web file length");
        try (InputStream input = new FileInputStream(file)) {
            if (!hash(input).equals(entry.sha256)) throw new SecurityException("Incorrect web file SHA-256");
        }
    }
}
