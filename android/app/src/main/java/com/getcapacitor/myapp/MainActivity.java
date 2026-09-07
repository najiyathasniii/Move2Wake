package com.getcapacitor.myapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmPlugin.class);
        super.onCreate(savedInstanceState);

        createNotificationChannel();
        requestExactAlarmPermissionIfNeeded();
        requestFullScreenPermissionIfNeeded();
        checkAlarmIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        checkAlarmIntent(intent);
    }

    private void checkAlarmIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("startAlarm", false)) {
            sendAlarmToReact();
        }
    }

    private void sendAlarmToReact() {
        // Wait for the Capacitor WebView/React app to be ready.
        new android.os.Handler().postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() ->
                        getBridge().getWebView().evaluateJavascript(
                                "window.dispatchEvent(new Event('alarmTriggered'));",
                                null
                        )
                );
            }
        }, 1200);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        // Do NOT put alarm sound on this channel. AlarmService owns the audio.
        NotificationChannel channel = new NotificationChannel(
                "alarm_channel_high",
                "Move2Wake Alarm",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Full-screen Move2Wake alarm.");
        channel.enableVibration(true);
        channel.setSound(null, null);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private void requestExactAlarmPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.AlarmManager alarmManager =
                    (android.app.AlarmManager) getSystemService(ALARM_SERVICE);

            if (alarmManager != null && !alarmManager.canScheduleExactAlarms()) {
                try {
                    Intent intent = new Intent(
                            Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void requestFullScreenPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager manager = getSystemService(NotificationManager.class);

            if (manager != null && !manager.canUseFullScreenIntent()) {
                try {
                    Intent intent = new Intent(
                            Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                            Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            }
        }
    }
}
