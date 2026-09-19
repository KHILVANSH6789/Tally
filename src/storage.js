// Storage & Midnight Engine for Tally Counter

const STORAGE_KEYS = {
  COUNTERS: 'tally_counters_v1',
  SETTINGS: 'tally_settings_v1',
  LAST_DATE: 'tally_last_date_v1',
};

// Format local YYYY-MM-DD
export function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatNominalDate(dateStr) {
  const today = getTodayDateString();
  if (dateStr === today) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (dateStr === yStr) return 'Yesterday';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function getMilestonesForTarget(target) {
  if (!target || target <= 0) return [];
  if (target < 4) {
    return [{ count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 }];
  }

  // 1. If divisible by 4: quarters (e.g. 100 -> 25, 50, 75, 100; 8 -> 2, 4, 6, 8)
  if (target % 4 === 0) {
    const s = target / 4;
    return [
      { count: s * 1, text: '1/4th of the way there! 🌟', isFinal: false, pct: 25 },
      { count: s * 2, text: 'Halfway there! 2/4 completed! 🚀', isFinal: false, pct: 50 },
      { count: s * 3, text: '3/4 of the way there! ⚡', isFinal: false, pct: 75 },
      { count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 },
    ];
  }

  // 2. If divisible by 3: thirds (e.g. 30 -> 10, 20, 30; 15 -> 5, 10, 15)
  if (target % 3 === 0) {
    const s = target / 3;
    return [
      { count: s * 1, text: '1/3rd of the way there! 🌟', isFinal: false, pct: 33 },
      { count: s * 2, text: '2/3rds of the way there! ⚡', isFinal: false, pct: 67 },
      { count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 },
    ];
  }

  // 3. If divisible by 2: halfway (e.g. 10 -> 5, 10; 14 -> 7, 14)
  if (target % 2 === 0) {
    const s = target / 2;
    return [
      { count: s, text: 'Halfway there! 50% completed! 🚀', isFinal: false, pct: 50 },
      { count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 },
    ];
  }

  // 4. If divisible by 5 and target <= 50 (e.g. 25 -> 5, 10, 15, 20, 25)
  if (target % 5 === 0 && target <= 50) {
    const s = target / 5;
    return [
      { count: s * 1, text: '1/5th of the way there! 🌟', isFinal: false, pct: 20 },
      { count: s * 2, text: '2/5ths of the way there! 🚀', isFinal: false, pct: 40 },
      { count: s * 3, text: 'Over halfway! 3/5 completed! ⚡', isFinal: false, pct: 60 },
      { count: s * 4, text: 'Almost there! 4/5 completed! 🔥', isFinal: false, pct: 80 },
      { count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 },
    ];
  }

  // 5. Fallback for odd or prime targets (e.g. 7 -> halfway at 4)
  const half = Math.ceil(target / 2);
  return [
    { count: half, text: 'Halfway there! Keep going! 🚀', isFinal: false, pct: Math.round((half / target) * 100) },
    { count: target, text: 'Daily Goal Reached! 🎉', isFinal: true, pct: 100 },
  ];
}

const DEFAULT_COUNTERS = [
  {
    id: 'counter-water',
    name: 'Water Glasses',
    count: 5,
    target: 8,
    step: 1,
    color: '#10b981',
    createdAt: Date.now(),
    history: {},
  },
  {
    id: 'counter-focus',
    name: 'Focus Sessions',
    count: 3,
    target: 6,
    step: 1,
    color: '#818cf8',
    createdAt: Date.now(),
    history: {},
  },
  {
    id: 'counter-reading',
    name: 'Pages Read',
    count: 14,
    target: 30,
    step: 1,
    color: '#fbbf24',
    createdAt: Date.now(),
    history: {},
  },
];

const DEFAULT_SETTINGS = {
  midnightReset: true,
  haptics: true,
  audio: true,
  volumeKeys: false,
};

class DataStore {
  constructor() {
    this.counters = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.midnightTimerId = null;
    this.listeners = new Set();
    this.load();
    this.setupMidnightTimer();
  }

  load() {
    try {
      const savedCounters = localStorage.getItem(STORAGE_KEYS.COUNTERS);
      if (savedCounters) {
        this.counters = JSON.parse(savedCounters);
      } else {
        this.counters = DEFAULT_COUNTERS;
        this.saveCounters();
      }

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      } else {
        this.settings = DEFAULT_SETTINGS;
        this.saveSettings();
      }

      this.checkMidnightRollover();
    } catch (e) {
      console.error('Storage load failed:', e);
      this.counters = DEFAULT_COUNTERS;
      this.settings = DEFAULT_SETTINGS;
    }
  }

  saveCounters() {
    try {
      localStorage.setItem(STORAGE_KEYS.COUNTERS, JSON.stringify(this.counters));
      this.notify();
    } catch (e) {
      console.error('Storage save counters failed:', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
      this.notify();
    } catch (e) {
      console.error('Storage save settings failed:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  checkMidnightRollover() {
    const today = getTodayDateString();
    const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE);

    if (!lastDate) {
      localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
      return false;
    }

    if (lastDate !== today) {
      if (this.settings.midnightReset) {
        // Archive yesterday's count for each counter and reset to 0
        this.counters = this.counters.map(counter => {
          const history = { ...(counter.history || {}) };
          history[lastDate] = counter.count;
          return {
            ...counter,
            count: 0,
            history,
          };
        });
        this.saveCounters();
      }
      localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
      return true;
    }

    return false;
  }

  setupMidnightTimer() {
    if (this.midnightTimerId) {
      clearTimeout(this.midnightTimerId);
    }

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.midnightTimerId = setTimeout(() => {
      this.checkMidnightRollover();
      this.setupMidnightTimer();
    }, msUntilMidnight);
  }

  getCounters() {
    return this.counters;
  }

  getCounterById(id) {
    return this.counters.find(c => c.id === id) || null;
  }

  addCounter({ name, color, target, initialCount = 0, touchIncrement = true, timerSeconds = 0 }) {
    const newCounter = {
      id: 'counter_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: name.trim(),
      count: Math.max(0, parseInt(initialCount, 10) || 0),
      target: target ? Math.max(1, parseInt(target, 10)) : null,
      step: 1,
      color: color || '#10b981',
      touchIncrement: touchIncrement !== false,
      timerSeconds: Math.max(0, parseInt(timerSeconds, 10) || 0),
      createdAt: Date.now(),
      history: {},
    };
    this.counters.push(newCounter);
    this.saveCounters();
    return newCounter;
  }

  updateCounter(id, updates) {
    const idx = this.counters.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.counters[idx] = { ...this.counters[idx], ...updates };
      this.saveCounters();
      return this.counters[idx];
    }
    return null;
  }

  incrementCounter(id, amount = null) {
    const counter = this.getCounterById(id);
    if (!counter) return null;
    const step = amount !== null ? amount : (counter.step || 1);
    const prevCount = counter.count;
    counter.count = Math.max(0, counter.count + step);
    this.saveCounters();

    let milestone = null;
    if (counter.target && counter.target > 0) {
      const milestones = getMilestonesForTarget(counter.target);
      for (let i = milestones.length - 1; i >= 0; i--) {
        const m = milestones[i];
        if (prevCount < m.count && counter.count >= m.count) {
          milestone = m;
          break;
        }
      }
    }

    return {
      counter,
      reachedTarget: !!(milestone && milestone.isFinal),
      milestone,
    };
  }

  decrementCounter(id, amount = null) {
    const counter = this.getCounterById(id);
    if (!counter) return null;
    const step = amount !== null ? amount : (counter.step || 1);
    counter.count = Math.max(0, counter.count - step);
    this.saveCounters();
    return counter;
  }

  resetCounter(id) {
    const counter = this.getCounterById(id);
    if (!counter) return null;
    counter.count = 0;
    this.saveCounters();
    return counter;
  }

  deleteCounter(id) {
    this.counters = this.counters.filter(c => c.id !== id);
    this.saveCounters();
  }

  resetAllCounters() {
    this.counters = this.counters.map(c => ({ ...c, count: 0 }));
    this.saveCounters();
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }
}

export const store = new DataStore();
