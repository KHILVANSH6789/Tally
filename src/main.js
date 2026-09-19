import { store, formatNominalDate, getTodayDateString, getMilestonesForTarget } from './storage.js';
import { sound } from './audio.js';

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';

const APP_VERSION = 'v1.0.4';

async function triggerHaptic(type = 'light') {
  if (!store.settings.haptics) return;

  try {
    if (type === 'success') {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } else if (type === 'medium') {
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }
  } catch (e) {
    // Fallback to HTML5 Vibration API
  }

  if (navigator.vibrate) {
    if (type === 'success') {
      navigator.vibrate([20, 50, 20]);
    } else if (type === 'medium') {
      navigator.vibrate(25);
    } else {
      navigator.vibrate(12);
    }
  }
}

// State
let activeCounterId = null;
let currentStep = 1;
let activeCardElement = null;
let confirmCallback = null;
let lastBackPressTime = 0;
let isWheelPointerDown = false;
let colorWheelDrawn = false;

// Detail Timer State
let timerIntervalId = null;
let timerRemainingSeconds = 0;
let timerTotalSeconds = 0;
let isTimerPaused = false;
let isTimerRunning = false;

// Milestone celebration state
let milestoneTimeoutId = null;

// GitHub Updater State
let latestReleaseApkUrl = null;

// Intro Splash Elements
const appIntro = document.getElementById('app-intro');

// DOM Elements
const countersGrid = document.getElementById('counters-grid');
const emptyState = document.getElementById('empty-state');
const statTotalCount = document.getElementById('stat-total-count');
const statActiveCounters = document.getElementById('stat-active-counters');
const currentDateLabel = document.getElementById('current-date-label');
const midnightResetBadge = document.getElementById('midnight-reset-badge');

// Detail Elements
const counterDetailView = document.getElementById('counter-detail-view');
const btnCloseDetail = document.getElementById('btn-close-detail');
const detailCounterTitle = document.getElementById('detail-counter-title');
const detailColorPill = document.getElementById('detail-color-pill');
const detailCountNum = document.getElementById('detail-count-num');
const tallyTouchArea = document.getElementById('tally-touch-area');
const detailTargetBadge = document.getElementById('detail-target-badge');
const detailTargetText = document.getElementById('detail-target-text');
const targetProgressBarContainer = document.getElementById('target-progress-bar-container');
const targetProgressFill = document.getElementById('target-progress-fill');
const btnDecrement = document.getElementById('btn-decrement');
const btnResetCounter = document.getElementById('btn-reset-counter');
const btnEditCurrent = document.getElementById('btn-edit-current');
const btnDeleteCurrent = document.getElementById('btn-delete-current');
const stepChips = document.querySelectorAll('.step-chip');

// Corner Touch Increment Toggle Button & Status
const btnCornerTouchToggle = document.getElementById('btn-corner-touch-toggle');
const iconTouchUnlocked = document.getElementById('icon-touch-unlocked');
const iconTouchLocked = document.getElementById('icon-touch-locked');
const labelTouchStatus = document.getElementById('label-touch-status');
const detailTapHintText = document.getElementById('detail-tap-hint-text');

// Timer Widget Elements
const detailTimerWidget = document.getElementById('detail-timer-widget');
const detailTimerText = document.getElementById('detail-timer-text');
const btnTimerToggle = document.getElementById('btn-timer-toggle');
const btnTimerReset = document.getElementById('btn-timer-reset');

// Milestone Celebration Elements
const milestonePopup = document.getElementById('milestone-popup');
const milestonePopupText = document.getElementById('milestone-popup-text');

// Modals
const modalCounter = document.getElementById('modal-counter');
const modalTitle = document.getElementById('modal-title');
const formCounter = document.getElementById('form-counter');
const inputCounterId = document.getElementById('input-counter-id');
const inputCounterName = document.getElementById('input-counter-name');
const inputCounterInitial = document.getElementById('input-counter-initial');
const inputCounterTarget = document.getElementById('input-counter-target');
const inputCounterTimer = document.getElementById('input-counter-timer');
const timerChips = document.querySelectorAll('.timer-chip');
const btnDeleteCounter = document.getElementById('btn-delete-counter');

// Interactive Color Wheel Elements
const colorWheelStage = document.getElementById('color-wheel-stage');
const colorWheelCanvas = document.getElementById('color-wheel-canvas');
const colorWheelCursor = document.getElementById('color-wheel-cursor');
const inputCounterHex = document.getElementById('input-counter-hex');
const hexPreviewDot = document.getElementById('hex-preview-dot');
let selectedColor = '#10b981';

const modalHistory = document.getElementById('modal-history');
const historyContent = document.getElementById('history-content');
const inputHistorySearch = document.getElementById('input-history-search');
const btnClearHistorySearch = document.getElementById('btn-clear-history-search');
const selectHistorySort = document.getElementById('select-history-sort');
const modalSettings = document.getElementById('modal-settings');
const settingMidnightReset = document.getElementById('setting-midnight-reset');
const settingHaptics = document.getElementById('setting-haptics');
const settingAudio = document.getElementById('setting-audio');
const settingVolumeKeys = document.getElementById('setting-volume-keys');
const btnCheckUpdates = document.getElementById('btn-check-updates');
const btnClearAll = document.getElementById('btn-clear-all');

// Update Modal Elements
const modalUpdate = document.getElementById('modal-update');
const updateVersionTag = document.getElementById('update-version-tag');
const updateReleaseDate = document.getElementById('update-release-date');
const updateNotesBox = document.getElementById('update-notes-box');
const updateProgressContainer = document.getElementById('update-progress-container');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateProgressText = document.getElementById('update-progress-text');
const btnDoUpdate = document.getElementById('btn-do-update');

