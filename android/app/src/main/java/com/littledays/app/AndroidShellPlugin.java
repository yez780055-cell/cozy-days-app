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

@CapacitorPlugin(name = "CozyAndroidShell")
public class AndroidShellPlugin extends Plugin {
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
        activity.runOnUiThread(() -> call.resolve(activity.getSafeArea()));
    }

    @PluginMethod
    public void ready(PluginCall call) {
        var activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            activity.pageReady(call.getBoolean("darkStatusIcons", true), call.getBoolean("darkNavigationIcons", true));
            call.resolve();
        });
    }

    @PluginMethod
    public void updateInfo(PluginCall call) {
        var activity = (MainActivity) getActivity();
        call.resolve(new JSObject().put("shell", BuildConfig.VERSION_CODE).put("web", activity.bundles().activeRevision()));
    }

    @PluginMethod
    public void importUpdate(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(call, intent, "updateSelected");
        } catch (android.content.ActivityNotFoundException error) {
            call.reject("设备无法打开文件选择器。", error);
        }
    }

    @ActivityCallback
    private void updateSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        var data = result.getData();
        var uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.resolve();
            return;
        }
        var activity = (MainActivity) getActivity();
        getBridge().execute(() -> {
            try (var input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException("无法读取文件");
                File directory = activity.bundles().install(input);
                reload(call, activity, directory);
            } catch (Exception error) {
                call.reject("更新未安装。请选择适用于此外壳、签名有效且版本更新的网页包。", error);
            }
        });
    }

    @PluginMethod
    public void restoreBundled(PluginCall call) {
        var activity = (MainActivity) getActivity();
        try {
            activity.bundles().reset();
            reload(call, activity, null);
        } catch (IllegalStateException error) {
            call.reject("无法恢复内置网页。", error);
        }
    }

    private void reload(PluginCall call, MainActivity activity, File directory) {
        call.resolve();
        activity.runOnUiThread(() -> activity.reloadBundle(directory));
    }
}
