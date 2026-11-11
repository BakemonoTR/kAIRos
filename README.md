# kAIRos

> **AI-Powered Air Instrument, Gesture Synthesizer & Autonomous Audio Looper**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg)](https://vitejs.dev/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Vision_Tasks-4285F4.svg)](https://developers.google.com/mediapipe)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-Interactive-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**kAIRos** is a zero-latency, camera-driven musical performance environment running entirely inside the browser. By combining **MediaPipe GPU hand landmark tracking** with the **Web Audio API**, kAIRos turns natural hand motions into responsive synthesizers, air drums, custom sample pads, and multi-track loop stations—without needing gloves, markers, or external hardware controllers.

---

## Key Features

### 1. Theremin & Lead Synthesizer Mode
- **Pitch Control:** Move your right hand vertically to control pitch across 3 octaves with portamento glide.
- **Musical Scales:** Snap pitch to **Minor Pentatonic, Blues, Major, Chromatic**, or play smooth **Continuous** microtones.
- **Dynamic Timbre:** Sweep hand horizontally to manipulate low-pass / band-pass filter cutoff frequencies.
- **Natural Squeeze Volume (0% – 100%):** Open hand stays silent (`0%`), light cupping yields quiet whispers (`10%–30%`), and closing into a full tight fist drives punchy maximum volume (`100%`).
- **Sound Presets & Custom Synth:** Includes *Cosmic Sine, Cyber Lead, Dream Pad, 8-Bit Square, Cello Vox*, and a fully parametric **Custom Synth** with dual oscillators, sub-octave layering, detune, resonance, vibrato rate/depth, and glide controls.

### 2. 10-Finger Air Drum & Melodic Pad Mode
- **Kinematic Tap Detection:** Detects rapid mid-air finger strikes using 3D velocity vectors and sympathetic neighbor suppression.
- **Per-Finger Channel Customization:** Configure each of your 10 fingers with built-in algorithmic percussion generators (*Kick, Snare, Hi-Hat, Pluck, Bell*) or import custom `.wav` / `.mp3` samples.
- **Keyboard Fallback:** Full test keyboard triggers mapped to `A S D F G H J K L ;`.

### 3. One-Hit Air Pads
- **Drag & Drop Placement:** Grab sample pads from the right docking shelf with your mouse or hand and place them anywhere inside the live camera frame.
- **Custom One-Shot Audio:** Click any pad to load your own one-shot audio files into browser storage.
- **Two-Hand Gesture Control:**
  - **Pinch & Move:** Pinch head-to-tail with your right thumb and index finger to drag pads inside the video.
  - **Phone-Style Pinch Zoom:** While holding a pad with your right hand, spread or pinch your left hand's thumb and index finger to resize the pad (`55%` to `235%`).
  - **Touch to Trigger:** Tap placed pads with any finger in 5-finger mode to play instant one-shots.
  - **Return to Dock:** Drag the pad to the right border of the camera to dock it back.

### 4. Autonomous Air Looper
- **Master Grid Alignment:** Automatically measures loop lengths in musical bars and beats quantized to tempo (BPM).
- **Wall Bump Gestures:**
  - **Commit Drum Loop:** Swipe your left hand into the left camera wall to lock in your live drum groove.
  - **Commit Synth Loop:** Swipe your right hand into the right camera wall to commit your synthesizer phrase.
- **Multi-Layer Stacking:** Stack infinite sound-on-sound synth layers in real time with visual phrase metrics and progress HUDs.

### 5. Interactive Camera HUD Metronome
- An on-screen visual and acoustic metronome widget integrated directly inside the camera canvas.
- Toggle hands-free by closing and opening your left palm to enter **Single-Finger Pointer Mode**, then tap the metronome widget in mid-air.

### 6. Synchronized Video & MIDI Recording
- Record high-quality synchronized video with or without HUD overlays (`720p` or `480p`).
- Simultaneously export multi-track standard MIDI (`.mid`) files with quantize options (`Off`, `1/8`, `1/16`) for instant DAW editing (Ableton, FL Studio, Logic, Reaper).

---

## Gesture Control Reference

| Gesture | Hand | Action |
| :--- | :---: | :--- |
| **Move Up / Down** | Right Hand | Pitch frequency (Low C3 to High A#5) |
| **Move Left / Right** | Right Hand | Filter brightness & cutoff frequency |
| **Hand Squeeze / Fist** | Right Hand | Continuous 0% to 100% volume dynamics |
| **Swipe Down (Open Hand)**| Right Hand | Cycle synthesizer preset sound |
| **Wall Bump (Left Edge)** | Left Hand | Commit and loop recorded drum phrase |
| **Wall Bump (Right Edge)**| Right Hand | Commit and loop recorded synth phrase |
| **Palm Close & Open** | Left Hand | Toggle Single-Finger Pointer Mode (for Metronome touch) |
| **Palm Close & Open** | Right Hand | Toggle 5-Finger One-Hit Pad Mode |
| **Pinch Thumb + Index** | Right Hand | Grab and drag placed One-Hit pad |
| **Spread / Pinch Left Fingers** | Left Hand | Resize the pad currently held by right hand |

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- A modern web browser with WebGL and Web Audio support (Chrome, Edge, Brave, Firefox)
- A standard webcam

### Installation

```bash
# Clone the repository
git clone https://github.com/BakemonoTR/kAIRos.git

# Enter project directory
cd kAIRos

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser and navigate to `http://localhost:5173`. Click **Start camera** and grant camera permissions to begin playing.

### Testing & Production Build

```bash
# Run automated verification tests (gesture math, quantizer, audio engines)
npm test

# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## Architecture & Tech Stack

- **Computer Vision & Tracking:** [Google MediaPipe Vision Tasks](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) running high-frequency GPU hand landmark tracking (`hand_landmarker.task`).
- **Audio Processing:** Native Web Audio API (`AudioContext`, `BiquadFilterNode`, `DelayNode`, custom procedural drum synthesizers, buffer loaders).
- **Offline Storage:** IndexedDB via `idb-keyval` for instant persistence of custom samples and pad layouts.
- **Rendering:** HTML5 Canvas 2D engine with sub-pixel rendering, adaptive aspect ratio letterboxing, and low-latency ripple effects.
- **MIDI Serialization:** `@tonejs/midi` for standard multi-track type-1 MIDI encoding.
- **Tooling:** TypeScript, Vite.

---

## License

This project is open-source and available under the [MIT License](LICENSE).
