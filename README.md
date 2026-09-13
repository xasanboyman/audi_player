# CyberDance 3D - Music-Driven Dancing & Audio Player

A complete music-driven 3D audio player and real-time dance synthesis engine built completely from scratch in `audi_player`, inspired by DLP3D, Speech2Motion, and MotionDataViewer.

---

## 🌟 Key Features

### 1. Fast & Intelligent Audio Analysis (< 1 minute, typically 2-3 seconds!)
- Powered by Python **Librosa** (`analyzer.py`) and **Web Audio API**:
  - **BPM & Beat Tracking**: Detects exact tempo and every individual beat / downbeat timestamp.
  - **Musical Structure Segmentation**: Divides the song into Intro, Verse, Buildup, Drop / Chorus, and Outro sections.
  - **Vocal / Lyric Detection**: Harmonic-percussive separation detects vocal intervals to trigger character singing and mouth lip sync morphs (`aa`, `ih`, `ou`, `oh`).
  - **Energy Curve**: Continuous RMS volume and bass punch curve.

### 2. Beat-Synchronized Dance Synthesis Engine
- **Bar & Beat Retiming**: Automatically stretches / resamples motion speed so foot steps, hops, and arm movements land exactly on the song's downbeats.
- **Spherical Linear Interpolation (SLERP)**: 350ms smooth crossfade between animation clips ensures zero popping or sudden jerking.
- **Song Structure Choreography**:
  - **Intro**: Relaxed listening poses, gentle swaying.
  - **Verse**: Rhythmic hip sways, steps, arm waving.
  - **Drop / High Energy**: Explosive jump bounces, 360° spins, high-tempo arm pumps.
  - **Vocal Segments**: Expressive singing mouth shapes, natural eye blinking, head nods.
- **Audio-Reactive Procedural Layer**:
  - Bass kick spring bounce on hips & torso.
  - Rhythmic arm pops and alternating footwork.

### 3. Visuals & Glowing Effects (Matching Screencast)
- **Glowing Wrist Light Trails**: Additive-blended camera-facing neon ribbon trails flowing from the dancers' hands and wrists as they move.
- **Audio-Reactive Stage**:
  - Neon floor rings pulsating with bass kicks.
  - 3D circular equalizer pillars bouncing with real-time FFT frequencies.
  - Moving colored concert spotlights & floating neon particles.

### 4. Dual-Dancer & Model Support
- Includes high-quality anime VRM models:
  - **Ani** (Pink hair, twintails, cat-ear headset).
  - **Riko** (Dark/green hair, concert uniform).
  - **Student** model.
- Modes: **Duo Dance (Ani & Riko)**, **Solo Ani**, **Solo Riko**.

### 5. YouTube Music Search & Live Streaming (Stealth Playwright)
- **Headless Chrome with Stealth Evasion** (`youtube_search.py`):
  - Uses `playwright` with `playwright-stealth` to bypass bot protection, CAPTCHAs, and consent screens.
  - Returns clean JSON with high-resolution 16:9 thumbnails, exact video duration badges, artist/channel name, and view counts.
- **Fast Audio Extraction & Proxy Streaming**:
  - Direct audio streaming via `yt-dlp` and an Express HTTP Range proxy (`206 Partial Content`).
  - Dancers immediately sync to any YouTube song, adapting choreography to energy and tempo.

### 6. Motion Library & Animation Uploader
- Integrated with the **DLP3D Dataset** (762 motions from `motion_database.db`).
- Pre-converted curated clips across all dance categories: `jump_bounce`, `spin`, `energetic_dance`, `groove_style`, `idol_cute`, `wave_hands`, `vocal_rhythm`, `idle_sway`.
- **Custom Animation Upload**: Supports `.npz`, `.fbx`, `.glb` uploads with automated coordinate transformation from Blender Z-up to Three.js Y-up.

---

## 🚀 Quick Start

### Start Server & Player
Run the startup script:
```bash
cd /home/xasanboy/audi_player
./start.sh
```
Or start via npm:
```bash
# Production server (API + Client on port 3001)
npm start

# Or Vite Development mode (with HMR on port 3000)
npm run dev
```

Open your browser at:
👉 **`http://localhost:3001`**

---

## 📁 Project Structure

```
audi_player/
├── start.sh                 # One-click startup script
├── server.js                # Express backend API & static server
├── youtube_search.py        # YouTube Stealth Playwright search engine
├── requirements.txt         # Python dependencies (playwright, yt-dlp, librosa)
├── analyzer.py              # Python Librosa audio & beat analyzer
├── process_motions.py       # DLP3D dataset converter & retargeter
├── index.html               # Main application HTML
├── vite.config.js           # Vite configuration
├── models/                  # VRM models (Ani.vrm, riko.vrm, student.vrm)
├── tracks/                  # Preloaded audio tracks & analysis JSON
├── motion_data/             # Unpacked DLP3D motion dataset
├── motions_processed/       # Converted web-ready dance clips & catalog
└── src/
    ├── main.js              # Application entry point
    ├── audio/
    │   └── AudioEngine.js   # HTMLAudio + Web Audio API FFT analyzer
    ├── dance/
    │   └── DanceEngine.js   # Beat-matching choreographer & SLERP blender
    ├── vfx/
    │   ├── GlowingRibbon.js # Glowing wrist light ribbon trail system
    │   └── StageLighting.js # Concert lights, floor rings, 3D equalizer
    ├── stage/
    │   ├── Dancer.js        # VRM character controller & bone retargeter
    │   └── SceneManager.js  # Three.js scene, camera & render loop
    └── ui/
        ├── PlayerUI.js      # Player controls, uploaders, and playlists
        └── styles.css       # Dark cyber glassmorphic UI styling
```
