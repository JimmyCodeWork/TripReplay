package io.github.jimmycodework.tripreplay;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Saves a file where the user chooses, which the WebView cannot do by itself: the system's
 * "create document" screen picks the place, and the page then writes the file in parts
 * (apps/web/src/native-save.ts). Used for backups.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private static final class OpenFile {
        final Uri uri;
        final OutputStream stream;

        OpenFile(Uri uri, OutputStream stream) {
            this.uri = uri;
            this.stream = stream;
        }
    }

    private final Map<String, OpenFile> files = new HashMap<>();

    /** Asks where to save `name`; resolves `{ id }`, or `{ cancelled: true }`. */
    @PluginMethod
    public void create(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", ""));
        startActivityForResult(call, intent, "created");
    }

    @ActivityCallback
    private void created(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = data.getData();
        try {
            OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (stream == null) throw new IOException("The file could not be opened");
            String id = UUID.randomUUID().toString();
            synchronized (files) {
                files.put(id, new OpenFile(uri, new BufferedOutputStream(stream, 1 << 20)));
            }
            JSObject opened = new JSObject();
            opened.put("id", id);
            call.resolve(opened);
        } catch (IOException | SecurityException e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** Appends `data`, Base64-encoded bytes, to the file `id`. */
    @PluginMethod
    public void append(PluginCall call) {
        OpenFile file = find(call);
        if (file == null) return;
        try {
            file.stream.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** Finishes the file `id`. */
    @PluginMethod
    public void close(PluginCall call) {
        OpenFile file = remove(call);
        if (file == null) return;
        try {
            file.stream.close();
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** Stops writing the file `id` and deletes it, so that no incomplete file is left. */
    @PluginMethod
    public void abort(PluginCall call) {
        OpenFile file = remove(call);
        if (file == null) return;
        try {
            file.stream.close();
        } catch (IOException ignored) {
            // The file is deleted next.
        }
        try {
            DocumentsContract.deleteDocument(getContext().getContentResolver(), file.uri);
        } catch (Exception ignored) {
            // Some places cannot delete; the incomplete file then stays.
        }
        call.resolve();
    }

    private OpenFile find(PluginCall call) {
        OpenFile file;
        synchronized (files) {
            file = files.get(call.getString("id", ""));
        }
        if (file == null) call.reject("No file is open with this id");
        return file;
    }

    private OpenFile remove(PluginCall call) {
        OpenFile file;
        synchronized (files) {
            file = files.remove(call.getString("id", ""));
        }
        if (file == null) call.reject("No file is open with this id");
        return file;
    }
}