const modalConfirm = document.getElementById('modal-confirm');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const toastEl = document.getElementById('toast');

// Initialize
function init() {
  sound.enabled = store.settings.audio;
  settingMidnightReset.checked = store.settings.midnightReset;
  settingHaptics.checked = store.settings.haptics;
  settingAudio.checked = store.settings.audio;
  if (settingVolumeKeys) {
    settingVolumeKeys.checked = !!store.settings.volumeKeys;
  }

  updateDateDisplay();
  renderCounters();
  updateMidnightBadge();
  syncStateToAndroid(false);

  // Play cinematic intro sequence (awaits local font readiness)
  runAppIntroSequence();

  // Listen to store updates
  store.subscribe(() => {
    renderCounters();
    if (activeCounterId) {
      updateDetailView(activeCounterId);
    }
  });

  attachEventListeners();
  initColorWheel();

  // Check for updates silently in background
  setTimeout(() => {
    checkForAppUpdate(false);
  }, 3500);
}

// Cinematic Intro Splash Sequence (Eliminates font swap glitch)
function runAppIntroSequence() {
  if (!appIntro) return;

  const startAnimation = () => {
    appIntro.classList.add('intro-ready');
    sound.playIntro();

    const timer = setTimeout(() => {
      finishIntro();
    }, 2100);

    appIntro.addEventListener(
      'click',
      () => {
        clearTimeout(timer);
        finishIntro();
      },
      { once: true }
    );
  };

  if (document.fonts && document.fonts.ready) {
    Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 250)),
    ]).then(startAnimation);
  } else {
    startAnimation();
  }

  function finishIntro() {
    appIntro.classList.add('intro-fade-out');
    setTimeout(() => {
      appIntro.classList.add('hidden');
    }, 600);
  }
}

