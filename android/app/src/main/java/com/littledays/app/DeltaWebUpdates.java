package com.littledays.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.security.Signature;
import java.util.HashMap;
import java.util.Map;
import java.util.List;

/** Downloads only changed files; the completed directory owns every byte it serves. */
final class DeltaWebUpdates {
    interface Source {
        List<WebFileManifest.Entry> inventory() throws Exception;
        InputStream open(String path) throws Exception;
    }
    interface Transport {
        byte[] metadata(String name, int limit) throws Exception;
        void download(WebFileManifest.Entry entry, File target, OnlineWebUpdates.Progress progress) throws Exception;
    }
    interface Attempt { File run() throws Exception; }

    // Only preparation failures fall back. Activation/handshake failures use the existing rollback.
    static File prepareOrFull(Attempt delta, Runnable cleanup, Attempt full) throws Exception {
        try { return delta.run(); }
        catch (Exception error) {
            android.util.Log.w("CozyDays", "Incremental preparation failed; trying the full package", error);
            cleanup.run();
            return full.run();
        }
    }

    static void assemble(File staged, int shell, OnlineWebUpdates.Release release, Signature verifier,
            Source source, Transport transport, OnlineWebUpdates.Progress progress, Runnable verifying) throws Exception {
        // No inventory reads or file transfers until the exact manifest bytes are authenticated.
        WebFileManifest manifest = WebFileManifest.verify(
            transport.metadata(WebFileManifest.NAME, WebFileManifest.MAX_BYTES),
            transport.metadata(WebFileManifest.SIGNATURE, 512), verifier, shell, release);
        Map<String, WebFileManifest.Entry> local = new HashMap<>();
        for (WebFileManifest.Entry entry : source.inventory()) local.put(entry.path, entry);
        long downloadBytes = 0;
        for (WebFileManifest.Entry entry : manifest.files) {
            if (!same(entry, local.get(entry.path))) downloadBytes += entry.bytes;
        }
        final long total = downloadBytes;
        final long started = android.os.SystemClock.elapsedRealtime();
        progress.update(0, total);
        long received = 0;
        for (WebFileManifest.Entry entry : manifest.files) {
            if (android.os.SystemClock.elapsedRealtime() - started > 600_000) throw new IOException("Incremental update exceeded time limit");
            File target = WebFileManifest.target(staged, entry.path);
            File parent = target.getParentFile();
            if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Asset directory unavailable");
            if (same(entry, local.get(entry.path))) {
                try (InputStream input = source.open(entry.path); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32 * 1024];
                    long copied = 0;
                    for (int count; (count = input.read(buffer)) != -1;) {
                        copied += count;
                        if (copied > entry.bytes) throw new IOException("Reused file changed during assembly");
                        output.write(buffer, 0, count);
                    }
                }
            } else {
                final long before = received;
                transport.download(entry, target, (n, ignored) -> progress.update(before + n, total));
                received += entry.bytes;
            }
        }
        verifying.run();
        // Includes all copied files, even when the entire release was reused without a download.
        for (WebFileManifest.Entry entry : manifest.files) {
            WebFileManifest.verifyFile(WebFileManifest.target(staged, entry.path), entry);
        }
        try (FileOutputStream output = new FileOutputStream(new File(staged, WebFileManifest.LOCAL))) {
            output.write(manifest.payload);
        }
    }

    private static boolean same(WebFileManifest.Entry target, WebFileManifest.Entry local) {
        return local != null && target.bytes == local.bytes && target.sha256.equals(local.sha256);
    }
}
