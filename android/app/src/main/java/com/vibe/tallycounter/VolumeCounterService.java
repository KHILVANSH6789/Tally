package com.vibe.tallycounter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.media.VolumeProvider;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.KeyEvent;
import androidx.core.app.NotificationCompat;

public class VolumeCounterService extends Service {

    private static final String TAG = "VolumeCounterService";
    private static final String CHANNEL_ID = "tally_volume_service_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "com.vibe.tallycounter.ACTION_START";
    public static final String ACTION_STOP = "com.vibe.tallycounter.ACTION_STOP";

    public static final String EXTRA_COUNTER_ID = "extra_counter_id";
    public static final String EXTRA_COUNTER_NAME = "extra_counter_name";
    public static final String EXTRA_COUNT = "extra_count";
    public static final String EXTRA_STEP = "extra_step";
    public static final String EXTRA_TARGET = "extra_target";

    public interface CountUpdateListener {
        void onCountChanged(String counterId, int count, String direction);
    }

    private static VolumeCounterService instance = null;
    private static CountUpdateListener countListener = null;

    private String activeCounterId = "";
    private String activeCounterName = "Tally";
    private int activeCount = 0;
    private int activeStep = 1;
    private int activeTarget = 0;

    private PowerManager.WakeLock wakeLock = null;
    private AudioManager audioManager = null;
    private MediaSession mediaSession = null;
    private SoundPool soundPool = null;
    private int soundTapNormalId = 0;
    private int soundTapDecreaseId = 0;
    private int soundGoalId = 0;

    private AudioTrack silentTrack = null;
    private Thread silentThread = null;
    private volatile boolean isSilentRunning = false;

    private boolean receiverRegistered = false;
    private long lastActionTime = 0;

    public static VolumeCounterService getInstance() {
        return instance;
    }

    public static void setListener(CountUpdateListener listener) {
        countListener = listener;
    }

    public int getActiveCount() {
        return activeCount;
    }

    public String getActiveCounterId() {
        return activeCounterId;
    }

    private final BroadcastReceiver volumeBroadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if ("android.media.VOLUME_CHANGED_ACTION".equals(intent.getAction())) {
                int streamType = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1);
                if (streamType == AudioManager.STREAM_MUSIC) {
                    int currentVol = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_VALUE", -1);
                    int prevVol = intent.getIntExtra("android.media.EXTRA_PREV_VOLUME_STREAM_VALUE", -1);
                    long now = System.currentTimeMillis();
                    if (now - lastActionTime < 75) return;

                    if (currentVol > prevVol) {
                        triggerCount("up");
                    } else if (currentVol < prevVol) {
                        triggerCount("down");
                    }
                    maximizeVolume();
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        initSoundPool();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            }