function updateDateDisplay() {
  const now = new Date();
  currentDateLabel.textContent = now.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function updateMidnightBadge() {
  if (store.settings.midnightReset) {
    midnightResetBadge.textContent = 'Midnight Reset: ON';
    midnightResetBadge.classList.remove('off');
  } else {
    midnightResetBadge.textContent = 'Midnight Reset: OFF';
    midnightResetBadge.classList.add('off');
  }
}

// Render Counters Grid (Home selection menu - clean card display)
function renderCounters() {
  const counters = store.getCounters();

  // Update Stats
  const totalCounts = counters.reduce((sum, c) => sum + (c.count || 0), 0);
  statTotalCount.textContent = totalCounts.toLocaleString();
  statActiveCounters.textContent = counters.length;

  if (counters.length === 0) {
    countersGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  countersGrid.innerHTML = counters
    .map(c => {
      const targetHtml = c.target
        ? `<span class="card-target-pill">Goal: ${c.target}</span>`
        : '';
      const timerHtml = (c.timerSeconds && c.timerSeconds > 0)
        ? `<span class="card-timer-pill" title="Timer: ${formatTimer(c.timerSeconds)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15 15"></polyline>
            </svg>
            ${formatTimer(c.timerSeconds)}
          </span>`
        : '';
      return `
        <div class="counter-card" data-id="${c.id}" style="--card-accent: ${c.color}">
          <div class="counter-card-info">
            <span class="counter-card-name">${escapeHtml(c.name)}</span>
            <div class="counter-card-meta">
              <span>Today</span>
              ${targetHtml}
              ${timerHtml}
            </div>
          </div>
          <div class="counter-card-right">
            <span class="counter-card-count">${c.count}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

// Format seconds into MM:SS
function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Countdown Timer Engine (Awaits first tap/increase to start)
function setupCounterTimer(counter) {
  stopCounterTimer();

  timerTotalSeconds = counter.timerSeconds || 0;
  if (timerTotalSeconds <= 0) {
    if (detailTimerWidget) detailTimerWidget.classList.add('hidden');
    return;
  }

  if (detailTimerWidget) detailTimerWidget.classList.remove('hidden');
  timerRemainingSeconds = timerTotalSeconds;
  isTimerPaused = false;
  isTimerRunning = false;
  if (btnTimerToggle) btnTimerToggle.textContent = '▶';
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (detailTimerText) {
    detailTimerText.textContent = formatTimer(timerRemainingSeconds);
  }
}

function startTimerCountdown() {
  clearInterval(timerIntervalId);
  if (timerTotalSeconds <= 0) return;

  timerIntervalId = setInterval(() => {
    if (isTimerPaused) return;

    if (timerRemainingSeconds > 0) {
      timerRemainingSeconds--;
      updateTimerDisplay();

      if (timerRemainingSeconds === 0) {
        sound.playTimeUp();
        triggerHaptic('medium');
        showToast("Time's up! ⏰");
        stopCounterTimer();
        if (btnTimerToggle) btnTimerToggle.textContent = '▶';
      }
    }
  }, 1000);
}

// Triggered when tally count increases (starts timer or resets back to full time)
function onTallyCountIncrease() {
  if (timerTotalSeconds > 0) {
    timerRemainingSeconds = timerTotalSeconds;
    isTimerRunning = true;
    isTimerPaused = false;
    if (btnTimerToggle) btnTimerToggle.textContent = '⏸';
    updateTimerDisplay();
    startTimerCountdown();
  }
}

function resetCounterTimer() {
  if (timerTotalSeconds > 0) {
    timerRemainingSeconds = timerTotalSeconds;
    isTimerPaused = false;
    updateTimerDisplay();
    if (isTimerRunning) {
      if (btnTimerToggle) btnTimerToggle.textContent = '⏸';
      startTimerCountdown();
    }
  }
}

function stopCounterTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  isTimerRunning = false;
  isTimerPaused = false;
}

// Touch Lock UI State
function updateTouchLockUI(counter) {
  const isLocked = counter.touchIncrement === false;
  if (tallyTouchArea) {
    tallyTouchArea.classList.toggle('touch-locked', isLocked);
  }
  if (btnCornerTouchToggle) {
    btnCornerTouchToggle.classList.toggle('locked', isLocked);
    btnCornerTouchToggle.setAttribute(
      'aria-label',
      isLocked ? 'Touch Increment: Locked (Tap to Enable)' : 'Touch Increment: Enabled (Tap to Lock)'
    );
    btnCornerTouchToggle.setAttribute(
      'title',
      isLocked ? 'Touch counting is locked. Tap to enable.' : 'Touch counting is active. Tap to lock.'
    );
  }
  if (iconTouchUnlocked && iconTouchLocked) {
    iconTouchUnlocked.classList.toggle('hidden', isLocked);
    iconTouchLocked.classList.toggle('hidden', !isLocked);
  }
  if (labelTouchStatus) {
    labelTouchStatus.textContent = isLocked ? 'Touch: OFF' : 'Touch: ON';
  }
  if (detailTapHintText) {
    detailTapHintText.textContent = isLocked
      ? 'Touch counting locked (use volume or buttons)'
      : 'Tap anywhere to count';
  }
}

// Subdivided Dynamic Milestone Targets & Progress Notches
function updateProgressNotches(counter) {
  const container = document.getElementById('progress-notches');
  if (!container) return;

  if (!counter.target || counter.target <= 0) {
    container.innerHTML = '';
    return;
  }

  const milestones = getMilestonesForTarget(counter.target);
  // Intermediate milestone notches (excluding 100% end goal)
  const intermediate = milestones.filter(m => !m.isFinal);

  container.innerHTML = intermediate
    .map(m => {
      const isReached = counter.count >= m.count;
      return `<span class="progress-notch ${isReached ? 'reached' : ''}" style="left: ${m.pct}%" title="${m.count} (${m.pct}%)"></span>`;
    })
    .join('');
}

// Gentle & Smooth Milestone Celebration (Low-end device friendly)
function triggerMilestoneCelebration(milestone) {
  if (!milestone) return;

  if (milestone.isFinal) {
    sound.playMilestone(); // Goal_Reached.mp3
    triggerHaptic('success');
    showToast(milestone.text || 'Daily Goal Reached! 🎉');
  } else {
    sound.playQuarterMilestone(); // Goal_Split.mp3
    triggerHaptic('light');

    if (milestonePopup && milestonePopupText) {
      milestonePopupText.textContent = milestone.text;
      milestonePopup.classList.remove('hidden');

      requestAnimationFrame(() => {
        milestonePopup.classList.add('show');
      });

      if (milestoneTimeoutId) clearTimeout(milestoneTimeoutId);
      milestoneTimeoutId = setTimeout(() => {
        milestonePopup.classList.remove('show');
        setTimeout(() => {
          milestonePopup.classList.add('hidden');
        }, 280);
      }, 2200);
    }
  }
}

// Smooth Card Morphing Animation (Opening Tally)
function openCounterDetail(counterId, cardElement) {
  const counter = store.getCounterById(counterId);
  if (!counter) return;

  activeCounterId = counterId;
  activeCardElement = cardElement;
  currentStep = counter.step || 1;
  updateStepChipsUI();

  // Populate data
  updateDetailView(counterId);
  updateTouchLockUI(counter);
  setupCounterTimer(counter);
  syncStateToAndroid(true);

  // Push history state for back navigation & swipe gestures
  try {
    if (!history.state || history.state.view !== 'detail') {
      history.pushState({ view: 'detail', id: counterId }, '');
    }
  } catch (e) {}

  // FLIP animation calculation
  if (cardElement) {
    const cardRect = cardElement.getBoundingClientRect();
    const targetRect = {
      left: 0,
      top: 0,
      width: window.innerWidth > 480 ? 480 : window.innerWidth,
      height: window.innerHeight,
    };

    const scaleX = cardRect.width / targetRect.width;
    const scaleY = cardRect.height / targetRect.height;
    const transX = cardRect.left + cardRect.width / 2 - window.innerWidth / 2;
    const transY = cardRect.top + cardRect.height / 2 - window.innerHeight / 2;

    counterDetailView.style.transition = 'none';
    counterDetailView.style.transform = `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`;
    counterDetailView.style.borderRadius = '24px';
    counterDetailView.style.opacity = '0.3';
    counterDetailView.classList.remove('closing');
    counterDetailView.classList.add('active');
    counterDetailView.setAttribute('aria-hidden', 'false');

    void counterDetailView.offsetHeight;

    requestAnimationFrame(() => {
      counterDetailView.style.transition =
        'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease, border-radius 0.38s ease';
      counterDetailView.style.transform = 'translate(0px, 0px) scale(1, 1)';
      counterDetailView.style.borderRadius = '0px';
      counterDetailView.style.opacity = '1';
    });
  } else {
    counterDetailView.classList.remove('closing');
    counterDetailView.classList.add('active');
    counterDetailView.setAttribute('aria-hidden', 'false');
  }

  triggerHaptic('light');
}

// Close Counter Detail with smooth collapse
function closeCounterDetail(popHistory = true) {
  if (!activeCounterId) return;

  if (popHistory && history.state && history.state.view === 'detail') {
    history.back();
    return;
  }

  // Deactivate native volume counting & stop timer
  stopCounterTimer();
  syncStateToAndroid(false);

  if (activeCardElement) {
    const cardRect = activeCardElement.getBoundingClientRect();
    const scaleX = cardRect.width / (window.innerWidth > 480 ? 480 : window.innerWidth);
    const scaleY = cardRect.height / window.innerHeight;
    const transX = cardRect.left + cardRect.width / 2 - window.innerWidth / 2;
    const transY = cardRect.top + cardRect.height / 2 - window.innerHeight / 2;

    counterDetailView.style.transition =
      'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, border-radius 0.32s ease';
    counterDetailView.style.transform = `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`;
    counterDetailView.style.borderRadius = '20px';
    counterDetailView.style.opacity = '0';

    setTimeout(() => {
      counterDetailView.classList.remove('active');
      counterDetailView.setAttribute('aria-hidden', 'true');
      counterDetailView.style.transform = '';
      counterDetailView.style.borderRadius = '';
      counterDetailView.style.opacity = '';
      activeCounterId = null;
      activeCardElement = null;
    }, 320);
  } else {
    counterDetailView.classList.add('closing');
    setTimeout(() => {
      counterDetailView.classList.remove('active', 'closing');
      counterDetailView.setAttribute('aria-hidden', 'true');
      activeCounterId = null;
    }, 320);
  }
}

// Update Detail View contents
function updateDetailView(counterId) {
  const counter = store.getCounterById(counterId);
  if (!counter) return;

  detailCounterTitle.textContent = counter.name;
  detailColorPill.style.backgroundColor = counter.color;
  detailColorPill.style.boxShadow = `0 0 10px ${counter.color}`;
  counterDetailView.style.setProperty('--active-accent', counter.color);

  detailCountNum.textContent = counter.count;

  // Target UI
  if (counter.target && counter.target > 0) {
    detailTargetBadge.classList.remove('hidden');
    detailTargetText.textContent = `Goal: ${counter.target}`;
    targetProgressBarContainer.classList.remove('hidden');

    const pct = Math.min(100, Math.round((counter.count / counter.target) * 100));
    targetProgressFill.style.width = `${pct}%`;
  } else {
    detailTargetBadge.classList.add('hidden');
    targetProgressBarContainer.classList.add('hidden');
  }

  updateProgressNotches(counter);
}

// Step Chips
function updateStepChipsUI() {
  stepChips.forEach(chip => {
    const stepVal = parseInt(chip.dataset.step, 10);
    if (stepVal === currentStep) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// Trigger count bump
function animateNumberBump() {
  detailCountNum.classList.remove('bump');
  void detailCountNum.offsetWidth;
  detailCountNum.classList.add('bump');
}

// Show Toast
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2200);
}

// Modals management
function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
}

// ================= Interactive Hex Color Wheel Engine =================
function hsvToRgb(h, s, v) {
  let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  let r = Math.round(f(5) * 255);
  let g = Math.round(f(3) * 255);
  let b = Math.round(f(1) * 255);
  return [r, g, b];
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    v = max;
  let d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return [16, 185, 129];
  let num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function drawColorWheel() {
  if (!colorWheelCanvas || colorWheelDrawn) return;
  const ctx = colorWheelCanvas.getContext('2d');
  const size = 200;
  const radius = 96;
  const center = 100;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        const sat = Math.min(1, dist / radius);
        const [r, g, b] = hsvToRgb(angle, sat, 1.0);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        if (dist > radius - 1) {
          data[idx + 3] = Math.round(255 * (radius - dist));
        } else {
          data[idx + 3] = 255;
        }
      } else {
        data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  colorWheelDrawn = true;
}

function handleWheelPointer(clientX, clientY) {
  if (!colorWheelCanvas) return;
  const rect = colorWheelCanvas.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const dist = Math.hypot(dx, dy);
  const radius = rect.width * 0.48;

  let angle = Math.atan2(dy, dx);
  let deg = angle * (180 / Math.PI);
  if (deg < 0) deg += 360;

  const clampedDist = Math.min(dist, radius);
  const sat = clampedDist / radius;
  const [r, g, b] = hsvToRgb(deg, sat, 1.0);
  const hex = rgbToHex(r, g, b);

  // Position cursor relative to 200x200 canvas
  const cursorX = 100 + Math.cos(angle) * (clampedDist * (100 / (rect.width / 2)));
  const cursorY = 100 + Math.sin(angle) * (clampedDist * (100 / (rect.height / 2)));
  if (colorWheelCursor) {
    colorWheelCursor.style.left = `${cursorX}px`;
    colorWheelCursor.style.top = `${cursorY}px`;
  }

  selectedColor = hex;
  if (hexPreviewDot) hexPreviewDot.style.backgroundColor = hex;
  if (inputCounterHex) inputCounterHex.value = hex.replace('#', '').toUpperCase();
}

function setColorWheelFromHex(hex) {
  if (!hex) hex = '#10b981';
  if (!hex.startsWith('#')) hex = '#' + hex;
  selectedColor = hex.toLowerCase();

  const [r, g, b] = hexToRgb(hex);
  const [h, s, v] = rgbToHsv(r, g, b);

  const radius = 92;
  const angle = h * (Math.PI / 180);
  const dist = s * radius;
  const cursorX = 100 + Math.cos(angle) * dist;
  const cursorY = 100 + Math.sin(angle) * dist;

  if (colorWheelCursor) {
    colorWheelCursor.style.left = `${cursorX}px`;
    colorWheelCursor.style.top = `${cursorY}px`;
  }
  if (hexPreviewDot) hexPreviewDot.style.backgroundColor = hex;
  if (inputCounterHex) inputCounterHex.value = hex.replace('#', '').toUpperCase();
}

function initColorWheel() {
  drawColorWheel();

  if (colorWheelStage) {
    colorWheelStage.addEventListener('pointerdown', e => {
      isWheelPointerDown = true;
      try {
        colorWheelStage.setPointerCapture(e.pointerId);
      } catch (err) {}
      handleWheelPointer(e.clientX, e.clientY);
    });

    colorWheelStage.addEventListener('pointermove', e => {
      if (isWheelPointerDown) {
        handleWheelPointer(e.clientX, e.clientY);
      }
    });

    const endPointer = e => {
      if (isWheelPointerDown) {
        isWheelPointerDown = false;
        try {
          colorWheelStage.releasePointerCapture(e.pointerId);
        } catch (err) {}
      }
    };
    colorWheelStage.addEventListener('pointerup', endPointer);
    colorWheelStage.addEventListener('pointercancel', endPointer);
  }

  if (inputCounterHex) {
    inputCounterHex.addEventListener('input', e => {
      let raw = e.target.value.replace(/[^0-9a-fA-F]/g, '');
      if (raw.length > 6) raw = raw.slice(0, 6);
      e.target.value = raw.toUpperCase();

      if (raw.length === 6 || raw.length === 3) {
        let fullHex = '#' + raw;
        if (raw.length === 3) {
          fullHex = '#' + raw.split('').map(ch => ch + ch).join('');
        }
        setColorWheelFromHex(fullHex);
      }
    });
  }
}

// Sync with native Android (passing isSelected state)
function syncStateToAndroid(isSelected = !!activeCounterId) {
  if (window.AndroidBridge) {
    try {
      if (typeof window.AndroidBridge.setActiveCounter === 'function') {
        window.AndroidBridge.setActiveCounter(activeCounterId || '', isSelected);
      }
      if (typeof window.AndroidBridge.setVolumeCountingEnabled === 'function') {
        window.AndroidBridge.setVolumeCountingEnabled(!!store.settings.volumeKeys);
      }
    } catch (e) {
      console.warn('Android bridge sync notice:', e);
    }
  }
}

// Global handler for physical volume buttons (Active only when a counter is selected)
window.handleVolumeKey = function(direction) {
  if (!store.settings.volumeKeys || !activeCounterId) return;

  if (direction === 'up') {
    const res = store.incrementCounter(activeCounterId, currentStep);
    if (res) {
      sound.playClick();
      triggerHaptic('light');
      animateNumberBump();
      onTallyCountIncrease();

      if (res.milestone) {
        triggerMilestoneCelebration(res.milestone);
      }
    }
  } else if (direction === 'down') {
    store.decrementCounter(activeCounterId, currentStep);
    sound.playDecrement();
    triggerHaptic('medium');
    animateNumberBump();
  }

  syncStateToAndroid(true);
};

// Timer Preset Chips Handler
function updateActiveTimerChip(secondsVal) {
  const sStr = String(secondsVal);
  timerChips.forEach(chip => {
    if (chip.dataset.seconds === sStr) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// ================= In-App GitHub Updater Engine =================
async function checkForAppUpdate(isManual = false) {
  try {
    const response = await fetch(
      'https://api.github.com/repos/KHILVANSH6789/Tally/releases/latest',
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }
    );

    if (!response.ok) {
      if (isManual) showToast('Could not fetch latest release');
      return;
    }

    const release = await response.json();
    const latestTag = release.tag_name || '';

    // Compare versions
    const cleanCurrent = APP_VERSION.replace(/^v/, '');
    const cleanLatest = latestTag.replace(/^v/, '').replace(/^Application_v/, '');

    if (isNewerVersion(cleanLatest, cleanCurrent)) {
      const apkAsset = (release.assets || []).find(a =>
        a.name.toLowerCase().endsWith('.apk')
      );
      latestReleaseApkUrl = apkAsset ? apkAsset.browser_download_url : release.html_url;

      updateVersionTag.textContent = latestTag;
      const pubDate = new Date(release.published_at || Date.now());
      updateReleaseDate.textContent = pubDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const notes = release.body
        ? escapeHtml(release.body).replace(/\n/g, '<br>')
        : 'Performance improvements and bug fixes.';
      updateNotesBox.innerHTML = notes;

      updateProgressContainer.classList.add('hidden');
      btnDoUpdate.disabled = false;
      btnDoUpdate.textContent = 'Update Now';
      openModal(modalUpdate);
    } else if (isManual) {
      showToast(`Tally is up to date! (${APP_VERSION})`);
    }
  } catch (err) {
    console.warn('Update check failed:', err);
    if (isManual) showToast('Unable to check for updates');
  }
}

function isNewerVersion(latest, current) {
  const lParts = latest.split('.').map(Number);
  const cParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Window Callbacks for Native Android Update Download
window.onUpdateDownloadProgress = function(percent) {
  if (updateProgressFill) updateProgressFill.style.width = percent + '%';
  if (updateProgressText) updateProgressText.textContent = `Downloading APK... ${percent}%`;
  if (percent >= 100) {
    if (updateProgressText) updateProgressText.textContent = 'Download complete. Installing...';
  }
};

window.onUpdateDownloadError = function(errMsg) {
  showToast('Update download failed: ' + errMsg);
  if (updateProgressContainer) updateProgressContainer.classList.add('hidden');
  if (btnDoUpdate) {
    btnDoUpdate.disabled = false;
    btnDoUpdate.textContent = 'Retry Update';
  }
};

// Attach Event Listeners
function attachEventListeners() {
  // Counters Grid card click
  countersGrid.addEventListener('click', e => {
    const card = e.target.closest('.counter-card');
    if (card) {
      const id = card.dataset.id;
      openCounterDetail(id, card);
    }
  });

  // Close Detail View
  btnCloseDetail.addEventListener('click', () => closeCounterDetail(true));

  // Corner Touch Increment Toggle inside counter stage
  if (btnCornerTouchToggle) {
    btnCornerTouchToggle.addEventListener('click', e => {
      e.stopPropagation();
      if (!activeCounterId) return;
      const counter = store.getCounterById(activeCounterId);
      if (!counter) return;

      const newTouchState = counter.touchIncrement === false;
      store.updateCounter(activeCounterId, { touchIncrement: newTouchState });
      updateTouchLockUI({ ...counter, touchIncrement: newTouchState });
      triggerHaptic('light');
      showToast(newTouchState ? 'Touch counting enabled' : 'Touch counting locked');
    });
  }

  // Large Touch Area Counting
  tallyTouchArea.addEventListener('click', () => {
    if (!activeCounterId) return;
    const counter = store.getCounterById(activeCounterId);
    if (!counter) return;

    // Prevent accidental touch if touch increment is disabled
    if (counter.touchIncrement === false) {
      tallyTouchArea.classList.remove('touch-lock-shake');
      void tallyTouchArea.offsetWidth;
      tallyTouchArea.classList.add('touch-lock-shake');
      triggerHaptic('light');
      return;
    }

    const res = store.incrementCounter(activeCounterId, currentStep);
    if (res) {
      sound.playClick();
      triggerHaptic('light');
      animateNumberBump();
      onTallyCountIncrease();
      syncStateToAndroid(true);

      if (res.milestone) {
        triggerMilestoneCelebration(res.milestone);
      }
    }
  });

  // Timer Mini Controls
  if (btnTimerToggle) {
    btnTimerToggle.addEventListener('click', e => {
      e.stopPropagation();
      if (timerTotalSeconds <= 0) return;
      if (!isTimerRunning) {
        isTimerRunning = true;
        isTimerPaused = false;
        btnTimerToggle.textContent = '⏸';
        startTimerCountdown();
      } else {
        isTimerPaused = !isTimerPaused;
        btnTimerToggle.textContent = isTimerPaused ? '▶' : '⏸';
      }
      triggerHaptic('light');
    });
  }

  if (btnTimerReset) {
    btnTimerReset.addEventListener('click', e => {
      e.stopPropagation();
      resetCounterTimer();
      triggerHaptic('light');
      showToast('Timer reset');
    });
  }

  // Decrement button
  btnDecrement.addEventListener('click', e => {
    e.stopPropagation();
    if (!activeCounterId) return;
    store.decrementCounter(activeCounterId, currentStep);
    sound.playDecrement();
    triggerHaptic('medium');
    animateNumberBump();
    syncStateToAndroid(true);
  });

  // Reset current counter button
  btnResetCounter.addEventListener('click', e => {
    e.stopPropagation();
    if (!activeCounterId) return;
    showConfirm('Reset Counter', 'Reset this counter to 0?', () => {
      store.resetCounter(activeCounterId);
      triggerHaptic('medium');
      syncStateToAndroid(true);
      showToast('Counter reset to 0');
    });
  });

  // Edit current counter button
  btnEditCurrent.addEventListener('click', e => {
    e.stopPropagation();
    if (!activeCounterId) return;
    const counter = store.getCounterById(activeCounterId);
    if (!counter) return;

    modalTitle.textContent = 'Edit Counter';
    inputCounterId.value = counter.id;
    inputCounterName.value = counter.name;
    inputCounterInitial.value = counter.count;
    inputCounterTarget.value = counter.target || '';
    if (inputCounterTimer) {
      inputCounterTimer.value = counter.timerSeconds || 0;
      updateActiveTimerChip(counter.timerSeconds || 0);
    }
    drawColorWheel();
    setColorWheelFromHex(counter.color || '#10b981');
    btnDeleteCounter.classList.remove('hidden');
    openModal(modalCounter);
  });

  // Delete current counter button from detail header
  btnDeleteCurrent.addEventListener('click', e => {
    e.stopPropagation();
    if (!activeCounterId) return;
    const counter = store.getCounterById(activeCounterId);
    if (!counter) return;

    showConfirm(
      'Delete Counter',
      `Are you sure you want to delete "${counter.name}"? This cannot be undone.`,
      () => {
        const idToDelete = activeCounterId;
        closeCounterDetail(true);
        store.deleteCounter(idToDelete);
        triggerHaptic('medium');
        showToast('Counter deleted');
      }
    );
  });

  // Delete counter button in edit modal
  btnDeleteCounter.addEventListener('click', e => {
    e.preventDefault();
    const id = inputCounterId.value;
    if (!id) return;
    const counter = store.getCounterById(id);
    if (!counter) return;

    showConfirm(
      'Delete Counter',
      `Are you sure you want to delete "${counter.name}"? This cannot be undone.`,
      () => {
        closeModal(modalCounter);
        if (activeCounterId === id) {
          closeCounterDetail(true);
        }
        store.deleteCounter(id);
        triggerHaptic('medium');
        showToast('Counter deleted');
      }
    );
  });

  // Step selector
  stepChips.forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      currentStep = parseInt(chip.dataset.step, 10);
      updateStepChipsUI();
      if (activeCounterId) {
        store.updateCounter(activeCounterId, { step: currentStep });
        syncStateToAndroid(true);
      }
      triggerHaptic('light');
    });
  });

  // Timer Preset Chips selection
  timerChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sec = parseInt(chip.dataset.seconds, 10) || 0;
      if (inputCounterTimer) {
        inputCounterTimer.value = sec;
      }
      updateActiveTimerChip(sec);
      triggerHaptic('light');
    });
  });

  if (inputCounterTimer) {
    inputCounterTimer.addEventListener('input', e => {
      updateActiveTimerChip(e.target.value);
    });
  }

  // Add counter buttons
  document.getElementById('btn-add-counter').addEventListener('click', () => {
    modalTitle.textContent = 'New Counter';
    formCounter.reset();
    inputCounterId.value = '';
    inputCounterInitial.value = '0';
    if (inputCounterTimer) {
      inputCounterTimer.value = '0';
      updateActiveTimerChip(0);
    }
    drawColorWheel();
    setColorWheelFromHex('#10b981');
    btnDeleteCounter.classList.add('hidden');
    openModal(modalCounter);
  });

  document.getElementById('btn-empty-add')?.addEventListener('click', () => {
    modalTitle.textContent = 'New Counter';
    formCounter.reset();
    inputCounterId.value = '';
    inputCounterInitial.value = '0';
    if (inputCounterTimer) {
      inputCounterTimer.value = '0';
      updateActiveTimerChip(0);
    }
    drawColorWheel();
    setColorWheelFromHex('#10b981');
    btnDeleteCounter.classList.add('hidden');
    openModal(modalCounter);
  });

  // Form counter submit
  formCounter.addEventListener('submit', e => {
    e.preventDefault();
    const id = inputCounterId.value;
    const name = inputCounterName.value.trim();
    const initial = parseInt(inputCounterInitial.value, 10) || 0;
    const target = inputCounterTarget.value ? parseInt(inputCounterTarget.value, 10) : null;
    const timerSeconds = inputCounterTimer ? parseInt(inputCounterTimer.value, 10) || 0 : 0;

    if (!name) return;

    if (id) {
      store.updateCounter(id, {
        name,
        count: initial,
        target,
        color: selectedColor,
        timerSeconds,
      });
      showToast('Counter updated');
    } else {
      store.addCounter({
        name,
        color: selectedColor,
        initialCount: initial,
        target,
        timerSeconds,
        touchIncrement: true,
      });
      showToast('Counter created');
    }

    closeModal(modalCounter);
  });

  // History modal & Date header separators with search and sorting
  document.getElementById('btn-open-history').addEventListener('click', () => {
    renderHistoryView();
    openModal(modalHistory);
  });

  if (inputHistorySearch) {
    inputHistorySearch.addEventListener('input', () => {
      renderHistoryView();
    });
  }

  if (btnClearHistorySearch) {
    btnClearHistorySearch.addEventListener('click', () => {
      if (inputHistorySearch) inputHistorySearch.value = '';
      renderHistoryView();
      if (inputHistorySearch) inputHistorySearch.focus();
    });
  }

  if (selectHistorySort) {
    selectHistorySort.addEventListener('change', () => {
      renderHistoryView();
    });
  }

  function renderHistoryView() {
    const counters = store.getCounters();
    const query = inputHistorySearch ? inputHistorySearch.value.trim().toLowerCase() : '';
    const sortMode = selectHistorySort ? selectHistorySort.value : 'date-desc';

    if (btnClearHistorySearch) {
      btnClearHistorySearch.classList.toggle('hidden', !query);
    }

    // Collect all records: { dateStr, nominalDate, counterId, counterName, count, searchCorpus }
    const records = [];
    counters.forEach(c => {
      if (c.history) {
        Object.entries(c.history).forEach(([dateStr, count]) => {
          const nominalDate = formatNominalDate(dateStr);
          let dayName = '';
          let monthName = '';
          let yearStr = '';
          let dayNumStr = '';
          try {
            const parts = dateStr.split('-').map(Number);
            if (parts.length === 3) {
              const d = new Date(parts[0], parts[1] - 1, parts[2]);
              dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
              monthName = d.toLocaleDateString(undefined, { month: 'long' });
              yearStr = String(parts[0]);
              dayNumStr = String(parts[2]);
            }
          } catch (e) {}

          records.push({
            dateStr,
            nominalDate,
            counterId: c.id,
            counterName: c.name,
            color: c.color || '#10b981',
            count: Number(count) || 0,
            searchCorpus: `${nominalDate} ${dateStr} ${dayName} ${monthName} ${yearStr} ${dayNumStr} ${c.name}`.toLowerCase(),
          });
        });
      }
    });

    if (records.length === 0) {
      historyContent.innerHTML = `
        <div class="empty-history-text">
          <p>No past daily logs recorded yet.</p>
          <p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-dim);">
            When midnight arrives, daily totals will appear here.
          </p>
        </div>
      `;
      return;
    }

    // Filter by search query
    const filteredRecords = query
      ? records.filter(r => r.searchCorpus.includes(query))
      : records;

    if (filteredRecords.length === 0) {
      historyContent.innerHTML = `
        <div class="empty-history-text">
          <p>No records matching "${escapeHtml(inputHistorySearch.value.trim())}"</p>
          <p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-dim);">
            Try searching by day (e.g. Monday), month (e.g. September), date, or counter name.
          </p>
        </div>
      `;
      return;
    }

    // Sort & Render
    if (sortMode === 'date-desc' || sortMode === 'date-asc') {
      const dates = Array.from(new Set(filteredRecords.map(r => r.dateStr)));
      dates.sort((a, b) => (sortMode === 'date-desc' ? b.localeCompare(a) : a.localeCompare(b)));

      historyContent.innerHTML = dates
        .map(dateStr => {
          const dateRecords = filteredRecords.filter(r => r.dateStr === dateStr);
          dateRecords.sort((a, b) => b.count - a.count);
          const nominalDate = dateRecords[0].nominalDate;

          const itemsHtml = dateRecords
            .map(
              r => `
            <div class="history-item">
              <div>
                <div class="history-item-date">${r.nominalDate}</div>
                <div class="history-item-counter">${escapeHtml(r.counterName)}</div>
              </div>
              <span class="history-item-count">${r.count}</span>
            </div>
          `
            )
            .join('');

          return `
            <div class="history-date-group">
              <div class="history-date-separator">
                <span class="date-sep-badge">${nominalDate}</span>
                <div class="date-sep-line"></div>
              </div>
              ${itemsHtml}
            </div>
          `;
        })
        .join('');
    } else {
      // Sort by count or name
      const sortedRecords = [...filteredRecords];
      if (sortMode === 'count-desc') {
        sortedRecords.sort((a, b) => b.count - a.count);
      } else if (sortMode === 'count-asc') {
        sortedRecords.sort((a, b) => a.count - b.count);
      } else if (sortMode === 'name-asc') {
        sortedRecords.sort((a, b) => a.counterName.localeCompare(b.counterName) || b.count - a.count);
      }

      historyContent.innerHTML = `
        <div class="history-date-group">
          ${sortedRecords
            .map(
              r => `
            <div class="history-item">
              <div>
                <div class="history-item-date">${r.nominalDate}</div>
                <div class="history-item-counter">${escapeHtml(r.counterName)}</div>
              </div>
              <span class="history-item-count">${r.count}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }
  }

  // Settings modal
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    openModal(modalSettings);
  });

  settingMidnightReset.addEventListener('change', e => {
    store.updateSettings({ midnightReset: e.target.checked });
    updateMidnightBadge();
    showToast(e.target.checked ? 'Midnight Reset enabled' : 'Midnight Reset disabled');
  });

  settingHaptics.addEventListener('change', e => {
    store.updateSettings({ haptics: e.target.checked });
    if (e.target.checked) triggerHaptic('medium');
  });

  settingAudio.addEventListener('change', e => {
    store.updateSettings({ audio: e.target.checked });
    sound.enabled = e.target.checked;
    if (e.target.checked) sound.playClick();
  });

  if (settingVolumeKeys) {
    settingVolumeKeys.addEventListener('change', e => {
      store.updateSettings({ volumeKeys: e.target.checked });
      syncStateToAndroid(!!activeCounterId);
      showToast(
        e.target.checked ? 'Volume Button counting ON' : 'Volume Button counting OFF'
      );
    });
  }

  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener('click', () => {
      checkForAppUpdate(true);
    });
  }

  if (btnDoUpdate) {
    btnDoUpdate.addEventListener('click', () => {
      if (!latestReleaseApkUrl) return;

      if (
        window.AndroidBridge &&
        typeof window.AndroidBridge.downloadAndInstallUpdate === 'function' &&
        latestReleaseApkUrl.toLowerCase().endsWith('.apk')
      ) {
        updateProgressContainer.classList.remove('hidden');
        if (updateProgressFill) updateProgressFill.style.width = '0%';
        if (updateProgressText) updateProgressText.textContent = 'Starting download...';
        btnDoUpdate.disabled = true;
        btnDoUpdate.textContent = 'Downloading...';
        window.AndroidBridge.downloadAndInstallUpdate(latestReleaseApkUrl);
      } else {
        window.open(latestReleaseApkUrl, '_system');
      }
    });
  }

  btnClearAll.addEventListener('click', () => {
    showConfirm('Reset All Counters', 'Reset all counters to 0 for today?', () => {
      store.resetAllCounters();
      closeModal(modalSettings);
      showToast('All counters reset to 0');
    });
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.closeModal;
      const modal = document.getElementById(modalId);
      if (modal) closeModal(modal);
    });
  });

  // Close modals when clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // Confirm dialog
  btnConfirmOk.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeModal(modalConfirm);
    confirmCallback = null;
  });

  btnConfirmCancel.addEventListener('click', () => {
    closeModal(modalConfirm);
    confirmCallback = null;
  });

  // Back navigation handler (Hardware back button & swipe back gesture)
  function handleBackButton() {
    if (!modalConfirm.classList.contains('hidden')) {
      closeModal(modalConfirm);
      confirmCallback = null;
      return;
    }
    if (!modalUpdate.classList.contains('hidden')) {
      closeModal(modalUpdate);
      return;
    }
    if (!modalCounter.classList.contains('hidden')) {
      closeModal(modalCounter);
      return;
    }
    if (!modalHistory.classList.contains('hidden')) {
      closeModal(modalHistory);
      return;
    }
    if (!modalSettings.classList.contains('hidden')) {
      closeModal(modalSettings);
      return;
    }
    if (counterDetailView.classList.contains('active')) {
      closeCounterDetail(true);
      return;
    }

    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      try {
        App.exitApp();
      } catch (e) {
        window.close();
      }
    } else {
      lastBackPressTime = now;
      showToast('Press back again to exit');
      triggerHaptic('light');
    }
  }

  try {
    App.addListener('backButton', () => {
      handleBackButton();
    });
  } catch (e) {}

  window.addEventListener('popstate', () => {
    if (counterDetailView.classList.contains('active')) {
      closeCounterDetail(false);
    } else if (!modalConfirm.classList.contains('hidden')) {
      closeModal(modalConfirm);
      confirmCallback = null;
    } else if (!modalUpdate.classList.contains('hidden')) {
      closeModal(modalUpdate);
    } else if (!modalCounter.classList.contains('hidden')) {
      closeModal(modalCounter);
    } else if (!modalHistory.classList.contains('hidden')) {
      closeModal(modalHistory);
    } else if (!modalSettings.classList.contains('hidden')) {
      closeModal(modalSettings);
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      handleBackButton();
    } else if (e.code === 'Space' && counterDetailView.classList.contains('active')) {
      e.preventDefault();
      tallyTouchArea.click();
    }
  });
}

function showConfirm(title, message, onOk) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCallback = onOk;
  openModal(modalConfirm);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start app
init();
