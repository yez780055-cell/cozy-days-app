package com.littledays.app;

import android.os.SystemClock;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.json.JSONObject;

final class OnlineWebUpdates {
    static final long MAX_PACKAGE = 64L * 1024 * 1024 + 518;
    static final int MAX_CATALOG = 8 * 1024;

    interface Progress { void update(long received, long total); }

    static final class Release {
        final int web;
        final long bytes;
        final String sha256;
        final URL url;
        final boolean githubAsset;

        Release(int web, long bytes, String sha256, URL url, boolean githubAsset) {
            this.web = web;
            this.bytes = bytes;
            this.sha256 = sha256;
            this.url = url;
            this.githubAsset = githubAsset;
        }
    }

    Release check(int current, int failed, boolean prerelease) throws Exception {
        String value = BuildConfig.WEB_UPDATE_ROOT;
        int shell = BuildConfig.VERSION_CODE;
        if (value.isEmpty()) {
            return new GitHubWebReleases(shell, prerelease).check(current, failed, OnlineWebUpdates::read);
        }
        URI root = new URI(value.endsWith("/") ? value : value + "/");
        if (!"https".equals(root.getScheme()) || root.getHost() == null || root.getUserInfo() != null
                || root.getRawQuery() != null || root.getRawFragment() != null) throw new IOException("Invalid update root");
        URI catalog = root.resolve("shell-" + shell + "/");
        String payload = read(catalog.resolve("latest.json").toURL(), MAX_CATALOG, false, true);
        if (payload == null) return null;
        JSONObject json = new JSONObject(payload);
        long web = integer(json, "web");
        URL url = catalog.resolve("web-" + web + "/" + packageName(shell, web)).toURL();
        Release release = parseCatalog(json, shell, url, false);
        return release.web <= current || release.web == failed ? null : release;
    }

    static String packageName(int shell, long web) {
        return "Cozy-Days-Web-" + shell + "-" + web + ".cozyupdate";
    }

    static Release parseCatalog(JSONObject json, int shell, URL url, boolean githubAsset) throws Exception {
        long web = integer(json, "web");
        long bytes = integer(json, "bytes");
        String sha256 = json.getString("sha256");
        if (integer(json, "schema") != 1 || integer(json, "shell") != shell || web < 2
                || web > Integer.MAX_VALUE || bytes < 135 || bytes > MAX_PACKAGE
                || !sha256.matches("[a-f0-9]{64}")) throw new IOException("Invalid release catalog");
        return new Release((int) web, bytes, sha256, url, githubAsset);
    }

    static String read(URL url, int limit, boolean githubAsset, boolean optional) throws Exception {
        long start = SystemClock.elapsedRealtime();
        HttpsURLConnection connection = response(url, 8_000, githubAsset);
        try {
            int status = connection.getResponseCode();
            if (status == 404 && optional) return null;
            if (status != 200) throw new IOException("Release metadata unavailable");
            try (var input = connection.getInputStream(); var output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                for (int n; (n = input.read(buffer)) != -1;) {
                    if (output.size() + n > limit || SystemClock.elapsedRealtime() - start > 15_000) {
                        throw new IOException("Release metadata exceeded limits");
                    }
                    output.write(buffer, 0, n);
                }
                return output.toString("UTF-8");
            }
        } finally {
            connection.disconnect();
        }
    }

