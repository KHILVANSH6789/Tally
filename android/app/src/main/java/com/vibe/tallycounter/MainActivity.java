package com.vibe.tallycounter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.SoundPool;
import android.media.VolumeProvider;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
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
    private boolean isCounterSelected = false;
    private String activeCounterId = null;
    private int activeCount = 0;
    private int activeStep = 1;

    private PowerManager.WakeLock wakeLock = null;
    private AudioManager audioManager = null;
    private MediaSession mediaSession = null;
    private SoundPool soundPool = null;
    private int soundTapNormalId = 0;
    private int soundTapDecreaseId = 0;

    // Silent audio keep-alive for screen-off hardware volume routing on Android 12+
    private AudioTrack silentTrack = null;
    private Thread silentThread = null;
    private volatile boolean isSilentRunning = false;

    private boolean receiverRegistered = false;
    private long lastVolumeActionTime = 0;

    private final BroadcastReceiver volumeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!volumeCountingEnabled || !isCounterSelected) return;
            if ("android.media.VOLUME_CHANGED_ACTION".equals(intent.getAction())) {
                int streamType = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1);
                if (streamType == AudioManager.STREAM_MUSIC) {
                    int currentVol = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_VALUE", -1);
                    int prevVol = intent.getIntExtra("android.media.EXTRA_PREV_VOLUME_STREAM_VALUE", -1);
                    long now = System.currentTimeMillis();

                    if (now - lastVolumeActionTime < 70) return;

                    if (currentVol > prevVol) {
                        lastVolumeActionTime = now;
                        triggerVolumeCount("up");
                    } else if (currentVol < prevVol) {
                        lastVolumeActionTime = now;
                        triggerVolumeCount("down");
                    }

                    // Keep volume at 100% as requested
                    maximizeVolume();
                }
            }
        }
    };

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

        initSoundPool();

        // Register Javascript Interface, set seamless background and disable native WebView scrollbars
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(0xFF090C10);
            bridge.getWebView().setVerticalScrollBarEnabled(false);
            bridge.getWebView().setHorizontalScrollBarEnabled(false);
            bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            bridge.getWebView().addJavascriptInterface(new VolumeBridge(), "AndroidBridge");
        }
    }

    private void initSoundPool() {
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            soundPool = new SoundPool.Builder()
                .setMaxStreams(4)
                .setAudioAttributes(attrs)
                .build();

            AssetFileDescriptor afd1 = getAssets().openFd("public/sounds/Tap_Normal.mp3");
            soundTapNormalId = soundPool.load(afd1, 1);

            AssetFileDescriptor afd2 = getAssets().openFd("public/sounds/Tap_Decrease.mp3");
            soundTapDecreaseId = soundPool.load(afd2, 1);
        } catch (Exception e) {
            // SoundPool fallback
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
        if (isCounterSelected && activeCounterId != null && bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> {
                bridge.getWebView().evaluateJavascript(
                    "if (window.syncCountFromNative) { window.syncCountFromNative('" + activeCounterId + "', " + activeCount + ", 'sync'); }",
                    null
                );
            });
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

    // Intercept volume buttons when screen is ON - ONLY when counter is selected!
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (volumeCountingEnabled && isCounterSelected) {
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

    // Trigger tally count with native audio & haptics (works with screen ON and screen OFF)
    private synchronized void triggerVolumeCount(final String direction) {
        long now = System.currentTimeMillis();
        if (now - lastVolumeActionTime < 60) return;
        lastVolumeActionTime = now;

        // 1. Play native sound immediately so user hears it even if screen is OFF
        if (soundPool != null) {
            if ("up".equals(direction) && soundTapNormalId != 0) {
                soundPool.play(soundTapNormalId, 1.0f, 1.0f, 1, 0, 1.0f);
            } else if ("down".equals(direction) && soundTapDecreaseId != 0) {
                soundPool.play(soundTapDecreaseId, 1.0f, 1.0f, 1, 0, 1.0f);
            }
        }

        // 2. Tactile vibration feedback
        vibrateFeedback();

        // 3. Update internal count
        if ("up".equals(direction)) {
            activeCount += activeStep;
        } else if ("down".equals(direction)) {
            activeCount = Math.max(0, activeCount - activeStep);
        }

        // 4. Send updated count to WebView
        final int updatedCount = activeCount;
        final String counterId = activeCounterId;
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "if (window.syncCountFromNative) { window.syncCountFromNative('" + counterId + "', " + updatedCount + ", '" + direction + "'); }",
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
                    v.vibrate(VibrationEffect.createOneShot(24, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(24);
                }
            }
        } catch (Exception ignored) {}
    }

    // Set media volume to 100% as requested
    private void maximizeVolume() {
        if (audioManager != null) {
            try {
                int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
            } catch (Exception ignored) {}
        }
    }

    // Synchronize media session, wake lock, and audio track based on counter selection & setting
    private synchronized void syncVolumeControlState() {
        boolean shouldBeActive = volumeCountingEnabled && isCounterSelected;

        if (shouldBeActive) {
            maximizeVolume();

            // Setup WakeLock so CPU stays awake when phone screen is turned off
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TallyCounter:VolumeLock");
                    wakeLock.acquire();
                }
            }

            // Setup MediaSession with Remote Volume Provider
            if (mediaSession == null) {
                mediaSession = new MediaSession(this, "TallyMediaSession");
                VolumeProvider volumeProvider = new VolumeProvider(VolumeProvider.VOLUME_CONTROL_RELATIVE, 100, 100) {
                    @Override
                    public void onAdjustVolume(int direction) {
                        if (!isCounterSelected || !volumeCountingEnabled) return;
                        if (direction > 0) {
                            triggerVolumeCount("up");
                        } else if (direction < 0) {
                            triggerVolumeCount("down");
                        }
                    }
                };
                mediaSession.setPlaybackToRemote(volumeProvider);
                mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            }

            PlaybackState state = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE)
                .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build();
            mediaSession.setPlaybackState(state);
            mediaSession.setActive(true);

            // Start silent audio keepalive so Android 14 routes hardware keys even when screen is locked
            startSilentAudio();

            // Register volume broadcast receiver as secondary fallback
            if (!receiverRegistered) {
                IntentFilter filter = new IntentFilter("android.media.VOLUME_CHANGED_ACTION");
                registerReceiver(volumeReceiver, filter);
                receiverRegistered = true;
            }
        } else {
            // Deactivate and return volume buttons to system control!
            stopSilentAudio();

            if (mediaSession != null) {
                mediaSession.setActive(false);
            }

            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }

            if (receiverRegistered) {
                try {
                    unregisterReceiver(volumeReceiver);
                } catch (Exception ignored) {}
                receiverRegistered = false;
            }
        }
    }

    private void startSilentAudio() {
        if (isSilentRunning) return;
        isSilentRunning = true;
        silentThread = new Thread(() -> {
            try {
                int sampleRate = 8000;
                int bufferSize = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                silentTrack = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build())
                    .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();

                byte[] silence = new byte[bufferSize];
                silentTrack.play();
                while (isSilentRunning) {
                    silentTrack.write(silence, 0, silence.length);
                    Thread.sleep(150);
                }
                if (silentTrack != null) {
                    silentTrack.stop();
                    silentTrack.release();
                    silentTrack = null;
                }
            } catch (Exception ignored) {}
        });
        silentThread.start();
    }

    private void stopSilentAudio() {
        isSilentRunning = false;
        if (silentThread != null) {
            silentThread.interrupt();
            silentThread = null;
        }
        if (silentTrack != null) {
            try {
                silentTrack.stop();
                silentTrack.release();
            } catch (Exception ignored) {}
            silentTrack = null;
        }
    }

    @Override
    public void onDestroy() {
        isCounterSelected = false;
        syncVolumeControlState();
        if (soundPool != null) {
            soundPool.release();
            soundPool = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    public class VolumeBridge {
        @JavascriptInterface
        public void setVolumeCountingEnabled(boolean enabled) {
            volumeCountingEnabled = enabled;
            runOnUiThread(() -> syncVolumeControlState());
        }

        @JavascriptInterface
        public void setActiveCounter(String id, int count, int step, boolean isSelected) {
            activeCounterId = id;
            activeCount = count;
            activeStep = step > 0 ? step : 1;
            isCounterSelected = isSelected;
            runOnUiThread(() -> syncVolumeControlState());
        }
    }
}
