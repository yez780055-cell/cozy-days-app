package com.littledays.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
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
        return safeArea == null ? new JSObject().put("top", 0).put("right", 0).put("bottom", 0).put("left", 0) : safeArea;
    }

    private JSObject updateSafeArea(WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets gestures = insets.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures());
        float density = getResources().getDisplayMetrics().density;
        int bottom = insets.isVisible(WindowInsetsCompat.Type.ime()) ? 0 : Math.max(bars.bottom, gestures.bottom);
        safeArea = new JSObject()
            .put("top", Math.ceil(bars.top / density))
            .put("right", Math.ceil(bars.right / density))
            .put("bottom", Math.ceil(bottom / density))
            .put("left", Math.ceil(bars.left / density));
        return safeArea;
    }

    private void setBarIcons(boolean darkStatus, boolean darkNavigation) {
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(darkStatus);
        controller.setAppearanceLightNavigationBars(darkNavigation);
    }

    WebBundles bundles() {
        return bundles;
    }

    void pageReady(boolean darkStatus, boolean darkNavigation) {
        setBarIcons(darkStatus, darkNavigation);
        bundles.confirmStartup();
        bridge.getWebView().removeCallbacks(startupTimeout);
        dismissStartupSplash();
    }

    void reloadBundle(File directory) {
        var webView = bridge.getWebView();
        webView.removeCallbacks(startupTimeout);
        if (directory == null) bridge.setServerAssetPath("public");
        else bridge.setServerBasePath(directory.getAbsolutePath());
        webView.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
    }

    private void recoverStartup() {
        if (bundles.activeRevision() > 1) {
            try {
                bundles.reset();
                reloadBundle(null);
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
