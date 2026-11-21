package com.littledays.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "CozyAndroidShell")
public class AndroidShellPlugin extends Plugin {
    private static final ExecutorService UPDATES = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean UPDATING = new AtomicBoolean();
    private final OnlineWebUpdates online = new OnlineWebUpdates();
    private volatile OnlineWebUpdates.Release offered;

    @PluginMethod
    public void homeBack(PluginCall call) {
        var activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            activity.homeBack(call.getBoolean("exit", false));
            call.resolve();
        });
    }

    @PluginMethod
    public void getSafeArea(PluginCall call) {
        var activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> call.resolve(activity.getSafeArea().put("startupToken", activity.startupToken())));
    }

    @PluginMethod
    public void ready(PluginCall call) {
        var activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            if (activity.pageReady(call.getInt("startupToken", -1), call.getBoolean("darkStatusIcons", true),
                    call.getBoolean("darkNavigationIcons", true))) {
                UPDATES.execute(() -> activity.bundles().prune());
                call.resolve();
            } else {
                call.reject("网页尚未完成启动。");
            }
        });
    }

    @PluginMethod
    public void updateInfo(PluginCall call) {
        var activity = (MainActivity) getActivity();
        call.resolve(new JSObject().put("shell", BuildConfig.VERSION_CODE).put("web", activity.bundles().activeRevision())
            .put("outcome", activity.bundles().takeOutcome()));
    }

    @PluginMethod
    public void checkOnlineUpdate(PluginCall call) {
        var activity = (MainActivity) getActivity();
        UPDATES.execute(() -> {
            offered = null;
            try {
                var result = new JSObject().put("configured", true);
                var bundles = activity.bundles();
                int failed = call.getBoolean("retryFailed", false) ? 0 : bundles.failedRevision();
                offered = online.check(bundles.activeRevision(), failed, call.getBoolean("prerelease", false));
                if (offered != null) result.put("release", new JSObject().put("web", offered.web).put("bytes", offered.bytes));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("暂时无法连接更新源或读取版本信息。可以继续使用本地网页。", error);
            }
        });
    }

    @PluginMethod
    public void installOnlineUpdate(PluginCall call) {
        var activity = (MainActivity) getActivity();
        var release = offered;
        if (release == null || release.web != call.getInt("web", 0)) {
            call.reject("更新信息已失效，请重新检查更新。");
            return;
        }
        if (!beginUpdate(call, activity)) return;
        UPDATES.execute(() -> {
            try {
                if (release.web <= activity.bundles().activeRevision()) throw new IOException("Package is no longer newer");
                var bundles = activity.bundles();
                File staged = DeltaWebUpdates.prepareOrFull(
                    () -> bundles.prepareDelta(release, online.files(release),
                        (received, total) -> progress("downloading", received, total),
                        () -> progress("verifying", 0, 0)),
                    bundles::discardStaged,
                    () -> prepareFullDownload(activity, release));
                progress("installing", 0, 0);
                File directory = bundles.activate(staged, release.web);
                reload(call, activity, directory);
            } catch (WebBundles.SignatureMismatch error) {
                call.reject("网页包签名与当前 APK 不匹配。", error);
            } catch (SecurityException error) {
                call.reject("网页包 SHA-256 校验失败，请重试。", error);
            } catch (Exception error) {
                call.reject("下载未完成。请检查网络和可用存储空间后重试。", error);
            } finally {
                activity.bundles().discardStaged();
                UPDATING.set(false);
            }
        });
    }

    private File prepareFullDownload(MainActivity activity, OnlineWebUpdates.Release release) throws Exception {
        File cache = getContext().getCacheDir();
        File[] stale = cache.listFiles((directory, name) -> name.startsWith("cozy-online-") && name.endsWith(".cozyupdate"));
        if (stale != null) for (File file : stale) file.delete();
        File download = File.createTempFile("cozy-online-", ".cozyupdate", cache);
        try {
            progress("downloading", 0, release.bytes);
            online.download(release, download, (received, total) -> progress("downloading", received, total),
                () -> progress("verifying", 0, 0));
            try (var input = new FileInputStream(download)) {
                return activity.bundles().prepareFull(input, release.web, () -> progress("installing", 0, 0));
            }
        } finally { download.delete(); }
    }

    private void progress(String stage, long received, long total) {
        notifyListeners("webUpdateProgress", new JSObject().put("stage", stage).put("received", received).put("total", total));
    }

    private boolean beginUpdate(PluginCall call, MainActivity activity) {
        if (!activity.bundles().isPending() && UPDATING.compareAndSet(false, true)) return true;
        call.reject("网页更新正在进行中。");
        return false;
    }

    @PluginMethod
    public void importUpdate(PluginCall call) {
        if (!beginUpdate(call, (MainActivity) getActivity())) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(call, intent, "updateSelected");
        } catch (android.content.ActivityNotFoundException error) {
            UPDATING.set(false);
            call.reject("设备无法打开文件选择器。", error);
        }
    }

    @ActivityCallback
    private void updateSelected(PluginCall call, ActivityResult result) {
        if (call == null) { UPDATING.set(false); return; }
        var data = result.getData();
        var uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            UPDATING.set(false);
            call.resolve();
            return;
        }
        var activity = (MainActivity) getActivity();
        UPDATES.execute(() -> {
            try (var input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException("无法读取文件");
                File directory = activity.bundles().install(input, null, () -> {});
                reload(call, activity, directory);
            } catch (Exception error) {
                call.reject("更新未安装。请选择适用于此外壳、签名有效且版本更新的网页包。", error);
            } finally {
                UPDATING.set(false);
            }
        });
    }

    @PluginMethod
    public void restoreBundled(PluginCall call) {
        var activity = (MainActivity) getActivity();
        if (!beginUpdate(call, activity)) return;
        try {
            activity.bundles().reset();
            reload(call, activity, null);
        } catch (IllegalStateException error) {
            call.reject("无法恢复内置网页。", error);
        } finally {
            UPDATING.set(false);
        }
    }

    private void reload(PluginCall call, MainActivity activity, File directory) {
        call.resolve();
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && !activity.isDestroyed()) activity.reloadBundle(directory);
        });
    }
}
