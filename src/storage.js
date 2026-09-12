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

  addCounter({ name, color, target, initialCount = 0 }) {
    const newCounter = {
      id: 'counter_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: name.trim(),
      count: Math.max(0, parseInt(initialCount, 10) || 0),
      target: target ? Math.max(1, parseInt(target, 10)) : null,
      step: 1,
      color: color || '#10b981',
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
    return { counter, reachedTarget: counter.target && prevCount < counter.target && counter.count >= counter.target };
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
