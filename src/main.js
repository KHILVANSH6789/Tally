import { store, formatNominalDate, getTodayDateString } from './storage.js';
import { sound } from './audio.js';

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';

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

// Modals
const modalCounter = document.getElementById('modal-counter');
const modalTitle = document.getElementById('modal-title');
const formCounter = document.getElementById('form-counter');
const inputCounterId = document.getElementById('input-counter-id');
const inputCounterName = document.getElementById('input-counter-name');
const inputCounterInitial = document.getElementById('input-counter-initial');
const inputCounterTarget = document.getElementById('input-counter-target');
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
const modalSettings = document.getElementById('modal-settings');
const settingMidnightReset = document.getElementById('setting-midnight-reset');
const settingHaptics = document.getElementById('setting-haptics');
const settingAudio = document.getElementById('setting-audio');
const settingVolumeKeys = document.getElementById('setting-volume-keys');
const btnClearAll = document.getElementById('btn-clear-all');

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

  // Play cinematic intro sequence
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
}

// Cinematic Intro Splash Sequence
function runAppIntroSequence() {
  if (!appIntro) return;

  // Play intro audio
  sound.playIntro();

  // Fade out intro after Lobster Two text animation finishes
  const timer = setTimeout(() => {
    finishIntro();
  }, 2100);

  // Allow clicking to dismiss intro early if desired
  appIntro.addEventListener(
    'click',
    () => {
      clearTimeout(timer);
      finishIntro();
    },
    { once: true }
  );

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

// Render Counters Grid (Home selection menu - without increment button)
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
      return `
        <div class="counter-card" data-id="${c.id}" style="--card-accent: ${c.color}">
          <div class="counter-card-info">
            <span class="counter-card-name">${escapeHtml(c.name)}</span>
            <div class="counter-card-meta">
              <span>Today</span>
              ${targetHtml}
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
      counterDetailView.style.transition = 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease, border-radius 0.38s ease';
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

  // Deactivate native volume counting when returning to home menu
  syncStateToAndroid(false);

  if (activeCardElement) {
    const cardRect = activeCardElement.getBoundingClientRect();
    const scaleX = cardRect.width / (window.innerWidth > 480 ? 480 : window.innerWidth);
    const scaleY = cardRect.height / window.innerHeight;
    const transX = cardRect.left + cardRect.width / 2 - window.innerWidth / 2;
    const transY = cardRect.top + cardRect.height / 2 - window.innerHeight / 2;

    counterDetailView.style.transition = 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, border-radius 0.32s ease';
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
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, v = max;
  let d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
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
      try { colorWheelStage.setPointerCapture(e.pointerId); } catch (err) {}
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
        try { colorWheelStage.releasePointerCapture(e.pointerId); } catch (err) {}
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
      const counter = activeCounterId ? store.getCounterById(activeCounterId) : null;
      const count = counter ? counter.count : 0;
      const step = activeCounterId ? currentStep : 1;

      if (typeof window.AndroidBridge.setActiveCounter === 'function') {
        window.AndroidBridge.setActiveCounter(activeCounterId || '', count, step, isSelected);
      }
      if (typeof window.AndroidBridge.setVolumeCountingEnabled === 'function') {
        window.AndroidBridge.setVolumeCountingEnabled(!!store.settings.volumeKeys);
      }
    } catch (e) {
      console.warn('Android bridge sync notice:', e);
    }
  }
}

// Callback from native Android (works with screen ON and screen OFF)
window.syncCountFromNative = function(id, count, action) {
  if (!id) return;
  const counter = store.getCounterById(id);
  if (!counter) return;

  counter.count = count;
  store.saveCounters();

  if (activeCounterId === id) {
    updateDetailView(id);
    if (action === 'up' || action === 'down') {
      animateNumberBump();
    }
    if (action === 'up' && counter.target && count >= counter.target && (count - (counter.step || 1)) < counter.target) {
      sound.playMilestone();
      triggerHaptic('success');
      showToast('Daily Goal Reached! 🎉');
    }
  }
};

// Global handler for volume buttons when screen is ON
window.handleVolumeKey = function(direction) {
  if (!store.settings.volumeKeys || !activeCounterId) return;

  if (direction === 'up') {
    const res = store.incrementCounter(activeCounterId, currentStep);
    if (res) {
      sound.playClick();
      triggerHaptic('light');
      animateNumberBump();
      if (res.reachedTarget) {
        sound.playMilestone();
        triggerHaptic('success');
        showToast('Daily Goal Reached! 🎉');
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

  // Large Touch Area Counting
  tallyTouchArea.addEventListener('click', () => {
    if (!activeCounterId) return;
    const res = store.incrementCounter(activeCounterId, currentStep);
    if (res) {
      sound.playClick();
      triggerHaptic('light');
      animateNumberBump();
      syncStateToAndroid(true);
      if (res.reachedTarget) {
        sound.playMilestone();
        triggerHaptic('success');
        showToast('Daily Goal Reached! 🎉');
      }
    }
  });

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

    showConfirm('Delete Counter', `Are you sure you want to delete "${counter.name}"? This cannot be undone.`, () => {
      const idToDelete = activeCounterId;
      closeCounterDetail(true);
      store.deleteCounter(idToDelete);
      triggerHaptic('medium');
      showToast('Counter deleted');
    });
  });

  // Delete counter button in edit modal
  btnDeleteCounter.addEventListener('click', e => {
    e.preventDefault();
    const id = inputCounterId.value;
    if (!id) return;
    const counter = store.getCounterById(id);
    if (!counter) return;

    showConfirm('Delete Counter', `Are you sure you want to delete "${counter.name}"? This cannot be undone.`, () => {
      closeModal(modalCounter);
      if (activeCounterId === id) {
        closeCounterDetail(true);
      }
      store.deleteCounter(id);
      triggerHaptic('medium');
      showToast('Counter deleted');
    });
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

  // Add counter buttons
  document.getElementById('btn-add-counter').addEventListener('click', () => {
    modalTitle.textContent = 'New Counter';
    formCounter.reset();
    inputCounterId.value = '';
    inputCounterInitial.value = '0';
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

    if (!name) return;

    if (id) {
      store.updateCounter(id, {
        name,
        count: initial,
        target,
        color: selectedColor,
      });
      showToast('Counter updated');
    } else {
      store.addCounter({
        name,
        color: selectedColor,
        initialCount: initial,
        target,
      });
      showToast('Counter created');
    }

    closeModal(modalCounter);
  });

  // History modal
  document.getElementById('btn-open-history').addEventListener('click', () => {
    renderHistoryView();
    openModal(modalHistory);
  });

  function renderHistoryView() {
    const counters = store.getCounters();
    const allDates = new Set();

    counters.forEach(c => {
      if (c.history) {
        Object.keys(c.history).forEach(d => allDates.add(d));
      }
    });

    const sortedDates = Array.from(allDates).sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
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

    historyContent.innerHTML = sortedDates
      .map(dateStr => {
        const nominalDate = formatNominalDate(dateStr);
        const entries = counters
          .filter(c => c.history && c.history[dateStr] !== undefined)
          .map(
            c => `
            <div class="history-item">
              <div>
                <div class="history-item-date">${nominalDate}</div>
                <div class="history-item-counter">${escapeHtml(c.name)}</div>
              </div>
              <span class="history-item-count">${c.history[dateStr]}</span>
            </div>
          `
          )
          .join('');
        return entries;
      })
      .join('');
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
      showToast(e.target.checked ? 'Side Volume Button counting ON' : 'Side Volume Button counting OFF');
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
