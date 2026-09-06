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
    long triggerAtMillis = call.getLong("time"); // അല്ലെങ്കിൽ JS-ൽ നിന്ന് ലഭിക്കുന്ന timestamp

    AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
    Intent intent = new Intent(getContext(), AlarmReceiver.class);
    
    PendingIntent pendingIntent = PendingIntent.getBroadcast(
        getContext(), 
        0, 
        intent, 
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    if (alarmManager != null) {
        // Android 6.0+ ൽ Doze mode മറികടന്ന് അലാറം അടിക്കാൻ
        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP, 
            triggerAtMillis, 
            pendingIntent
        );
        Log.d("AlarmPlugin", "Alarm set for: " + triggerAtMillis);
    }
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