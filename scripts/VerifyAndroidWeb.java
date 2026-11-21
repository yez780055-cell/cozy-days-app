import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.HexFormat;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;

// Independently verify a downloaded web update with the archived, accepted formal APK.
class VerifyAndroidWeb {
    private static final String APK_SHA = "ed013395ce76df4c16f2aa93cd8b0bf28a970ea408423d97b0f91e030036d7a9";
    private static final String CERT_SHA = "c85fe70fff2425ad2b95d3dfa8f28ef7173027e744b03f57b721896fca40d3d8";

    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("Usage: java scripts/VerifyAndroidWeb.java <formal.apk> <download.cozyupdate> <shell> <web>");
        byte[] apk = Files.readAllBytes(Path.of(args[0]));
        require(sha(apk).equals(APK_SHA), "Archived formal APK hash differs from accepted APK");
        Certificate signer = null;
        try (var zip = new ZipFile(args[0])) {
            for (var entry : zip.stream().filter(e -> e.getName().matches("META-INF/[^/]+\\.RSA")).toList()) {
                try (var input = zip.getInputStream(entry)) {
                    for (var cert : CertificateFactory.getInstance("X.509").generateCertificates(input)) {
                        if (sha(cert.getEncoded()).equals(CERT_SHA)) signer = cert;
                    }
                }
            }
        }
        require(signer != null, "Pinned formal signer not found in accepted APK");
        byte[] packaged = Files.readAllBytes(Path.of(args[1]));
        byte[] signature, payload;
        try (var input = new DataInputStream(new ByteArrayInputStream(packaged))) {
            require(input.readInt() == 0x434F5A31, "Invalid COZ1 header");
            int length = input.readUnsignedShort();
            require(length > 0 && length <= 8192, "Invalid signature length");
            signature = input.readNBytes(length);
            payload = input.readAllBytes();
        }
        var verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(signer);
        verifier.update(payload);
        require(verifier.verify(signature), "Web update signature differs from formal APK signer");
        String expected = "{\"shell\":" + Integer.parseInt(args[2]) + ",\"web\":" + Integer.parseInt(args[3]) + "}";
        boolean manifest = false, index = false;
        int files = 0;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(payload))) {
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                String name = entry.getName();
                require(!name.contains("..") && !name.startsWith("/") && !name.contains("\\"), "Unsafe archive path");
                if (name.equals("cozy-update.json")) {
                    require(new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).equals(expected), "Incorrect shell or revision");
                    manifest = true;
                } else if (name.equals("index.html")) index = true;
                else require(name.startsWith("assets/") || name.startsWith("icons/"), "Unexpected archive entry");
                files++;
            }
        }
        require(index && manifest, "Missing startup document or version manifest");
        System.out.println("PASS formal APK hash, pinned certificate, RSA signature, safe archive and shell/web");
        System.out.println("bytes=" + packaged.length + " sha256=" + sha(packaged) + " files=" + files);
    }

    private static String sha(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static void require(boolean valid, String message) {
        if (!valid) throw new IllegalArgumentException(message);
    }
}
