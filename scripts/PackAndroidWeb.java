import java.io.DataOutputStream;
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

// Run with JDK 21 after npm run build:android. Signing credentials come from the experiment environment.
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
            var keys = KeyStore.getInstance("PKCS12");
            try (var input = Files.newInputStream(Path.of(env("COZY_EXPERIMENT_KEYSTORE")))) {
                keys.load(input, env("COZY_EXPERIMENT_STORE_PASSWORD").toCharArray());
            }
            var key = (PrivateKey) keys.getKey(env("COZY_EXPERIMENT_KEY_ALIAS"), env("COZY_EXPERIMENT_KEY_PASSWORD").toCharArray());
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
            if (args.length == 5) writeRelease(Path.of(args[4]), output, shell, revision);
        } finally {
            Files.deleteIfExists(archive);
        }
    }

    private static void writeRelease(Path root, Path output, int shell, int web) throws Exception {
        Path shellRoot = root.resolve("shell-" + shell);
        Files.createDirectories(shellRoot);
        Path revisionRoot = shellRoot.resolve("web-" + web);
        Files.createDirectory(revisionRoot);
        String filename = "Cozy-Days-Web-" + shell + "-" + web + ".cozyupdate";
        Path archive = Files.copy(output, revisionRoot.resolve(filename));
        String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(archive)));
        String page = Files.readString(Path.of("scripts/android-web-download.html"))
            .replace("__WEB_REVISION__", Integer.toString(web))
            .replace("__PACKAGE_NAME__", filename)
            .replace("__SHA256__", sha256)
            .replace("__PACKAGE_SIZE__", Long.toString(Files.size(archive)));
        Files.writeString(revisionRoot.resolve("download.html"), page);
        Path feed = Files.createTempFile(shellRoot, "latest-", ".tmp");
        try {
            Files.writeString(feed, "{\"schema\":1,\"shell\":" + shell + ",\"web\":" + web + ",\"sha256\":\"" + sha256 + "\"}\n");
            Files.move(feed, shellRoot.resolve("latest.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(feed);
        }
    }

    private static String env(String name) {
        return Objects.requireNonNull(System.getenv(name), name + " is required");
    }

    private static void addFile(ZipOutputStream zip, Path dist, Path path) throws Exception {
        String name = dist.relativize(path).toString().replace('\\', '/');
        if (!name.equals("index.html") && !name.matches("(assets|icons)/[A-Za-z0-9][A-Za-z0-9._/-]*")) {
            throw new IllegalArgumentException("Unexpected web asset path " + name);
        }
        zip.putNextEntry(new ZipEntry(name));
        Files.copy(path, zip);
        zip.closeEntry();
    }
}
