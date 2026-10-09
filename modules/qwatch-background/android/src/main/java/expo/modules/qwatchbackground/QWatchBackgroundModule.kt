package expo.modules.qwatchbackground

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QWatchBackgroundModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var tickMs = 0L

  /**
   * React Native pauses JS timers while the activity is in the background, so
   * background work is driven from here instead. A plain main-looper post is
   * used on purpose: it never wakes the CPU, so during Doze the tick simply
   * waits for the next maintenance window or BLE notification.
   */
  private val tick = object : Runnable {
    override fun run() {
      sendEvent("onTick", mapOf("at" to System.currentTimeMillis().toDouble()))
      handler.postDelayed(this, tickMs)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("QWatchBackground")

    Events("onTick")

    /** Returns false when Android refuses to start it (e.g. called from the background on 12+). */
    Function("startService") { title: String, text: String ->
      try {
        BandService.start(context, title, text)
        true
      } catch (error: Exception) {
        false
      }
    }

    Function("updateService") { title: String, text: String ->
      BandService.update(context, title, text)
    }

    Function("stopService") {
      BandService.stop(context)
    }

    Function("startTicker") { seconds: Double ->
      handler.removeCallbacks(tick)
      tickMs = (seconds * 1000).toLong().coerceAtLeast(15_000L)
      handler.postDelayed(tick, tickMs)
    }

    Function("stopTicker") {
      handler.removeCallbacks(tick)
    }

    OnDestroy {
      handler.removeCallbacks(tick)
    }
  }
}
