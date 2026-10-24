package com.littledays.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs only on a fresh CI emulator; never target a personal device. */
@RunWith(AndroidJUnit4.class)
public class AndroidReleaseUpgradeTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private String evaluate(WebView webView, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(script, result -> {
            value.set(result);
            done.countDown();
        }));
        assertTrue("WebView callback timed out", done.await(10, TimeUnit.SECONDS));
        Object decoded = new JSONTokener(value.get()).nextValue();
        return String.valueOf(decoded);
    }

    @Test
    public void syntheticIndexedDbSurvivesSignedUpgrade() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("phase");
        assertTrue("Expected create or verify phase", "create".equals(phase) || "verify".equals(phase));
        assertEquals("com.littledays.app", instrumentation.getTargetContext().getPackageName());
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        try {
            WebView webView = ((BridgeActivity) activity).getBridge().getWebView();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
            while (!"true".equals(evaluate(webView, "!!document.querySelector('nav[aria-label=\"应用模块\"]')"))) {
                assertTrue("Bundled app did not start", System.nanoTime() < deadline);
                Thread.sleep(250);
            }
            assertEquals("https://localhost", evaluate(webView, "location.origin"));
            evaluate(webView, DATA_SCRIPT.replace("__PHASE__", phase));
            deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            String status;
            do {
                status = evaluate(webView, "window.__androidUpgradeStatus || 'WAIT'");
                if (status.startsWith("ERROR:")) fail(status);
                if ("PASS".equals(status)) break;
                assertTrue("IndexedDB check timed out: " + status, System.nanoTime() < deadline);
                Thread.sleep(250);
            } while (true);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static final String DATA_SCRIPT = """
        window.__androidUpgradeStatus = 'WAIT';
        (async () => {
          const phase = '__PHASE__';
          const check = (ok, message) => { if (!ok) throw new Error(message); };
          const wait = async fn => {
            for (let n = 0; n < 120; n++) {
              if (fn()) return;
              await new Promise(r => setTimeout(r, 250));
            }
            throw new Error('App module did not become ready');
          };
          // Let the application open its own existing schema; this test never upgrades it.
          document.querySelector('nav button[aria-label="生理期"]').click();
          await wait(() => document.querySelector('.period-content'));
          const open = name => new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Missing app database: ' + name)); };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          const read = (db, store, key) => new Promise((resolve, reject) => {
            const request = db.transaction(store).objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const write = (db, store, row) => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).add(row);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Write aborted'));
          });
          const days = await open('little-days');
          const period = await open('cozy-days-period');
          try {
            const id = 987654;
            const todo = {id, text:'CI synthetic upgrade todo', date:'2026-01-02', completed:false,
              createdAt:1767312000000, categoryId:'life'};
            const anniversary = {id, name:'CI synthetic anniversary', date:'2026-01-02', theme:'生活',
              note:'CI emulator only', icon:'♡', yearly:true, color:'pink', createdAt:1767312000000, updatedAt:1767312000000};
            const state = {id:'local', value:{periods:[{id:'ci-upgrade',start:'2026-01-02',end:'2026-01-06'}],
              days:{'2026-01-02':{date:'2026-01-02',symptoms:['CI synthetic'],mood:'CI synthetic'}},
              settings:{cycleLength:28,periodLength:5}}};
            if (phase === 'create') {
              check(!(await read(days,'todos',id)), 'Refusing to overwrite todo');
              check(!(await read(days,'anniversaries',id)), 'Refusing to overwrite anniversary');
              check(!(await read(period,'state','local')), 'Refusing to overwrite period data');
              await write(days,'todos',todo);
              await write(days,'anniversaries',anniversary);
              await write(period,'state',state);
            }
            const savedTodo = await read(days,'todos',id);
            check(savedTodo && Object.keys(todo).every(k => savedTodo[k] === todo[k]), 'Todo did not survive');
            check(JSON.stringify(await read(days,'anniversaries',id)) === JSON.stringify(anniversary), 'Anniversary did not survive');
            check(JSON.stringify(await read(period,'state','local')) === JSON.stringify(state), 'Period state did not survive');
          } finally { days.close(); period.close(); }
          window.__androidUpgradeStatus = 'PASS';
        })().catch(error => { window.__androidUpgradeStatus = 'ERROR: ' + error.message; });
        """;
}
