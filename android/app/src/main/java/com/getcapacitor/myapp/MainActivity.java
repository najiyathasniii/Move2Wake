package com.getcapacitor.myapp;

import android.os.Bundle;
import android.os.Build;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.net.Uri;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // പ്ലഗിൻ രജിസ്റ്റർ ചെയ്യുന്നു
        registerPlugin(AlarmPlugin.class);
        
        super.onCreate(savedInstanceState);

        createNotificationChannel();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null && !alarmManager.canScheduleExactAlarms()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "alarm_channel_high";
            CharSequence name = "Full Alarm Service";
            String description = "High Priority Full Screen Alarm";
            int importance = NotificationManager.IMPORTANCE_HIGH;

            NotificationChannel channel = new NotificationChannel(channelId, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);

            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/alarm");
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();
            channel.setSound(soundUri, audioAttributes);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}