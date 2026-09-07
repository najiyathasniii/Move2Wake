package com.getcapacitor.myapp;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "alarm_channel_high";
    private static final int FULL_SCREEN_REQUEST_CODE = 1001;

    @Override
    public void onReceive(Context context, Intent receivedIntent) {
        // 1. Start native foreground sound immediately.
        Intent serviceIntent = new Intent(context, AlarmService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 2. Prepare the exercise Activity as a full-screen alarm intent.
        Intent activityIntent = new Intent(context, MainActivity.class);
        activityIntent.putExtra("startAlarm", true);
        activityIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                context,
                FULL_SCREEN_REQUEST_CODE,
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        createAlarmChannel(context);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }

        Notification notification = builder
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle("Move2Wake")
                .setContentText("Get up and complete your exercise")
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .build();

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.notify(1002, notification);

        // Exact alarms are allowed to start a foreground service from the background.
        // The Activity is launched through the supported full-screen alarm mechanism.
    }

    private void createAlarmChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Move2Wake Alarm",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Full-screen alarm notification for Move2Wake.");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        // The foreground AlarmService provides the actual looping sound.
        // Keeping notification-channel sound silent avoids two alarm sounds playing together.
        channel.setSound(null, null);

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }
}
