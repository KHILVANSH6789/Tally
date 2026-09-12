package com.vibe.tallycounter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean volumeCountingEnabled = false;
    private PowerManager.WakeLock wakeLock = null;
    private AudioManager audioManager = null;
    private boolean receiverRegistered = false;
    private long lastVolumeActionTime = 0;

    private final BroadcastReceiver volumeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!volumeCountingEnabled) return;
            if ("android.media.VOLUME_CHANGED_ACTION".equals(intent.getAction())) {
                int streamType = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1);
                if (streamType == AudioManager.STREAM_MUSIC) {
                    int currentVol = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_VALUE", -1);
                    int prevVol = intent.getIntExtra("android.media.EXTRA_PREV_VOLUME_STREAM_VALUE", -1);
                    long now = System.currentTimeMillis();

                    // Debounce rapid duplicate broadcasts within 60ms
                    if (now - lastVolumeActionTime < 60) return;

                    if (currentVol > prevVol) {
                        lastVolumeActionTime = now;
                        triggerVolumeCount("up");
                    } else if (currentVol < prevVol) {
                        lastVolumeActionTime = now;
                        triggerVolumeCount("down");
                    }

                    // Keep music volume centered so key presses never max out or bottom out
                    resetVolumeToMidpoint();
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge / cutout display mode for Android P+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        hideSystemBars();

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // Register Javascript Interface, set seamless background and disable native WebView scrollbars
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(0xFF090C10);
            bridge.getWebView().setVerticalScrollBarEnabled(false);
            bridge.getWebView().setHorizontalScrollBarEnabled(false);
            bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            bridge.getWebView().addJavascriptInterface(new VolumeBridge(), "AndroidBridge");
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    // Completely hide notification bar (status bar) and bottom buttons (navigation bar)
    private void hideSystemBars() {
        Window window = getWindow();
        if (window == null) return;

        // Modern Insets Controller
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }

        // Legacy Flags for maximum compatibility across Android versions & OEMs
        View decorView = window.getDecorView();
        if (decorView != null) {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }

    // Intercept volume buttons when screen is ON
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (volumeCountingEnabled) {
            int action = event.getAction();
            int keyCode = event.getKeyCode();
            if (action == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
                    triggerVolumeCount("up");
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                    triggerVolumeCount("down");
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    // Trigger count in web layer & give haptic feedback
    private void triggerVolumeCount(final String direction) {
        vibrateFeedback();
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "if (window.handleVolumeKey) { window.handleVolumeKey('" + direction + "'); }",
                    null
                );
            }
        });
    }

    private void vibrateFeedback() {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(22, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(22);
                }
            }
        } catch (Exception ignored) {}
    }

    private void resetVolumeToMidpoint() {
        if (audioManager != null) {
            try {
                int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int mid = Math.max(1, max / 2);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, mid, AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE);
            } catch (Exception ignored) {}
        }
    }

    private synchronized void updateWakeLockAndReceiver(boolean enabled) {
        volumeCountingEnabled = enabled;

        if (enabled) {
            // Setup WakeLock so CPU keeps running when screen is off
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TallyCounter:VolumeLock");
                    wakeLock.acquire();
                }
            }

            // Register volume broadcast receiver
            if (!receiverRegistered) {
                IntentFilter filter = new IntentFilter("android.media.VOLUME_CHANGED_ACTION");
                registerReceiver(volumeReceiver, filter);
                receiverRegistered = true;
            }

            resetVolumeToMidpoint();
        } else {
            // Release wake lock
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }

            // Unregister receiver
            if (receiverRegistered) {
                try {
                    unregisterReceiver(volumeReceiver);
                } catch (Exception ignored) {}
                receiverRegistered = false;
            }
        }
    }

    @Override
    public void onDestroy() {
        updateWakeLockAndReceiver(false);
        super.onDestroy();
    }

    public class VolumeBridge {
        @JavascriptInterface
        public void setVolumeCountingEnabled(boolean enabled) {
            runOnUiThread(() -> updateWakeLockAndReceiver(enabled));
        }

        @JavascriptInterface
        public void setActiveCounter(String id, int count, int step) {
            // Hook if needed for native background persistence
        }
    }
}
