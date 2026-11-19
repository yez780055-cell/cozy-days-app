package com.littledays.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.util.zip.ZipFile;
import org.json.JSONObject;

final class WebBundles {
    private static final int MAGIC = 0x434F5A31; // COZ1
    private static final int MAX_DOWNLOAD = 64 * 1024 * 1024;
    private static final int MAX_EXTRACTED = 96 * 1024 * 1024;
    private static final int MAX_ENTRIES = 2_000;
    private static final int BUNDLED_REVISION = 1;
    private final Context context;
    private final SharedPreferences state;
    private final File root;

    WebBundles(Context context) {
        this.context = context.getApplicationContext();
        state = context.getSharedPreferences("cozy-web-bundle", Context.MODE_PRIVATE);
        root = new File(context.getFilesDir(), "cozy-web-bundles");
    }

    int activeRevision() {
        return state.getInt("shell", 0) == BuildConfig.VERSION_CODE
            ? state.getInt("web", BUNDLED_REVISION) : BUNDLED_REVISION;
    }

    File onStartup() {
        int revision = activeRevision();
        File current = directory(revision);
        if (revision == BUNDLED_REVISION || state.getBoolean("pending", false)
                || !new File(current, "index.html").isFile()) {
            try {
                reset();
            } catch (IllegalStateException error) {
                android.util.Log.e("CozyDays", "Could not reset the web bundle on startup", error);
            }
            return null;
        }
        try {
            writeState(revision, true);
            return current;
        } catch (IllegalStateException error) {
            android.util.Log.e("CozyDays", "Could not mark the web bundle as pending", error);
            return null;
        }
    }

    void confirmStartup() {
        if (state.getBoolean("pending", false)) writeState(activeRevision(), false);
    }

    void reset() {
        if (activeRevision() != BUNDLED_REVISION || state.contains("web")) {
            if (!state.edit().clear().commit()) throw new IllegalStateException("Could not reset web revision");
        }
    }

    File install(InputStream source) throws Exception {
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Bundle directory unavailable");
        File archive = File.createTempFile("cozy-update-", ".zip", context.getCacheDir());
        File staged = new File(root, "staging");
        try {
            verifyAndCopy(source, archive);
            remove(staged);
            if (!staged.mkdir()) throw new IOException("Staging directory unavailable");
            int revision = extract(archive, staged);
            File destination = directory(revision);
            remove(destination);
            if (!staged.renameTo(destination)) throw new IOException("Could not activate web bundle");
            writeState(revision, true);
            for (File child : children(root)) {
                if (!child.equals(destination)) remove(child);
            }
            return destination;
        } finally {
            archive.delete();
            remove(staged);
        }
    }

    private void writeState(int revision, boolean pending) {
        if (!state.edit().putInt("shell", BuildConfig.VERSION_CODE)
                .putInt("web", revision).putBoolean("pending", pending).commit()) {
            throw new IllegalStateException("Could not persist web revision");
        }
    }

    private File directory(int revision) {
        return new File(root, BuildConfig.VERSION_CODE + "-" + revision);
    }

    @SuppressWarnings("deprecation")
    private Signature verifier() throws Exception {
        PackageManager manager = context.getPackageManager();
        String app = context.getPackageName();
        var signers = Build.VERSION.SDK_INT >= 28
            ? manager.getPackageInfo(app, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo.getApkContentsSigners()
            : manager.getPackageInfo(app, PackageManager.GET_SIGNATURES).signatures;
        if (signers == null || signers.length != 1) throw new SecurityException("Expected a single APK signer");
        var certificate = CertificateFactory.getInstance("X.509")
            .generateCertificate(new ByteArrayInputStream(signers[0].toByteArray()));
        var signature = Signature.getInstance("SHA256withRSA");
        signature.initVerify(certificate);
        return signature;
    }

    private void verifyAndCopy(InputStream source, File archive) throws Exception {
        var input = new DataInputStream(source);
        if (input.readInt() != MAGIC) throw new IOException("Unknown web bundle format");
        int signatureLength = input.readUnsignedShort();
        if (signatureLength < 128 || signatureLength > 512) throw new IOException("Invalid signature size");
        byte[] signature = new byte[signatureLength];
        input.readFully(signature);
        var verifier = verifier();
        try (var output = new FileOutputStream(archive)) {
            byte[] buffer = new byte[32 * 1024];
            int total = 0;
            for (int count; (count = input.read(buffer)) != -1;) {
                total += count;
                if (total > MAX_DOWNLOAD) throw new IOException("Web bundle download is too large");
                verifier.update(buffer, 0, count);
                output.write(buffer, 0, count);
            }
        }
        if (!verifier.verify(signature)) throw new SecurityException("Web bundle signature does not match the APK");
    }

    private int extract(File archive, File staged) throws Exception {
        try (var zip = new ZipFile(archive)) {
            var metadata = zip.getEntry("cozy-update.json");
            if (metadata == null || metadata.getSize() < 1 || metadata.getSize() > 512) {
                throw new IOException("Invalid web bundle metadata");
            }
            var bytes = new ByteArrayOutputStream();
            try (var input = zip.getInputStream(metadata)) {
                for (int value; (value = input.read()) != -1;) {
                    if (bytes.size() >= 512) throw new IOException("Oversized web bundle metadata");
                    bytes.write(value);
                }
            }
            var manifest = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            int revision = manifest.getInt("web");
            if (manifest.getInt("shell") != BuildConfig.VERSION_CODE || revision <= activeRevision()) {
                throw new IOException("Incompatible shell or older web revision");
            }
            if (zip.size() > MAX_ENTRIES) throw new IOException("Too many web bundle entries");
            int extracted = 0;
            var entries = zip.entries();
            byte[] buffer = new byte[32 * 1024];
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                String name = entry.getName();
                if (entry.isDirectory() || name.equals("cozy-update.json")) continue;
                if (!name.equals("index.html") && !name.matches("(assets|icons)/[A-Za-z0-9][A-Za-z0-9._/-]*")) {
                    throw new IOException("Unexpected web bundle entry");
                }
                var target = new File(staged, name).getCanonicalFile();
                if (!target.getPath().startsWith(staged.getCanonicalPath() + File.separator) || target.exists()) {
                    throw new IOException("Invalid or duplicate web bundle entry");
                }
                var parent = target.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Asset directory unavailable");
                try (var input = zip.getInputStream(entry); var output = new FileOutputStream(target)) {
                    for (int count; (count = input.read(buffer)) != -1;) {
                        extracted += count;
                        if (extracted > MAX_EXTRACTED) throw new IOException("Web bundle is too large");
                        output.write(buffer, 0, count);
                    }
                }
            }
            if (!new File(staged, "index.html").isFile()) throw new IOException("Missing web entry point");
            return revision;
        }
    }

    private static File[] children(File directory) {
        var files = directory.listFiles();
        return files == null ? new File[0] : files;
    }

    private static void remove(File entry) {
        for (File child : children(entry)) remove(child);
        entry.delete();
    }
}
