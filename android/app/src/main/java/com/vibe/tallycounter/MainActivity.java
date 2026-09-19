package com.vibe.tallycounter;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    private boolean volumeCountingEnabled = false;
    private boolean isCounterSelected = false;
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
    // Otherwise let the user adjust media volume the regular way in the menu/selection screen
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (volumeCountingEnabled && isCounterSelected) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    long now = System.currentTimeMillis();
                    if (now - lastVolumeActionTime >= 50) {
                        lastVolumeActionTime = now;
                        final String direction = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "up" : "down";
                        postToWebview("if (window.handleVolumeKey) { window.handleVolumeKey('" + direction + "'); }");
                    }
                }
                // Suppress phone volume change popup when counting
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void postToWebview(final String jsCode) {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> {
                bridge.getWebView().evaluateJavascript(jsCode, null);
            });
        }
    }

    public class VolumeBridge {
        @JavascriptInterface
        public void setVolumeCountingEnabled(boolean enabled) {
            volumeCountingEnabled = enabled;
        }

        @JavascriptInterface
        public void setActiveCounter(String id, boolean isSelected) {
            isCounterSelected = isSelected;
        }

        @JavascriptInterface
        public void setActiveCounter(String id, int count, int step, boolean isSelected) {
            setActiveCounter(id, isSelected);
        }

        @JavascriptInterface
        public void setActiveCounter(String id, String name, int count, int step, int target, boolean isSelected) {
            setActiveCounter(id, isSelected);
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(final String downloadUrl) {
            new Thread(() -> {
                try {
                    URL url = new URL(downloadUrl);
                    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(30000);
                    connection.connect();

                    int fileLength = connection.getContentLength();
                    File cacheDir = getCacheDir();
                    File apkFile = new File(cacheDir, "Tally_update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    InputStream input = new BufferedInputStream(connection.getInputStream());
                    OutputStream output = new FileOutputStream(apkFile);

                    byte[] data = new byte[8192];
                    long total = 0;
                    int count;
                    int lastPercent = 0;

                    while ((count = input.read(data)) != -1) {
                        total += count;
                        output.write(data, 0, count);
                        if (fileLength > 0) {
                            int percent = (int) (total * 100 / fileLength);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                postToWebview("if (window.onUpdateDownloadProgress) { window.onUpdateDownloadProgress(" + percent + "); }");
                            }
                        }
                    }
                    output.flush();
                    output.close();
                    input.close();

                    postToWebview("if (window.onUpdateDownloadProgress) { window.onUpdateDownloadProgress(100); }");

                    // Prompt native PackageInstaller
                    Uri apkUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        apkFile
                    );

                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                    installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(installIntent);

                } catch (Exception e) {
                    Log.e("TallyUpdate", "Error downloading update", e);
                    postToWebview("if (window.onUpdateDownloadError) { window.onUpdateDownloadError('" + e.getMessage().replace("'", "\\'") + "'); }");
                }
            }).start();
        }
    }
}
