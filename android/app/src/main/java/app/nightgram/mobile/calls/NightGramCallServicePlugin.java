package app.nightgram.mobile.calls;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "NightGramCallService")
public class NightGramCallServicePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), NightGramCallService.class);
        intent.putExtra(NightGramCallService.EXTRA_TITLE, call.getString("title", "Звонок NightGram"));
        intent.putExtra(NightGramCallService.EXTRA_VIDEO, call.getBoolean("video", false));
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("active", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), NightGramCallService.class));
        JSObject result = new JSObject();
        result.put("active", false);
        call.resolve(result);
    }
}