            activeCounterId = intent.getStringExtra(EXTRA_COUNTER_ID);
            activeCounterName = intent.getStringExtra(EXTRA_COUNTER_NAME);
            if (activeCounterName == null || activeCounterName.trim().isEmpty()) {
                activeCounterName = "Tally";
            }
            activeCount = intent.getIntExtra(EXTRA_COUNT, 0);
            activeStep = Math.max(1, intent.getIntExtra(EXTRA_STEP, 1));
            activeTarget = intent.getIntExtra(EXTRA_TARGET, 0);
        }

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting foreground service", e);
        }

        maximizeVolume();
        acquireWakeLock();
        setupMediaSession();
        startSilentAudio();
        registerVolumeReceiver();

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Tally Volume Controls",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Allows counting with volume keys when screen is off");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = activeCounterName != null && !activeCounterName.isEmpty() ? activeCounterName : "Tally Counter";
        String content = "Count: " + activeCount + " • Press volume buttons to count";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(content)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification());
            }
        } catch (Exception ignored) {}
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TallyCounter:ScreenOffVolumeLock");
                wakeLock.acquire();
            }
        }
    }

    private void setupMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSession(this, "TallyCounterMediaSession");

            // Remote Volume Provider routes hardware volume buttons without changing phone stream volume
            VolumeProvider volumeProvider = new VolumeProvider(VolumeProvider.VOLUME_CONTROL_RELATIVE, 100, 100) {
                @Override
                public void onAdjustVolume(int direction) {
                    if (direction > 0) {
                        triggerCount("up");
                    } else if (direction < 0) {
                        triggerCount("down");
                    }
                    maximizeVolume();
                }
            };
            mediaSession.setPlaybackToRemote(volumeProvider);

            // Handle Bluetooth & Headset media buttons
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public boolean onMediaButtonEvent(Intent mediaButtonIntent) {
                    KeyEvent event = (KeyEvent) mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                    if (event != null && event.getAction() == KeyEvent.ACTION_DOWN) {
                        int code = event.getKeyCode();
                        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_MEDIA_NEXT) {
                            triggerCount("up");
                            return true;
                        } else if (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
                            triggerCount("down");
                            return true;
                        } else if (code == KeyEvent.KEYCODE_HEADSETHOOK || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                            triggerCount("up");
                            return true;
                        }
                    }
                    return super.onMediaButtonEvent(mediaButtonIntent);
                }
            });

            mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        }

        PlaybackState state = new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
            .build();
        mediaSession.setPlaybackState(state);
        mediaSession.setActive(true);
    }

    private void initSoundPool() {
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            soundPool = new SoundPool.Builder()
                .setMaxStreams(8)
                .setAudioAttributes(attrs)
                .build();

            soundPool.setOnLoadCompleteListener((sp, sampleId, status) -> {
                Log.d(TAG, "SoundPool sample loaded: " + sampleId + " status: " + status);
            });

            soundTapNormalId = soundPool.load(this, R.raw.tap_normal, 1);
            soundTapDecreaseId = soundPool.load(this, R.raw.tap_decrease, 1);
            soundGoalId = soundPool.load(this, R.raw.goal_reached, 1);
        } catch (Exception e) {
            Log.e(TAG, "Error initializing SoundPool", e);
        }
    }

    private void playTapNormal() {
        boolean played = false;
        if (soundPool != null && soundTapNormalId != 0) {
            int streamId = soundPool.play(soundTapNormalId, 1.0f, 1.0f, 1, 0, 1.0f);
            if (streamId != 0) played = true;
        }
        if (!played) {
            try {
                MediaPlayer mp = MediaPlayer.create(this, R.raw.tap_normal);
                if (mp != null) {
                    mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                    mp.setVolume(1.0f, 1.0f);
                    mp.setOnCompletionListener(MediaPlayer::release);
                    mp.start();
                }
            } catch (Exception ignored) {}
        }
    }

    private void playTapDecrease() {
        boolean played = false;
        if (soundPool != null && soundTapDecreaseId != 0) {
            int streamId = soundPool.play(soundTapDecreaseId, 1.0f, 1.0f, 1, 0, 1.0f);
            if (streamId != 0) played = true;
        }
        if (!played) {
            try {
                MediaPlayer mp = MediaPlayer.create(this, R.raw.tap_decrease);
                if (mp != null) {
                    mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                    mp.setVolume(1.0f, 1.0f);
                    mp.setOnCompletionListener(MediaPlayer::release);
                    mp.start();
                }
            } catch (Exception ignored) {}
        }
    }

    private void playGoalReached() {
        boolean played = false;
        if (soundPool != null && soundGoalId != 0) {
            int streamId = soundPool.play(soundGoalId, 1.0f, 1.0f, 1, 0, 1.0f);
            if (streamId != 0) played = true;
        }
        if (!played) {
            try {
                MediaPlayer mp = MediaPlayer.create(this, R.raw.goal_reached);
                if (mp != null) {
                    mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                    mp.setVolume(1.0f, 1.0f);
                    mp.setOnCompletionListener(MediaPlayer::release);
                    mp.start();
                }
            } catch (Exception ignored) {}
        }
    }

    public synchronized void triggerCount(final String direction) {
        long now = System.currentTimeMillis();
        if (now - lastActionTime < 55) return;
        lastActionTime = now;

        // 1. Ensure volume is at 100%
        maximizeVolume();

        // 2. Play sound on media stream
        if ("up".equals(direction)) {
            playTapNormal();
        } else if ("down".equals(direction)) {
            playTapDecrease();
        }

        // 3. Tactile vibration feedback
        vibrate(false);

        // 4. Update count
        int previousCount = activeCount;
        if ("up".equals(direction)) {
            activeCount += activeStep;
        } else if ("down".equals(direction)) {
            activeCount = Math.max(0, activeCount - activeStep);
        }

        // 5. Target reached milestone check
        if ("up".equals(direction) && activeTarget > 0 && activeCount >= activeTarget && previousCount < activeTarget) {
            playGoalReached();
            vibrate(true);
        }

        // 6. Update ongoing notification
        updateNotification();

        // 7. Inform listener (MainActivity WebView sync)
        final int updated = activeCount;
        final String cid = activeCounterId;
        if (countListener != null) {
            countListener.onCountChanged(cid, updated, direction);
        }
    }

    private void vibrate(boolean milestone) {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (milestone) {
                        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 35, 45, 35}, -1));
                    } else {
                        v.vibrate(VibrationEffect.createOneShot(24, VibrationEffect.DEFAULT_AMPLITUDE));
                    }
                } else {
                    v.vibrate(milestone ? 75 : 24);
                }
            }
        } catch (Exception ignored) {}
    }

    public void maximizeVolume() {
        if (audioManager != null) {
            try {
                int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
            } catch (Exception ignored) {}
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
                    Thread.sleep(120);
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

    private void registerVolumeReceiver() {
        if (!receiverRegistered) {
            IntentFilter filter = new IntentFilter("android.media.VOLUME_CHANGED_ACTION");
            registerReceiver(volumeBroadcastReceiver, filter);
            receiverRegistered = true;
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        stopSilentAudio();

        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }

        if (receiverRegistered) {
            try {
                unregisterReceiver(volumeBroadcastReceiver);
            } catch (Exception ignored) {}
            receiverRegistered = false;
        }

        if (soundPool != null) {
            soundPool.release();
            soundPool = null;
        }

        try {
            stopForeground(true);
        } catch (Exception ignored) {}

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
