package com.getcapacitor.myapp;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    private static final int ALARM_REQUEST_CODE = 1000;

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Long triggerAtMillis = call.getLong("time");

        if (triggerAtMillis == null) {
            call.reject("Alarm time is required");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && !alarmManager.canScheduleExactAlarms()) {
            call.reject("Exact alarm permission is not granted");
            return;
        }

        Intent intent = new Intent(context, AlarmReceiver.class);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
            );

            call.resolve();
        } catch (Exception e) {
            call.reject("Could not schedule alarm", e);
        }
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        Intent intent = new Intent(context, AlarmReceiver.class);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        alarmManager.cancel(pendingIntent);
        stopAlarmService();
        call.resolve();
    }

    @PluginMethod
    public void startAlarmSound(PluginCall call) {
        startAlarmService();
        call.resolve();
    }

    @PluginMethod
    public void stopAlarmSound(PluginCall call) {
        stopAlarmService();
        call.resolve();
    }

    private void startAlarmService() {
        Context context = getContext();
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
    }

    private void stopAlarmService() {
        Context context = getContext();
        Intent serviceIntent = new Intent(context, AlarmService.class);
        context.stopService(serviceIntent);
    }
}
