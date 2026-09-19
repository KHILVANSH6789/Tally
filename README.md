<p align="center">
  <img src="./Tally_Logo.png" width="120" height="120" alt="Tally Logo" style="border-radius: 26px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

<h1 align="center">Tally</h1>

<p align="center">
  <b>A clean, ergonomic, and distraction-free tally counter for Android & Web.</b>
</p>

<p align="center">
  <a href="https://github.com/KHILVANSH6789/Tally/releases/latest"><img src="https://img.shields.io/badge/Release-v1.0.5-10b981?style=flat-square" alt="Version"></a>
  <img src="https://img.shields.io/badge/Platform-Android%20%7C%20Web-38bdf8?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Capacitor-v7.1-violet?style=flat-square" alt="Capacitor">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="./apk/Tally.apk"><b>⬇️ Download Latest APK (Tally.apk)</b></a> •
  <a href="https://github.com/KHILVANSH6789/Tally/releases"><b>Releases & Changelog</b></a>
</p>

---

## 🧭 Application Workflow

```mermaid
graph TD
    A[Home Dashboard] -->|Tap Card| B[Counter Detail View]
    A -->|Top Nav| H[Daily History Modal]
    A -->|Top Nav| S[Settings & In-App Updater]
    
    B -->|Tap Area / Vol Up| C[Count Up ++]
    B -->|Vol Down / Button| D[Count Down --]
    B -->|Corner Lock Toggle| L[Lock/Unlock Touch Input]
    
    C -->|If Timer Configured| T[Start/Reset Countdown Timer]
    C -->|Crosses Segment| M[Milestone Chime & Notch Reached]
    
    H -->|Search Query| F[Filter by Day, Date, Month, Name]
    H -->|Sort Select| O[Sort: Newest, Oldest, Count, Name]
```

---

## ✨ Core Features

### ⏱️ Smart Countdown Timers
- Attach an optional countdown timer (15s, 30s, 60s, or custom seconds) to any counter.
- **Lazy Start**: When opening a tally, the timer stays in a ready state until your **first tap or volume count**.
- **Auto-Reset**: Each subsequent count up automatically resets the timer back to full duration. Plays `Time_Up.mp3` when the clock runs out.
- **Home Badges**: Counters configured with a timer display an inline timer pill directly on the home card.

### 🎯 Subdivided Milestone Targets
- Intelligent milestone division tailored to your chosen goal:
  - **Goal 10**: Midpoint milestone at **5** (50%) & goal at **10** (100%).
  - **Goal 100**: Intermediate milestones at **25**, **50**, **75**, and **100**.
  - **Goal 30**: Segmented at **10**, **20**, and **30**.
- Dynamic progress notches render across the progress bar corresponding to each segment.
- Plays gentle split sound (`Goal_Split.mp3`) at intermediate notches and celebratory chime (`Goal_Reached.mp3`) at 100%.

### 🔒 Touch Lock Mode
- Corner toggle inside every counter detail screen lets you lock screen touches to prevent accidental double-counts while walking or exercising.
- Physical volume buttons continue counting smoothly while touch is locked.

### 🔍 Daily History with Search & Multi-Sort
- View past counts automatically archived each night at midnight (optional toggle).
- **Live Search**: Search entries by weekday (*"Monday"*), month (*"September"*), date numbers, or counter name.
- **Sort Options**: Order logs by *Newest First*, *Oldest First*, *Highest Count*, *Lowest Count*, or *Alphabetical (A-Z)*.

### 🚀 Built-In GitHub Updater
- Check for updates and download new releases straight from the GitHub repository within the app.
- Native background downloader with progress indicator and package installer trigger.

### 🎨 360° Interactive Hex Color Wheel
- Customize each counter with an interactive color wheel canvas and live hex input box (`#RRGGBB`).
- Clean visual distinction for habits, fitness reps, prayers, or study sessions.

### 🔊 Audio & Volume Keys Control
- Optional hardware volume button counting (Volume Up = count up, Volume Down = count down).
- Uses device media volume rather than forced levels.
- Rapid sound effect pooling (`Tap_Normal.mp3`, `Tap_Decrease.mp3`, `Goal_Reached.mp3`, `Goal_Split.mp3`, `Time_Up.mp3`).

---

## 🛠️ Tech Stack

| Component | Technology |
|:---|:---|
| **Frontend** | Vanilla JavaScript (ES Modules), HTML5, CSS3 Variables |
| **Mobile Runtime** | [Capacitor 7](https://capacitorjs.com/) with native Android bridge |
| **Styling** | Custom responsive dark theme, CSS Grid & Flexbox |
| **Platform Target** | Android SDK 34+ (Java 17 OpenJDK) & Modern Browsers |

---

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/KHILVANSH6789/Tally.git
cd Tally

# Install dependencies
npm install

# Run Vite dev server
npm run dev
```

---

## 📦 Building the Android APK

```bash
# 1. Compile web bundle
npm run build

# 2. Sync web assets with Capacitor
npx cap sync android

# 3. Assemble Android Debug APK
cd android
./gradlew assembleDebug

# Output APK:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📄 License

Open-source under the [MIT License](LICENSE). Contributions, bug reports, and suggestions are always welcome!
