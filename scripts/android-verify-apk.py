"""Verify the signed, universal offline APK and write public release evidence."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile
from urllib.parse import unquote, urlsplit


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--output", type=Path, default=Path("artifacts/android"))
    args = parser.parse_args()
    code = os.environ.get("ANDROID_VERSION_CODE", "1")
    require(re.fullmatch(r"[1-9][0-9]*", code) and int(code) <= 2100000000,
            "ANDROID_VERSION_CODE must be a positive integer <= 2100000000")
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    require(sdk, "Set ANDROID_HOME or ANDROID_SDK_ROOT")
    tools = Path(sdk) / "build-tools" / "35.0.0"
    aapt = str(tools / ("aapt.exe" if os.name == "nt" else "aapt"))
    apksigner = str(tools / ("apksigner.bat" if os.name == "nt" else "apksigner"))
    signature = run(apksigner, "verify", "--verbose", "--print-certs", str(args.apk))
    require("CN=Android Debug" not in signature, "Refusing Android debug certificate")
    fingerprints = re.findall(r"Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)", signature)
    require(len(fingerprints) == 1, "Expected exactly one verified signer")
    require(fingerprints[0].upper() == "C85FE70FFF2425AD2B95D3DFA8F28EF7173027E744B03F57B721896FCA40D3D8",
            "Release certificate differs from the pinned long-term signing identity")
    badging = run(aapt, "dump", "badging", str(args.apk))
    package = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.M)
    require(package and package.groups() == ("com.littledays.app", code, "0.2.1"),
            "Unexpected application ID or release version")
    require("application-debuggable" not in badging and " split=" not in badging,
            "Expected a non-debuggable universal APK")
    permissions_text = run(aapt, "dump", "permissions", str(args.apk))
    permissions = sorted(set(re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'", permissions_text)))
    # AndroidX Core contributes its app-scoped receiver guard to the merged manifest.
    allowed_permissions = {"android.permission.INTERNET",
                           "com.littledays.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
    require("android.permission.INTERNET" in permissions and set(permissions) <= allowed_permissions,
            f"Unexpected permissions: {permissions}")
    with zipfile.ZipFile(args.apk) as archive:
        names = set(archive.namelist())
        require("assets/public/index.html" in names, "Missing bundled index.html")
        config = json.loads(archive.read("assets/capacitor.config.json"))
        require(config.get("appId") == "com.littledays.app", "Unexpected Capacitor appId")
        require(not config.get("server", {}).get("url"), "Remote Capacitor server.url is forbidden")
        # Keep the Capacitor default origin used by existing installations.
        server = config.get("server", {})
        require(server.get("hostname", "localhost") == "localhost" and
                server.get("androidScheme", "https") == "https", "Unexpected Capacitor origin")
        html = archive.read("assets/public/index.html").decode("utf-8")
        refs = re.findall(r'''(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']''', html)
        require(any(urlsplit(ref).path.endswith(".js") for ref in refs) and
                any(urlsplit(ref).path.endswith(".css") for ref in refs), "Missing index JS/CSS references")
        for ref in refs:
            parsed = urlsplit(ref)
            require(not parsed.scheme and not parsed.netloc, f"Remote web resource: {ref}")
            relative = PurePosixPath(unquote(parsed.path).lstrip("/"))
            require(".." not in relative.parts and f"assets/public/{relative}" in names,
                    f"Missing bundled web resource: {ref}")
        native_abis = sorted({name.split("/")[1] for name in names if name.startswith("lib/")})
        require(not native_abis or {"arm64-v8a", "armeabi-v7a", "x86", "x86_64"}.issubset(native_abis),
                f"Incomplete ABI coverage: {native_abis}")
    source = run("git", "rev-parse", "HEAD").strip()
    args.output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    (args.output / "SHA256SUMS").write_text(f"{digest}  {args.apk.name}\n", encoding="utf-8")
    (args.output / "certificate.txt").write_text(signature, encoding="utf-8")
    (args.output / "aapt-badging.txt").write_text(badging, encoding="utf-8")
    (args.output / "release.json").write_text(json.dumps({
        "sourceSha": source, "applicationId": package[1], "versionCode": int(code),
        "versionName": package[3], "sha256": digest, "certificateSha256": fingerprints[0],
        "permissions": permissions, "nativeAbis": native_abis,
        "buildTools": "35.0.0", "githubRunId": os.environ.get("GITHUB_RUN_ID"),
        "deviceSmokeTest": "not performed",
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {args.apk.name}: {package[1]} {package[3]} ({code}), source {source}")


if __name__ == "__main__":
    main()
