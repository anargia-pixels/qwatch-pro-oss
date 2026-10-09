package expo.modules.qwatchbackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps the process (and with it the BLE link held by react-native-ble-plx)
 * alive while the app is in the background. It does no work of its own: no
 * wake locks, no timers. Its only job is to hold the low-priority notification
 * that Android requires for a `connectedDevice` foreground service.
 */
class BandService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification(
      this,
      intent?.getStringExtra(EXTRA_TITLE) ?: "QWatch",
      intent?.getStringExtra(EXTRA_TEXT) ?: "",
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    // Without the JS runtime a restarted service has nothing to do.
    return START_NOT_STICKY
  }

  companion object {
    private const val CHANNEL_ID = "qwatch-band"
    private const val NOTIFICATION_ID = 4101
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"

    fun start(context: Context, title: String, text: String) {
      val intent = Intent(context, BandService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      context.startForegroundService(intent)
    }

    /** Re-posts the notification in place; does not touch the service. */
    fun update(context: Context, title: String, text: String) {
      context.getSystemService(NotificationManager::class.java)
        ?.notify(NOTIFICATION_ID, buildNotification(context, title, text))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, BandService::class.java))
    }

    private fun buildNotification(context: Context, title: String, text: String): Notification {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager?.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, "Band connection", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Shown while the app stays connected to your band in the background."
        channel.setShowBadge(false)
        manager?.createNotificationChannel(channel)
      }
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val contentIntent = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      return Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle(title)
        .setContentText(text)
        .setContentIntent(contentIntent)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_SERVICE)
        .build()
    }
  }
}
