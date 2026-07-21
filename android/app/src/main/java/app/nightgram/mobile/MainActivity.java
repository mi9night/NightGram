package app.nightgram.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import app.nightgram.mobile.calls.NightGramCallService;
import app.nightgram.mobile.calls.NightGramCallServicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NightGramCallServicePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        getWindow().setStatusBarColor(ContextCompat.getColor(this, android.R.color.transparent));
        getWindow().setNavigationBarColor(ContextCompat.getColor(this, android.R.color.black));
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel messages = new NotificationChannel(
            "nightgram_messages",
            "Сообщения NightGram",
            NotificationManager.IMPORTANCE_HIGH
        );
        messages.setDescription("Личные сообщения, группы, каналы и упоминания");
        messages.enableVibration(true);
        messages.setShowBadge(true);
        manager.createNotificationChannel(messages);

        NotificationChannel calls = new NotificationChannel(
            "nightgram_calls",
            "Входящие звонки NightGram",
            NotificationManager.IMPORTANCE_HIGH
        );
        calls.setDescription("Входящие аудио- и видеозвонки");
        calls.enableVibration(true);
        calls.setShowBadge(true);
        calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(calls);

        NotificationChannel activeCall = new NotificationChannel(
            NightGramCallService.CHANNEL_ID,
            "Активный звонок NightGram",
            NotificationManager.IMPORTANCE_LOW
        );
        activeCall.setDescription("Поддерживает активный звонок при сворачивании приложения");
        activeCall.setShowBadge(false);
        manager.createNotificationChannel(activeCall);
    }
}
