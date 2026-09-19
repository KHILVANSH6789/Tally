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
      goalSplit: '/sounds/Goal_Split.mp3',
      timeUp: '/sounds/Time_Up.mp3',
    };

    // Preload audio objects
    this.introAudio = null;
    this.goalAudio = null;
    this.goalSplitAudio = null;
    this.timeUpAudio = null;

    // Fast click pools for instant zero-latency rapid tapping
    this.clickPool = [];
    this.decreasePool = [];
    this.poolSize = 8;
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

      this.goalSplitAudio = new Audio(this.urls.goalSplit);
      this.goalSplitAudio.preload = 'auto';

      this.timeUpAudio = new Audio(this.urls.timeUp);
      this.timeUpAudio.preload = 'auto';

      for (let i = 0; i < this.poolSize; i++) {
        const tapAudio = new Audio(this.urls.tap);
        tapAudio.preload = 'auto';
        tapAudio.volume = 1.0;
        this.clickPool.push(tapAudio);

        const decAudio = new Audio(this.urls.decrease);
        decAudio.preload = 'auto';
        decAudio.volume = 1.0;
        this.decreasePool.push(decAudio);
      }
    } catch (e) {
      console.warn('Audio preloading error:', e);
    }
  }

  // Play app opening intro sound (respects device media volume)
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
      if (this.clickPool && this.clickPool.length > 0) {
        const audio = this.clickPool[this.tapPoolIndex];
        this.tapPoolIndex = (this.tapPoolIndex + 1) % this.clickPool.length;
        audio.currentTime = 0;
        audio.volume = 1.0;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            const fallback = new Audio(this.urls.tap);
            fallback.volume = 1.0;
            fallback.play().catch(() => {});
          });
        }
      } else {
        const a = new Audio(this.urls.tap);
        a.volume = 1.0;
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
      if (this.decreasePool && this.decreasePool.length > 0) {
        const audio = this.decreasePool[this.decPoolIndex];
        this.decPoolIndex = (this.decPoolIndex + 1) % this.decreasePool.length;
        audio.currentTime = 0;
        audio.volume = 1.0;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            const fallback = new Audio(this.urls.decrease);
            fallback.volume = 1.0;
            fallback.play().catch(() => {});
          });
        }
      } else {
        const a = new Audio(this.urls.decrease);
        a.volume = 1.0;
        a.play().catch(() => {});
      }
    } catch (e) {
      // safe ignore
    }
  }

  playDecrease() {
    this.playDecrement();
  }

  playNav() {
    // No-op
  }

  // Quarter milestone split sound (Goal_Split.mp3)
  playQuarterMilestone() {
    if (!this.enabled) return;
    try {
      if (!this.goalSplitAudio) {
        this.goalSplitAudio = new Audio(this.urls.goalSplit);
      }
      this.goalSplitAudio.currentTime = 0;
      this.goalSplitAudio.volume = 1.0;
      this.goalSplitAudio.play().catch(() => {});
    } catch (e) {
      // safe ignore
    }
  }

  // Goal / Daily Target 100% reached sound (Goal_Reached.mp3)
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

  // Counter Timer expired sound (Time_Up.mp3)
  playTimeUp() {
    if (!this.enabled) return;
    try {
      if (!this.timeUpAudio) {
        this.timeUpAudio = new Audio(this.urls.timeUp);
      }
      this.timeUpAudio.currentTime = 0;
      this.timeUpAudio.volume = 1.0;
      this.timeUpAudio.play().catch(() => {});
    } catch (e) {
      // safe ignore
    }
  }
}

export const sound = new SoundEngine();
