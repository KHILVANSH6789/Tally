package com.vibe.tallycounter;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
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
    private boolean isCounterSelected = false;
    private String activeCounterId = "";
    private String activeCounterName = "Tally";
    private int activeCount = 0;
    private int activeStep = 1;
    private int activeTarget = 0;

    private AudioManager audioManager = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge display mode
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        hideSystemBars();

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // Configure seamless native WebView and register JavaScript bridge
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

        // Resync count to web view when screen wakes up
        VolumeCounterService service = VolumeCounterService.getInstance();
        if (service != null && isCounterSelected && activeCounterId != null && !activeCounterId.isEmpty()) {
            activeCount = service.getActiveCount();
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().post(() -> {
                    bridge.getWebView().evaluateJavascript(
                        "if (window.syncCountFromNative) { window.syncCountFromNative('" + activeCounterId + "', " + activeCount + ", 'sync'); }",
                        null
                    );
                });
            }
        }
    }

    private void hideSystemBars() {
        Window window = getWindow();
        if (window == null) return;

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }

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

    // Intercept physical volume buttons when screen is ON - ONLY when a counter is selected
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (volumeCountingEnabled && isCounterSelected) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    final String direction = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "up" : "down";
                    VolumeCounterService service = VolumeCounterService.getInstance();
                    if (service != null) {
                        service.triggerCount(direction);
                    } else {
                        startVolumeService();
                    }
                }
                // Return true for BOTH ACTION_DOWN and ACTION_UP to completely suppress system volume beep/change
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private synchronized void syncVolumeControlState() {
        boolean shouldBeActive = volumeCountingEnabled && isCounterSelected;

        if (shouldBeActive) {
            startVolumeService();
        } else {
            stopVolumeService();
        }
    }

    private void startVolumeService() {
        maximizeVolume();

        VolumeCounterService.setListener((counterId, updatedCount, direction) -> {
            activeCount = updatedCount;
            runOnUiThread(() -> {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(
                        "if (window.syncCountFromNative) { window.syncCountFromNative('" + counterId + "', " + updatedCount + ", '" + direction + "'); }",
                        null
                    );
                }
            });
        });

        Intent intent = new Intent(this, VolumeCounterService.class);
        intent.setAction(VolumeCounterService.ACTION_START);
        intent.putExtra(VolumeCounterService.EXTRA_COUNTER_ID, activeCounterId);
        intent.putExtra(VolumeCounterService.EXTRA_COUNTER_NAME, activeCounterName);
        intent.putExtra(VolumeCounterService.EXTRA_COUNT, activeCount);
        intent.putExtra(VolumeCounterService.EXTRA_STEP, activeStep);
        intent.putExtra(VolumeCounterService.EXTRA_TARGET, activeTarget);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopVolumeService() {
        VolumeCounterService.setListener(null);
        Intent intent = new Intent(this, VolumeCounterService.class);
        intent.setAction(VolumeCounterService.ACTION_STOP);
        try {
            stopService(intent);
        } catch (Exception ignored) {}
    }

    private void maximizeVolume() {
        if (audioManager != null) {
            try {
                int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        isCounterSelected = false;
        stopVolumeService();
        super.onDestroy();
    }

    public class VolumeBridge {
        @JavascriptInterface
        public void setVolumeCountingEnabled(boolean enabled) {
            volumeCountingEnabled = enabled;
            runOnUiThread(() -> syncVolumeControlState());
        }

        @JavascriptInterface
        public void setActiveCounter(String id, String name, int count, int step, int target, boolean isSelected) {
            activeCounterId = id != null ? id : "";
            activeCounterName = name != null ? name : "Tally";
            activeCount = count;
            activeStep = step > 0 ? step : 1;
            activeTarget = target;
            isCounterSelected = isSelected;
            runOnUiThread(() -> syncVolumeControlState());
        }

        // Backward compatibility overload
        @JavascriptInterface
        public void setActiveCounter(String id, int count, int step, boolean isSelected) {
            setActiveCounter(id, "Tally", count, step, 0, isSelected);
        }
    }
}
