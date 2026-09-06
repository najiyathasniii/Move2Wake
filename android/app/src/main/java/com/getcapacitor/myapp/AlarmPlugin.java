package com.getcapacitor.myapp;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Long time = call.getLong("time");
        if (time == null) {
            call.reject("Must provide a time");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmReceiver.class);
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            call.reject("Exact alarm permission not granted by user");
            return;
        }

        // അലാറം കൃത്യസമയത്ത് ഷെഡ്യൂൾ ചെയ്യുന്നു
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pendingIntent);
        call.resolve();
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmReceiver.class);
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        alarmManager.cancel(pendingIntent);
        call.resolve();
    }
}