    void download(Release release, File destination, Progress progress, Runnable onDownloadComplete) throws Exception {
        HttpsURLConnection connection = response(release.url, 15_000, release.githubAsset);
        var digest = MessageDigest.getInstance("SHA-256");
        long start = SystemClock.elapsedRealtime();
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Package unavailable");
            String length = connection.getHeaderField("Content-Length");
            if (length != null && Long.parseLong(length) != release.bytes) throw new IOException("Incorrect package length");
            try (var input = connection.getInputStream(); var output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[32 * 1024];
                long received = 0;
                long last = start;
                for (int n; (n = input.read(buffer)) != -1;) {
                    received += n;
                    long now = SystemClock.elapsedRealtime();
                    if (received > release.bytes || now - start > 600_000) throw new IOException("Package download exceeded limits");
                    output.write(buffer, 0, n);
                    digest.update(buffer, 0, n);
                    if (now - last >= 100 || received == release.bytes) {
                        progress.update(received, release.bytes);
                        last = now;
                    }
                }
                if (received != release.bytes) throw new IOException("Package download ended early");
            }
        } finally {
            connection.disconnect();
        }
        onDownloadComplete.run();
        byte[] expected = new byte[32];
        for (int i = 0; i < expected.length; i++) expected[i] = (byte) Integer.parseInt(release.sha256.substring(i * 2, i * 2 + 2), 16);
        if (!MessageDigest.isEqual(expected, digest.digest())) throw new SecurityException("网页包 SHA-256 校验失败。");
    }

    DeltaWebUpdates.Transport files(Release release) {
        return new DeltaWebUpdates.Transport() {
            private URL url(String name) throws Exception {
                // Names are fixed protocol names or file-<SHA256>; never manifest-supplied URLs.
                return new URL(release.url, name);
            }
            public byte[] metadata(String name, int limit) throws Exception {
                HttpsURLConnection connection = response(url(name), 8_000, release.githubAsset);
                long start = SystemClock.elapsedRealtime();
                try {
                    if (connection.getResponseCode() != 200) throw new IOException("Incremental metadata unavailable");
                    try (var input = connection.getInputStream(); var output = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[8192];
                        for (int n; (n = input.read(buffer)) != -1;) {
                            if (output.size() + n > limit || SystemClock.elapsedRealtime() - start > 15_000) {
                                throw new IOException("Incremental metadata exceeded limits");
                            }
                            output.write(buffer, 0, n);
                        }
                        return output.toByteArray();
                    }
                } finally { connection.disconnect(); }
            }
            public void download(WebFileManifest.Entry entry, File target, Progress progress) throws Exception {
                // Same HTTPS redirect, byte limits, identity encoding and SHA-256 checks as full packages.
                OnlineWebUpdates.this.download(new Release(release.web, entry.bytes, entry.sha256,
                    url(entry.objectName()), release.githubAsset), target, progress, () -> {});
            }
        };
    }

    static long integer(JSONObject json, String key) throws Exception {
        Object value = json.get(key);
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new IOException("Invalid catalog number");
        return ((Number) value).longValue();
    }

    private static HttpsURLConnection response(URL url, int timeout, boolean githubAsset) throws Exception {
        for (int redirects = 0; redirects <= 3; redirects++) {
            HttpsURLConnection connection = open(url, timeout);
            boolean keep = false;
            try {
                int status = connection.getResponseCode();
                if (!githubAsset || (status != 301 && status != 302 && status != 303 && status != 307 && status != 308)) {
                    keep = true;
                    return connection;
                }
                url = GitHubWebReleases.assetRedirect(url.toURI(), connection.getHeaderField("Location")).toURL();
            } finally {
                if (!keep) connection.disconnect();
            }
        }
        throw new IOException("Too many GitHub asset redirects");
    }

    private static HttpsURLConnection open(URL url, int timeout) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(timeout);
        connection.setReadTimeout(timeout);
        connection.setUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("User-Agent", "Cozy-Days-Android/" + BuildConfig.VERSION_CODE);
        if ("api.github.com".equals(url.getHost())) {
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        }
        if (!BuildConfig.WEB_UPDATE_QA_CA.isEmpty() && "127.0.0.1".equals(url.getHost())) {
            var ca = CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(
                BuildConfig.WEB_UPDATE_QA_CA.getBytes(StandardCharsets.US_ASCII)));
            var store = KeyStore.getInstance(KeyStore.getDefaultType());
            store.load(null, null);
            store.setCertificateEntry("cozy-update-qa", ca);
            var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            trust.init(store);
            SSLContext tls = SSLContext.getInstance("TLS");
            tls.init(null, trust.getTrustManagers(), null);
            connection.setSSLSocketFactory(tls.getSocketFactory());
        }
        return connection;
    }
}
