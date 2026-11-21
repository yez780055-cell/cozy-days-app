package com.littledays.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Has no runtime references to the new updater, so it also runs against archived APKs. */
@RunWith(AndroidJUnit4.class)
public class AndroidDeltaSeedTest {
    final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    @Test public void seedPersistentWebData() throws Exception {
        var activity = instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView view = ((BridgeActivity) activity).getBridge().getWebView();
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
            while (!evaluate(view, "!!document.querySelector('.phone')").equals("true")) {
                assertTrue(System.nanoTime() < end); Thread.sleep(100);
            }
            assertEquals("https://localhost", evaluate(view, "location.origin"));
            // DATA is a compile-time String constant; javac inlines it into this independent class.
            evaluate(view, "localStorage.setItem('cozy-delta-upgrade-qa','synthetic-old-apk');"
                + AndroidDeltaReleaseTest.DATA.replace("__MODE__", "create"));
            end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (!evaluate(view, "window.__deltaData").equals("PASS")) {
                assertTrue(System.nanoTime() < end); Thread.sleep(100);
            }
            // Chromium batches localStorage writes. Do not terminate instrumentation before its disk flush.
            Thread.sleep(6_000);
            assertEquals("synthetic-old-apk", evaluate(view, "localStorage.getItem('cozy-delta-upgrade-qa')"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
    String evaluate(WebView view, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue(done.await(10, TimeUnit.SECONDS));
        return String.valueOf(new JSONTokener(result.get()).nextValue());
    }
}
