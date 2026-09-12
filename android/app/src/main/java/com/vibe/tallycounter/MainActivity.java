package com.vibe.tallycounter;

import android.content.Context;
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
    private AudioManager audioManager = null;
    private long lastVolumeActionTime = 0;

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
                    long now = System.currentTimeMillis();
                    if (now - lastVolumeActionTime >= 50) {
                        lastVolumeActionTime = now;
                        maximizeVolume();
                        final String direction = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "up" : "down";
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().post(() -> {
                                bridge.getWebView().evaluateJavascript(
                                    "if (window.handleVolumeKey) { window.handleVolumeKey('" + direction + "'); }",
                                    null
                                );
                            });
                        }
                    }
                }
                // Return true for BOTH ACTION_DOWN and ACTION_UP to completely suppress system volume beep/change
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void maximizeVolume() {
        if (audioManager != null) {
            try {
                int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
            } catch (Exception ignored) {}
        }
    }

    public class VolumeBridge {
        @JavascriptInterface
        public void setVolumeCountingEnabled(boolean enabled) {
            volumeCountingEnabled = enabled;
            if (enabled && isCounterSelected) {
                maximizeVolume();
            }
        }

        @JavascriptInterface
        public void setActiveCounter(String id, boolean isSelected) {
            isCounterSelected = isSelected;
            if (volumeCountingEnabled && isSelected) {
                maximizeVolume();
            }
        }

        @JavascriptInterface
        public void setActiveCounter(String id, int count, int step, boolean isSelected) {
            setActiveCounter(id, isSelected);
        }

        @JavascriptInterface
        public void setActiveCounter(String id, String name, int count, int step, int target, boolean isSelected) {
            setActiveCounter(id, isSelected);
        }
    }
}
