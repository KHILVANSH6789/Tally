// Audio System using provided MP3 sound package with rapid-fire pooling

class SoundEngine {
  constructor() {
    this.enabled = true;

    // Sound file URLs
    this.urls = {
      intro: '/sounds/App_Opening_Intro.mp3',
      tap: '/sounds/Tap_Normal.mp3',
      decrease: '/sounds/Tap_Decrease.mp3',
      goal: '/sounds/Goal_Reached.mp3',
    };

    // Preload audio objects
    this.introAudio = null;
    this.goalAudio = null;

    // Fast click pools for instant zero-latency rapid tapping
    this.clickPool = [];
    this.decreasePool = [];
    this.poolSize = 6;
    this.tapPoolIndex = 0;
    this.decPoolIndex = 0;

    this.init();
  }

  init() {
    try {
      this.introAudio = new Audio(this.urls.intro);
      this.introAudio.preload = 'auto';

      this.goalAudio = new Audio(this.urls.goal);
      this.goalAudio.preload = 'auto';

      for (let i = 0; i < this.poolSize; i++) {
        const tapAudio = new Audio(this.urls.tap);
        tapAudio.preload = 'auto';
        this.clickPool.push(tapAudio);

        const decAudio = new Audio(this.urls.decrease);
        decAudio.preload = 'auto';
        this.decreasePool.push(decAudio);
      }
    } catch (e) {
      console.warn('Audio preloading error:', e);
    }
  }

  // Play app opening intro sound
  playIntro() {
    if (!this.enabled) return;
    try {
      if (!this.introAudio) {
        this.introAudio = new Audio(this.urls.intro);
      }
      this.introAudio.currentTime = 0;
      this.introAudio.volume = 1.0;
      const playPromise = this.introAudio.play();
      if (playPromise) {
        playPromise.catch(err => {
          console.log('Intro autoplay notice:', err);
        });
      }
    } catch (e) {
      console.warn('Could not play intro sound:', e);
    }
  }

  // Rapid mechanical tap count sound (Tap_Normal.mp3)
  playClick() {
    if (!this.enabled) return;
    try {
      if (this.clickPool.length > 0) {
        const audio = this.clickPool[this.tapPoolIndex];
        audio.currentTime = 0;
        audio.volume = 0.9;
        audio.play().catch(() => {});
        this.tapPoolIndex = (this.tapPoolIndex + 1) % this.clickPool.length;
      } else {
        const a = new Audio(this.urls.tap);
        a.play().catch(() => {});
      }
    } catch (e) {
      // safe ignore
    }
  }

  // Tally decrease sound effect (Tap_Decrease.mp3)
  playDecrement() {
    if (!this.enabled) return;
    try {
      if (this.decreasePool.length > 0) {
        const audio = this.decreasePool[this.decPoolIndex];
        audio.currentTime = 0;
        audio.volume = 0.9;
        audio.play().catch(() => {});
        this.decPoolIndex = (this.decPoolIndex + 1) % this.decreasePool.length;
      } else {
        const a = new Audio(this.urls.decrease);
        a.play().catch(() => {});
      }
    } catch (e) {
      // safe ignore
    }
  }

  playDecrease() {
    this.playDecrement();
  }

  // UI Navigation sound removed as requested
  playNav() {
    // No-op
  }

  // Goal / Daily Target reached sound (Goal_Reached.mp3)
  playMilestone() {
    if (!this.enabled) return;
    try {
      if (!this.goalAudio) {
        this.goalAudio = new Audio(this.urls.goal);
      }
      this.goalAudio.currentTime = 0;
      this.goalAudio.volume = 1.0;
      this.goalAudio.play().catch(() => {});
    } catch (e) {
      // safe ignore
    }
  }
}

export const sound = new SoundEngine();
