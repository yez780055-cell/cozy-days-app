import java.io.DataOutputStream;
import java.io.File;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.List;
import java.util.HexFormat;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.util.zip.ZipInputStream;

// Run with JDK 21 after npm run build:android. Signing credentials use the same environment as the APK.
class PackAndroidWeb {
    public static void main(String[] args) throws Exception {
        if (args.length < 4 || args.length > 5) {
            throw new IllegalArgumentException("Usage: java scripts/PackAndroidWeb.java <dist> <shell-code> <web-revision> <output.cozyupdate> [release-root]");
        }
        Path dist = Path.of(args[0]);
        int shell = Integer.parseInt(args[1]);
        int revision = Integer.parseInt(args[2]);
        Path output = Path.of(args[3]);
        if (shell < 1 || revision < 2) throw new IllegalArgumentException("Invalid shell or web revision");
        Files.createDirectories(output.toAbsolutePath().getParent());
        Path archive = Files.createTempFile("cozy-web", ".zip");
        try {
            try (var zip = new ZipOutputStream(Files.newOutputStream(archive))) {
                addFile(zip, dist, dist.resolve("index.html"));
                for (String folder : List.of("assets", "icons")) {
                    try (var paths = Files.walk(dist.resolve(folder))) {
                        for (Path path : paths.filter(Files::isRegularFile).sorted().toList()) addFile(zip, dist, path);
                    }
                }
                zip.putNextEntry(new ZipEntry("cozy-update.json"));
                zip.write(("{\"shell\":" + shell + ",\"web\":" + revision + "}").getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            byte[] data = Files.readAllBytes(archive);
            if (data.length > 64 * 1024 * 1024) throw new IllegalArgumentException("Web bundle exceeds 64 MiB");
            boolean formal = System.getenv("ANDROID_KEYSTORE_PATH") != null;
            var names = formal
                ? List.of("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
                : List.of("COZY_EXPERIMENT_KEYSTORE", "COZY_EXPERIMENT_STORE_PASSWORD", "COZY_EXPERIMENT_KEY_ALIAS", "COZY_EXPERIMENT_KEY_PASSWORD");
            var keys = KeyStore.getInstance(new File(env(names.get(0))), env(names.get(1)).toCharArray());
            String alias = env(names.get(2));
            if (formal) {
                var fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(keys.getCertificate(alias).getEncoded()));
                if (!fingerprint.equals("c85fe70fff2425ad2b95d3dfa8f28ef7173027e744b03f57b721896fca40d3d8")) {
                    throw new IllegalArgumentException("Incorrect formal Android signing certificate");
                }
            }
            var key = (PrivateKey) keys.getKey(alias, env(names.get(3)).toCharArray());
            var signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(key);
            signer.update(data);
            byte[] signature = signer.sign();
            try (var packaged = new DataOutputStream(Files.newOutputStream(output))) {
                packaged.writeInt(0x434F5A31);
                packaged.writeShort(signature.length);
                packaged.write(signature);
                packaged.write(data);
            }
            if (args.length == 5) writeRelease(Path.of(args[4]), output, shell, revision, data, key);
        } finally {
            Files.deleteIfExists(archive);
        }
    }

    private static void writeRelease(Path root, Path output, int shell, int web, byte[] payload, PrivateKey key) throws Exception {
        Path shellRoot = root.resolve("shell-" + shell);
        Files.createDirectories(shellRoot);
        Path revisionRoot = shellRoot.resolve("web-" + web);
        Files.createDirectory(revisionRoot);
        String filename = "Cozy-Days-Web-" + shell + "-" + web + ".cozyupdate";
        Path archive = Files.copy(output, revisionRoot.resolve(filename));
        String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(archive)));
        writeDelta(revisionRoot, payload, key, shell, web, Files.size(archive), sha256);
        String page = Files.readString(Path.of("scripts/android-web-download.html"))
            .replace("__WEB_REVISION__", Integer.toString(web))
            .replace("__PACKAGE_NAME__", filename)
            .replace("__SHA256__", sha256)
            .replace("__PACKAGE_SIZE__", Long.toString(Files.size(archive)));
        Files.writeString(revisionRoot.resolve("download.html"), page);
        Path feed = Files.createTempFile(shellRoot, "latest-", ".tmp");
        try {
            Files.writeString(feed, "{\"schema\":1,\"shell\":" + shell + ",\"web\":" + web + ",\"bytes\":" + Files.size(archive)
                + ",\"sha256\":\"" + sha256 + "\"}\n");
            Files.move(feed, shellRoot.resolve("latest.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(feed);
        }
    }

    private static void writeDelta(Path root, byte[] archive, PrivateKey key, int shell, int web,
            long packageBytes, String packageSha256) throws Exception {
        var entries = new java.util.ArrayList<String>();
        long total = 0;
        // Derive both the manifest and objects from the signed ZIP, never from a second build/read.
        try (var zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                if (entry.getName().equals("cozy-update.json")) continue;
                byte[] bytes = zip.readAllBytes();
                total += bytes.length;
                if (total > 96L * 1024 * 1024 || entries.size() >= 1_999) throw new IllegalArgumentException("Web files exceed limits");
                String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                Path object = root.resolve("file-" + hash);
                if (!Files.exists(object)) Files.write(object, bytes);
                entries.add("{\"path\":\"" + entry.getName() + "\",\"bytes\":" + bytes.length + ",\"sha256\":\"" + hash + "\"}");
            }
        }
        String manifest = "{\"schema\":1,\"shell\":" + shell + ",\"web\":" + web
            + ",\"packageBytes\":" + packageBytes + ",\"packageSha256\":\"" + packageSha256
            + "\",\"files\":[" + String.join(",", entries) + "]}\n";
        byte[] bytes = manifest.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 512 * 1024) throw new IllegalArgumentException("File manifest exceeds limits");
        var signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(key);
        signer.update(bytes);
        Files.write(root.resolve("web-manifest.json"), bytes);
        Files.write(root.resolve("web-manifest.sig"), signer.sign());
    }

    private static String env(String name) {
        return Objects.requireNonNull(System.getenv(name), name + " is required");
    }

    private static void addFile(ZipOutputStream zip, Path dist, Path path) throws Exception {
        String name = dist.relativize(path).toString().replace('\\', '/');
        if (!name.equals("index.html") && !name.matches("(assets|icons)/[A-Za-z0-9][A-Za-z0-9._/-]*")) {
            throw new IllegalArgumentException("Unexpected web asset path " + name);
        }
        for (String segment : name.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) throw new IllegalArgumentException("Unsafe asset path");
        }
        zip.putNextEntry(new ZipEntry(name));
        Files.copy(path, zip);
        zip.closeEntry();
    }
}
