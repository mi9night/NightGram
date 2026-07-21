package app.nightgram.mobile.calls;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import app.nightgram.mobile.MainActivity;
import app.nightgram.mobile.R;

public class NightGramCallService extends Service {
    public static final String CHANNEL_ID = "nightgram_active_call";
    public static final int NOTIFICATION_ID = 3401;
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_VIDEO = "video";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        boolean video = intent != null && intent.getBooleanExtra(EXTRA_VIDEO, false);
        startForeground(NOTIFICATION_ID, createNotification(title, video));
        return START_NOT_STICKY;
    }

    private Notification createNotification(String title, boolean video) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            3401,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title == null || title.isBlank() ? "Звонок NightGram" : title)
            .setContentText(video ? "Активный видеозвонок" : "Активный аудиозвонок")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPendingIntent)
            .build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
