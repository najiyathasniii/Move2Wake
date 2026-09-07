package com.getcapacitor.myapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;

public class AlarmService extends Service {
    private static final String CHANNEL_ID = "alarm_service_channel";
    private static final int NOTIFICATION_ID = 2001;
    private MediaPlayer mediaPlayer;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundWithNotification();
        startAlarmSound();
        return START_STICKY;
    }

    private void startForegroundWithNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Notification notification = builder
                .setContentTitle("Move2Wake Alarm")
                .setContentText("Complete your exercise to stop the alarm")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startAlarmSound() {
        stopPlayerOnly();

        try {
            mediaPlayer = MediaPlayer.create(this, R.raw.alarm);
            if (mediaPlayer == null) {
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                mediaPlayer.setAudioAttributes(attributes);
            }

            mediaPlayer.setLooping(true);
            mediaPlayer.setWakeMode(this, android.os.PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopPlayerOnly() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (Exception ignored) {
            }

            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    public void stopAlarm() {
        stopPlayerOnly();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Move2Wake Alarm Service",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps the Move2Wake alarm running while the screen is locked.");
        channel.setSound(null, null);

        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        stopPlayerOnly();
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep the alarm service alive if the recent-apps screen removes the app task.
        super.onTaskRemoved(rootIntent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
