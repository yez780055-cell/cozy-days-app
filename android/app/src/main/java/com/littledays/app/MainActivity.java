package com.littledays.app;

import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.ServerPath;
import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final long STARTUP_TIMEOUT_MS = 15_000;
    private JSObject safeArea;
    private SplashScreenViewProvider startupSplash;
    private boolean webReady;
    private WebBundles bundles;
    private int startupToken;
    private final Runnable startupTimeout = this::recoverStartup;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this).setOnExitAnimationListener(splash -> {
            if (webReady) splash.remove();
            else startupSplash = splash;
        });
        bundles = new WebBundles(this);
        File active = bundles.onStartup();
        if (active != null) {
            bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.BASE_PATH, active.getAbsolutePath()));
        }
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(AndroidShellPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) {
            dismissStartupSplash();
            return;
        }
        configureWindow();

        var webView = bridge.getWebView();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                var insets = ViewCompat.getRootWindowInsets(webView);
                if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                    WindowCompat.getInsetsController(getWindow(), webView).hide(WindowInsetsCompat.Type.ime());
                    return;
                }
                webView.evaluateJavascript("dispatchEvent(new Event('cozy-android-back'))", null);
            }
        });
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            var area = updateSafeArea(insets);
            webView.evaluateJavascript("dispatchEvent(new CustomEvent('cozy-safe-area',{detail:" + area + "}))", null);
            return ViewCompat.onApplyWindowInsets(view, insets);
        });
        ViewCompat.requestApplyInsets(webView);
        webView.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
    }

    @SuppressWarnings("deprecation")
    private void configureWindow() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Build.VERSION.SDK_INT < 26 ? Color.BLACK : Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 28) {
            var attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        setBarIcons(true, true);
    }

    JSObject getSafeArea() {
        var insets = ViewCompat.getRootWindowInsets(bridge.getWebView());
        if (insets != null) return updateSafeArea(insets);
        return safeArea == null ? new JSObject().put("top", 0).put("right", 0).put("bottom", 0)
            .put("left", 0).put("keyboardVisible", false).put("keyboardViewportHeight", 0) : safeArea;
    }

    private JSObject updateSafeArea(WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets gestures = insets.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures());
        float density = getResources().getDisplayMetrics().density;
        boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
        int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
        int bottom = keyboardVisible && imeBottom > 0 ? 0 : Math.max(bars.bottom, gestures.bottom);
        int keyboardViewportHeight = keyboardVisible && imeBottom > 0 ? keyboardViewportHeight(imeBottom) : 0;
        safeArea = new JSObject()
            .put("top", Math.ceil(bars.top / density))
            .put("right", Math.ceil(bars.right / density))
            .put("bottom", Math.ceil(bottom / density))
            .put("left", Math.ceil(bars.left / density))
            .put("keyboardVisible", keyboardVisible)
            .put("keyboardViewportHeight", Math.floor(keyboardViewportHeight / density));
        return safeArea;
    }

    private int keyboardViewportHeight(int imeInset) {
        var webView = bridge.getWebView();
        int[] location = new int[2];
        webView.getLocationOnScreen(location);
        int visibleBottom;
        if (Build.VERSION.SDK_INT >= 30) {
            visibleBottom = getWindowManager().getCurrentWindowMetrics().getBounds().bottom - imeInset;
        } else {
            Rect visible = new Rect();
            webView.getWindowVisibleDisplayFrame(visible);
            visibleBottom = visible.bottom;
        }
        return Math.max(0, visibleBottom - location[1]);
    }

    void homeBack(boolean exit) {
        if (exit) finish();
        else Toast.makeText(this, R.string.back_to_exit, Toast.LENGTH_SHORT).show();
    }

    private void setBarIcons(boolean darkStatus, boolean darkNavigation) {
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(darkStatus);
        controller.setAppearanceLightNavigationBars(darkNavigation);
    }

    WebBundles bundles() {
        return bundles;
    }

    int startupToken() { return startupToken; }

    boolean pageReady(int token, boolean darkStatus, boolean darkNavigation) {
        if (token != startupToken) return false;
        setBarIcons(darkStatus, darkNavigation);
        try {
            bundles.confirmStartup();
        } catch (IllegalStateException error) {
            android.util.Log.e("CozyDays", "Could not confirm the web bundle", error);
            recoverStartup();
            return false;
        }
        bridge.getWebView().removeCallbacks(startupTimeout);
        dismissStartupSplash();
        return true;
    }

    void reloadBundle(File directory) {
        var webView = bridge.getWebView();
        startupToken++;
        webView.removeCallbacks(startupTimeout);
        try {
            bundles.beginTrial();
        } catch (IllegalStateException error) {
            android.util.Log.e("CozyDays", "Could not start the web bundle trial", error);
            recoverStartup();
            return;
        }
        if (directory == null) bridge.setServerAssetPath("public");
        else bridge.setServerBasePath(directory.getAbsolutePath());
        webView.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
    }

    private void recoverStartup() {
        if (bundles.activeRevision() > 1) {
            try {
                reloadBundle(bundles.rollback());
                return;
            } catch (IllegalStateException error) {
                android.util.Log.e("CozyDays", "Could not reset web bundle", error);
            }
        }
        dismissStartupSplash();
    }

    private void dismissStartupSplash() {
        webReady = true;
        if (startupSplash != null) {
            startupSplash.remove();
            startupSplash = null;
        }
    }

    @Override
    public void onDestroy() {
        if (bridge != null) bridge.getWebView().removeCallbacks(startupTimeout);
        super.onDestroy();
    }
}
