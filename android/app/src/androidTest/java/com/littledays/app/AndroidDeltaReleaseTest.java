package com.littledays.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Explicit final-candidate test, only on a disposable emulator with signed fixture assets. */
@RunWith(AndroidJUnit4.class)
public class AndroidDeltaReleaseTest {
    final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    MainActivity activity;

    @Test public void signedCandidateUpdatesRollbackAndOfflineData() throws Exception {
        assertEquals(3, instrumentation.getTargetContext().getPackageManager()
            .getPackageInfo(instrumentation.getTargetContext().getPackageName(), 0).versionCode);
        start();
        assertEquals("synthetic-old-apk", evaluate("localStorage.getItem('cozy-delta-upgrade-qa')"));
        checkData();
        File fixtures = new File(instrumentation.getTargetContext().getExternalFilesDir(null), "delta-fixtures");
        for (int revision : new int[]{2, 3}) {
            File version = new File(fixtures, "releases/shell-3/web-" + revision);
            File archive = new File(version, OnlineWebUpdates.packageName(3, revision));
            String hash;
            try (InputStream input = new FileInputStream(archive)) { hash = WebFileManifest.hash(input); }
            var release = new OnlineWebUpdates.Release(revision, archive.length(), hash, null, false);
            List<String> downloaded = new ArrayList<>();
            int[] full = {0};
            DeltaWebUpdates.Transport transport = new DeltaWebUpdates.Transport() {
                public byte[] metadata(String name, int limit) throws Exception {
                    byte[] bytes = Files.readAllBytes(new File(version, name).toPath());
                    if (revision == 3 && name.equals(WebFileManifest.SIGNATURE)) bytes[0] ^= 1;
                    return bytes;
                }
                public void download(WebFileManifest.Entry entry, File target, OnlineWebUpdates.Progress progress) throws Exception {
                    downloaded.add(entry.path);
                    Files.copy(new File(version, entry.objectName()).toPath(), target.toPath());
                    progress.update(entry.bytes, entry.bytes);
                }
            };
            int before = activity.bundles().activeRevision();
            File staged = DeltaWebUpdates.prepareOrFull(
                () -> activity.bundles().prepareDelta(release, transport, (n, total) -> {}, () -> {}),
                activity.bundles()::discardStaged, () -> {
                    full[0]++;
                    try (InputStream input = new FileInputStream(archive)) {
                        return activity.bundles().prepareFull(input, revision, () -> {});
                    }
                });
            assertEquals(before, activity.bundles().activeRevision());
            assertEquals(revision == 2 ? List.of("index.html") : List.of(), downloaded);
            assertEquals(revision == 3 ? 1 : 0, full[0]);
            File active = activity.bundles().activate(staged, revision);
            instrumentation.runOnMainSync(() -> activity.reloadBundle(active));
            await(() -> !activity.bundles().isPending(), 25);
            assertEquals(revision, activity.bundles().activeRevision());
            checkData();
        }
        // Signed page intentionally never calls ready(): the real 15-second timer must roll it back.
        installLocal(new File(fixtures, "local-web-4.cozyupdate"));
        await(() -> activity.bundles().activeRevision() == 3 && !activity.bundles().isPending(), 30);
        checkData();
        // Same installer used by the manual file picker, while the device has no network.
        installLocal(new File(fixtures, "local-web-5.cozyupdate"));
        await(() -> activity.bundles().activeRevision() == 5 && !activity.bundles().isPending(), 25);
        checkData();
        instrumentation.runOnMainSync(activity::finish);
        start();
        assertEquals(5, activity.bundles().activeRevision());
        checkData();
        activity.bundles().reset();
        instrumentation.runOnMainSync(() -> activity.reloadBundle(null));
        await(() -> evaluate("!!document.querySelector('.phone')").equals("true"), 25);
        assertEquals(1, activity.bundles().activeRevision());
        checkData();
        instrumentation.runOnMainSync(activity::finish);
    }

    void installLocal(File file) throws Exception {
        File active;
        try (InputStream input = new FileInputStream(file)) { active = activity.bundles().install(input, null, () -> {}); }
        instrumentation.runOnMainSync(() -> activity.reloadBundle(active));
    }
    void start() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity) instrumentation.startActivitySync(intent);
        await(() -> evaluate("!!document.querySelector('.phone')").equals("true"), 45);
        assertEquals("https://localhost", evaluate("location.origin"));
    }
    void checkData() throws Exception {
        evaluate(DATA.replace("__MODE__", "verify"));
        await(() -> evaluate("window.__deltaData").equals("PASS"), 15);
        assertEquals("synthetic-old-apk", evaluate("localStorage.getItem('cozy-delta-upgrade-qa')"));
    }
    interface Check { boolean ready() throws Exception; }
    void await(Check check, int seconds) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (!check.ready()) { assertTrue("Candidate did not become ready", System.nanoTime() < end); Thread.sleep(100); }
    }
    String evaluate(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script,
            value -> { result.set(value); done.countDown(); }));
        assertTrue(done.await(10, TimeUnit.SECONDS));
        return String.valueOf(new JSONTokener(result.get()).nextValue());
    }
    static final String DATA = """
        window.__deltaData='WAIT';
        (()=>{
          const request=indexedDB.open('cozy-delta-release-qa',1);
          request.onupgradeneeded=()=>request.result.createObjectStore('records');
          request.onerror=()=>window.__deltaData='ERROR';
          request.onsuccess=()=>{
            const db=request.result;
            const expected=JSON.stringify({todo:'synthetic todo',anniversary:'synthetic anniversary',period:'synthetic period',cache:'synthetic account cache'});
            const tx=db.transaction('records','__MODE__'==='create'?'readwrite':'readonly');
            const store=tx.objectStore('records');
            const value=store.get('seed');
            let valid=false;
            value.onsuccess=()=>{
              if('__MODE__'==='create'&&value.result===undefined){store.add(expected,'seed');valid=true;}
              else valid=value.result===expected;
            };
            tx.oncomplete=()=>{window.__deltaData=valid?'PASS':'MISMATCH';db.close();};
            tx.onerror=()=>{window.__deltaData='ERROR';db.close();};
          };
        })();
        """;
}
