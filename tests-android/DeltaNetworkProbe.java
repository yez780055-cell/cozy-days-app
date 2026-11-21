package com.littledays.app;

import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.util.*;
import org.json.*;

public final class DeltaNetworkProbe {
    public static void main(String[] args) throws Exception {
        File root = new File("/data/local/tmp/cozy-delta-network-" + UUID.randomUUID());
        if (!root.mkdir()) throw new IOException("test root");
        var online = new OnlineWebUpdates();
        String base = BuildConfig.WEB_UPDATE_ROOT;
        var signer = CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(
            online.files(new OnlineWebUpdates.Release(3, 135, "", new URL(base + "normal/package"), false))
                .metadata("signer.cer", 8192)));
        try {
            for (String mode : List.of("normal", "missing", "signature", "hash", "cut", "fullfail")) {
                File testRoot = new File(root, mode); testRoot.mkdir();
                var context = new DeltaUpdateProbe.TestContext(testRoot);
                WebBundles bundles = new WebBundles(context, () -> {
                    Signature verifier = Signature.getInstance("SHA256withRSA"); verifier.initVerify(signer); return verifier;
                });
                File local = new File(testRoot, "cozy-web-bundles/3-2"); local.mkdirs();
                new File(local, "assets").mkdir();
                java.nio.file.Files.write(new File(local, "index.html").toPath(), "<html>offline fixture</html>".getBytes(StandardCharsets.UTF_8));
                java.nio.file.Files.write(new File(local, "assets/font.woff2").toPath(), "unchanged font".getBytes(StandardCharsets.UTF_8));
                java.nio.file.Files.write(new File(local, "assets/app.js").toPath(), "first revision".getBytes(StandardCharsets.UTF_8));
                // Historical version without a local manifest exercises the inventory migration.
                context.state.put("shell", 3); context.state.put("web", 2);
                JSONObject catalog = new JSONObject(OnlineWebUpdates.read(new URL(base + mode + "/latest.json"), 8192, false, false));
                var release = OnlineWebUpdates.parseCatalog(catalog, 3, new URL(base + mode + "/Cozy-Days-Web-3-3.cozyupdate"), false);
                int[] full = {0};
                File prepared = null;
                try {
                    prepared = DeltaWebUpdates.prepareOrFull(
                        () -> bundles.prepareDelta(release, online.files(release), (n, total) -> {}, () -> {}),
                        bundles::discardStaged, () -> {
                            full[0]++;
                            File download = new File(testRoot, "download.cozyupdate");
                            try {
                                online.download(release, download, (n, total) -> {}, () -> {});
                                try (InputStream input = new FileInputStream(download)) { return bundles.prepareFull(input, release.web, () -> {}); }
                            } finally { download.delete(); }
                        });
                } catch (Exception error) {
                    if (!mode.equals("fullfail")) throw error;
                } finally { if (mode.equals("fullfail")) bundles.discardStaged(); }
                DeltaUpdateProbe.require(bundles.activeRevision() == 2 && local.isDirectory(), mode + " preserves stable until activation");
                DeltaUpdateProbe.require(full[0] == (mode.equals("normal") ? 0 : 1), mode + " full fallback count");
                if (mode.equals("fullfail")) {
                    DeltaUpdateProbe.require(prepared == null && !new File(testRoot, "cozy-web-bundles/staging").exists(), "both network failures leave no staging");
                } else {
                    bundles.activate(prepared, 3); bundles.beginTrial(); bundles.confirmStartup();
                    DeltaUpdateProbe.require(bundles.activeRevision() == 3 && bundles.onStartup().isDirectory(), mode + " installed directory cold-starts offline");
                }
            }
            System.out.println("PASS HTTPS delta transport, legacy inventory, signed full fallback and double-failure preservation");
        } finally { DeltaUpdateProbe.remove(root); }
    }
}
