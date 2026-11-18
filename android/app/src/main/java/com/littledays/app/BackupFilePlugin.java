package com.littledays.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || call.getString("json") == null) {
            call.reject("缺少备份文件。");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "documentSelected");
        } catch (android.content.ActivityNotFoundException error) {
            call.reject("设备无法打开文件保存界面。", error);
        }
    }

    @ActivityCallback
    private void documentSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri destination = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }

        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                if (stream == null) throw new IOException("Document output unavailable");
                stream.write(call.getString("json").getBytes(StandardCharsets.UTF_8));
            } catch (IOException | SecurityException | IllegalArgumentException error) {
                call.reject("无法保存备份文件，请检查保存位置。", error);
                return;
            }
            call.resolve(new JSObject().put("saved", true));
        });
    }
}
