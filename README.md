<p align="center">
  <img src="./Tally_Logo.png" width="128" height="128" alt="Tally Counter Logo" style="border-radius: 28px;" />
</p>

<h1 align="center">Tally</h1>

<p align="center">
  <b>A sleek, ergonomic, and eye-pleasant tally counter app for Android & Web.</b>
</p>

<p align="center">
  <a href="./apk/Tally.apk"><b>⬇️ Download APK (Direct Install)</b></a>
</p>

---

## 📱 Features

- **Multiple Independent Counters**: Create, customize, and manage as many tallies as you need (habits, workouts, prayers, inventory, books read).
- **Smooth FLIP Animations**: Cards fluidly expand and collapse into the full-screen touch counter with physics-based transitions.
- **Cinematic Startup Intro**: Elegant bold intro in *Lobster Two* typography paired with `App_Opening_Intro.mp3` before fading seamlessly into the main dashboard.
- **Interactive 360° Hex Color Wheel**: Interactive full-spectrum color wheel with touch/drag cursor, live color badge preview, and direct `#RRGGBB` hex code input.
- **Hardware Volume Buttons Counting**:
  - Count **Up** or **Down** using the phone's physical side volume buttons when a tally is open (toggleable in Settings, off by default).
  - Automatically sets media volume to 100% so clicks are loud and clear without system volume beeps.
- **Immersive Fullscreen Sticky Mode**: System status bar (notification bar) and bottom navigation bar are completely hidden while using the app.
- **Midnight Rollover & Daily History**:
  - Automatically saves each day's count at 00:00 midnight and resets to 0 (optional toggle in Settings).
  - Browse past days' totals in the Daily History viewer.
- **Rich Audio Package**:
  - `Tap_Normal.mp3`: Rapid mechanical click for counting up.
  - `Tap_Decrease.mp3`: Distinct mechanical click for counting down.
  - `Goal_Reached.mp3`: Celebratory chime when hitting daily target.
  - `App_Opening_Intro.mp3`: Startup splash sound.
- **Haptic Tactile Feedback**: Fine-tuned vibrational pulses on every tap.
- **Hardware Back Button Protection**: Double-back press verification prevents accidental app closure.

---

## 🚀 Quick Start (Web Development)

```bash
# 1. Clone repository
git clone https://github.com/your-username/Tallycounter.git
cd Tallycounter

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

---

## 📦 Building the Android APK

```bash
# 1. Build web distribution
npm run build

# 2. Sync web assets with Capacitor Android
npx cap sync android

# 3. Compile the debug APK
cd android
./gradlew assembleDebug

# Built APK will be located at:
# android/app/build/outputs/apk/debug/app-debug.apk
# or ready in ./apk/Tally.apk
```

---

## 📂 Project Structure

```
Tallycounter/
├── apk/                      # Ready-to-install prebuilt APK
│   └── Tally.apk
├── android/                  # Native Android Capacitor Project (Java 17)
│   ├── app/
│   │   ├── src/main/java/com/vibe/tallycounter/MainActivity.java
│   │   └── src/main/res/     # Adaptive launcher icons, themes & drawables
├── public/                   # Static assets & sound package
│   ├── sounds/               # MP3 sound effects
│   │   ├── App_Opening_Intro.mp3
│   │   ├── Goal_Reached.mp3
│   │   ├── Tap_Normal.mp3
│   │   └── Tap_Decrease.mp3
│   └── Tally_Logo.png
├── src/                      # Web App Source Code
│   ├── audio.js              # Rapid-fire sound pooling engine
│   ├── storage.js            # LocalStorage & midnight archive engine
│   ├── main.js               # UI logic, FLIP transitions & native bridge
│   └── style.css             # Dark theme design system & animations
├── capacitor.config.json     # Capacitor configuration
├── index.html                # App layout & modals
└── package.json
```

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3 Custom Properties
- **Typography**: Google Fonts (*Lobster Two*, *Ubuntu*, *Comic Relief*)
- **Mobile Engine**: [Capacitor 7](https://capacitorjs.com/)
- **Native Android**: Android SDK 34 / Java 17 Microsoft OpenJDK
