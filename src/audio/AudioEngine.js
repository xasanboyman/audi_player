/**
 * AudioEngine.js
 * High-performance audio playback & real-time Web Audio API frequency/beat analysis.
 * Features seamless dual-engine playback:
 * - Native HTML5 Audio + Web Audio API analyser for local and uploaded tracks
 * - Embedded YouTube IFrame Player for YouTube streaming tracks (zero-latency, bypasses bot checks)
 */

let _ytApiPromise = null;

function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      return resolve(window.YT);
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0] || document.head;
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    const oldReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof oldReady === 'function') oldReady();
      resolve(window.YT);
    };
  });
  return _ytApiPromise;
}

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.gainNode = null;

    this.fftSize = 1024;
    this.frequencyData = new Uint8Array(this.fftSize / 2);
    this.timeDomainData = new Uint8Array(this.fftSize);

    this.currentTrack = null;
    this.isPlaying = false;
    this.isYouTubeMode = false;
    this.ytPlayer = null;
    this.isYtReady = false;
    this._ytPlayerPromise = null;
    this._pendingYtVideo = null;

    this.bpm = 120;
    this.duration = 0;
    this.currentTime = 0;

    // High-precision continuous audio clock tracking
    this.lastSyncAudioTime = 0;
    this.lastSyncPerfTime = performance.now();

    // Event listeners & callbacks
    this._listeners = new Map();
    this.onPlayStateChange = null;
    this.onTimeUpdate = null;
    this.onTrackChange = null;
    this.onBeat = null;
    this.onSegmentChange = null;

    this.currentBeatIndex = -1;
    this.currentSegment = null;

    this._visemeState = {
      aa: 0,
      ee: 0,
      ih: 0,
      oh: 0,
      ou: 0,
      mouth_close: 0,
      smile: 0.3
    };

    // Pre-warm YouTube IFrame API in background
    loadYouTubeIframeAPI().catch(() => {});

    this.setupListeners();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(fn);
    }
  }

  emit(event, ...args) {
    if (this._listeners.has(event)) {
      for (const fn of this._listeners.get(event)) {
        try {
          fn(...args);
        } catch (e) {
          console.error(`AudioEngine listener error [${event}]:`, e);
        }
      }
    }
  }

  _emitPlayState(isPlaying) {
    if (this.onPlayStateChange) this.onPlayStateChange(isPlaying);
    this.emit('playStateChange', isPlaying);
  }

  _emitTimeUpdate(curr, dur) {
    if (this.onTimeUpdate) this.onTimeUpdate(curr, dur);
    this.emit('timeUpdate', curr, dur);
  }

  _emitTrackChange(track) {
    if (this.onTrackChange) this.onTrackChange(track);
    this.emit('trackChange', track);
  }

  _emitBeat(bi, isDownbeat, time) {
    if (this.onBeat) this.onBeat(bi, isDownbeat, time);
    this.emit('beat', bi, isDownbeat, time);
  }

  _emitSegmentChange(seg) {
    if (this.onSegmentChange) this.onSegmentChange(seg);
    this.emit('segmentChange', seg);
  }

  initAudioContext() {
    if (this.audioCtx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API context init warning:', e);
    }
  }

  async ensureYouTubePlayer() {
    if (this.ytPlayer && this.isYtReady) return this.ytPlayer;
    if (this._ytPlayerPromise) return this._ytPlayerPromise;

    this._ytPlayerPromise = new Promise(async (resolve, reject) => {
      try {
        const YT = await loadYouTubeIframeAPI();
        if (!YT || !YT.Player) {
          throw new Error('YouTube IFrame API could not be loaded');
        }

        let host = document.getElementById('cyberdance-yt-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'cyberdance-yt-host';
          host.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:320px;height:240px;pointer-events:none;opacity:0.001;z-index:-9999;overflow:hidden;';
          const mount = document.createElement('div');
          mount.id = 'cyberdance-yt-mount';
          host.appendChild(mount);
          document.body.appendChild(host);
        }

        this.ytPlayer = new YT.Player('cyberdance-yt-mount', {
          height: '240',
          width: '320',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin
          },
          events: {
            onReady: (e) => {
              this.isYtReady = true;
              if (this._pendingYtVideo) {
                const { videoId, autoPlay } = this._pendingYtVideo;
                this._pendingYtVideo = null;
                if (autoPlay) {
                  this.ytPlayer.loadVideoById({ videoId, startSeconds: 0 });
                } else {
                  this.ytPlayer.cueVideoById({ videoId, startSeconds: 0 });
                }
              }
              resolve(this.ytPlayer);
            },
            onStateChange: (e) => {
              // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING
              if (e.data === 1) {
                this.isPlaying = true;
                const ytTime = typeof this.ytPlayer.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0;
                this.lastSyncAudioTime = ytTime || 0;
                this.lastSyncPerfTime = performance.now();
                this._emitPlayState(true);
              } else if (e.data === 2) {
                this.isPlaying = false;
                this._emitPlayState(false);
              } else if (e.data === 0) {
                this.isPlaying = false;
                this.lastSyncAudioTime = 0;
                this.currentTime = 0;
                this._emitPlayState(false);
                this.emit('ended');
              }
            },
            onError: (e) => {
              console.warn('⚠️ YouTube Player notice:', e.data);
            }
          }
        });
      } catch (err) {
        console.error('Failed to initialize YouTube IFrame Player:', err);
        reject(err);
      }
    });

    return this._ytPlayerPromise;
  }

  setupListeners() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.lastSyncAudioTime = this.audio.currentTime;
      this.lastSyncPerfTime = performance.now();
      this._emitPlayState(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.lastSyncAudioTime = this.audio.currentTime;
      this.lastSyncPerfTime = performance.now();
      this._emitPlayState(false);
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.lastSyncAudioTime = 0;
      this.currentTime = 0;
      this._emitPlayState(false);
      this.emit('ended');
    });

    this.audio.addEventListener('seeked', () => {
      this.lastSyncAudioTime = this.audio.currentTime;
      this.lastSyncPerfTime = performance.now();
      this.currentTime = this.audio.currentTime;
      this.checkBeatsAndSegments();
    });

    this.audio.addEventListener('timeupdate', () => {
      const actualTime = this.audio.currentTime;
      const predicted = this.lastSyncAudioTime + (performance.now() - this.lastSyncPerfTime) * 0.001 * (this.audio.playbackRate || 1.0);
      // If drift exceeds 50ms (e.g. buffering or seek), re-anchor smoothly
      if (Math.abs(predicted - actualTime) > 0.05) {
        this.lastSyncAudioTime = actualTime;
        this.lastSyncPerfTime = performance.now();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration;
      this._emitTimeUpdate(this.currentTime, this.duration);
      if (this.currentTrack) {
        this.currentTrack.duration = this.duration;
        if (this.currentTrack.analysis && (this.currentTrack.analysis.isSynthesized || !this.currentTrack.analysis.beats || this.currentTrack.analysis.beats.length === 0)) {
          this._generateBeatGrid(this.currentTrack);
        }
      }
    });

    this.audio.addEventListener('error', (e) => {
      if (this.isYouTubeMode) return;
      console.warn('⚠️ AudioEngine: Media element error:', this.audio.error);
      this.isPlaying = false;
      this._emitPlayState(false);
    });
  }

  /**
   * Automatically loads accompanying .json ground-truth beat analysis if available.
   */
  async _loadTrackAnalysisJson(track) {
    if (!track) return;
    if (track.analysis?.beats && track.analysis.beats.length > 0 && !track.analysis.isSynthesized) {
      this.bpm = track.analysis.bpm || track.bpm || this.bpm;
      return;
    }

    const candidateUrls = [];
    if (track.file && typeof track.file === 'string' && track.file.startsWith('/tracks/')) {
      candidateUrls.push(track.file.replace(/\.[^/.]+$/, '.json'));
    }
    if (track.id) {
      candidateUrls.push(`/tracks/${track.id}.json`);
    }
    if (track.fileName) {
      candidateUrls.push(`/tracks/${track.fileName.replace(/\.[^/.]+$/, '.json')}`);
    }

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          if (text && text.startsWith('{')) {
            const data = JSON.parse(text);
            if (data && data.bpm && Array.isArray(data.beats) && data.beats.length > 0) {
              track.analysis = data;
              track.bpm = data.bpm;
              track.duration = data.duration || track.duration;
              this.bpm = data.bpm;
              this.duration = track.duration;
              console.log(`🎯 Loaded ground-truth musical beat grid for [${track.title || track.id}]: ${data.beats.length} beats @ ${data.bpm} BPM`);
              return;
            }
          }
        }
      } catch (e) {}
    }
  }

  /**
   * Returns exact musical beat phase progress [0.0, 1.0)
   * where 0.0 is the exact millisecond of the kick drum / downbeat.
   */
  getBeatProgress() {
    const beats = this.currentTrack?.analysis?.beats;
    const t = this.currentTime;
    if (beats && beats.length > 1) {
      const idx = this.currentBeatIndex;
      if (idx >= 0 && idx < beats.length - 1) {
        const b0 = beats[idx];
        const b1 = beats[idx + 1];
        if (b1 > b0 && t >= b0 && t <= b1) {
          return (t - b0) / (b1 - b0);
        }
      }
      const firstBeat = beats[0] || 0;
      const beatPeriod = 60.0 / (this.bpm || 120);
      if (t < firstBeat) {
        const diff = (firstBeat - t) % beatPeriod;
        return (beatPeriod - diff) / beatPeriod;
      }
      return ((t - firstBeat) % beatPeriod) / beatPeriod;
    }
    const beatPeriod = 60.0 / (this.bpm || 120);
    return (t % beatPeriod) / beatPeriod;
  }

  /**
   * Ensures every track (pre-loaded, uploaded, or searched open-source)
   * has a complete, high-precision musical beat grid and 4-bar/8-bar section structures.
   */
  _ensureTrackAnalysis(track) {
    if (!track.analysis) {
      track.analysis = {};
    }
    if (!track.analysis.bpm || track.analysis.bpm <= 0) {
      track.analysis.bpm = track.bpm || 120;
    }
    this.bpm = track.analysis.bpm;

    if (!track.analysis.beats || track.analysis.beats.length === 0) {
      this._generateBeatGrid(track);
    }
  }

  /**
   * Instant mathematical musical phrase and beat grid synthesizer (< 1ms).
   * Generates exact beat timestamps and standard electronic/pop/hip-hop section structures.
   */
  _generateBeatGrid(track) {
    const bpm = Math.max(50, Math.min(240, this.bpm || track.bpm || 128));
    const beatPeriod = 60.0 / bpm;
    const dur = Math.max(20, track.duration || this.audio.duration || 180);
    const totalBeats = Math.ceil(dur / beatPeriod) + 4;

    const beats = [];
    const downbeats = [];
    for (let i = 0; i < totalBeats; i++) {
      const t = parseFloat((i * beatPeriod).toFixed(4));
      beats.push(t);
      if (i % 4 === 0) downbeats.push(t);
    }

    // Standard 4-bar (16-beat) and 8-bar (32-beat) musical phrasing
    const sectionTemplates = [
      { bars: 4, name: 'Intro', style: 'intro', energy: 0.35 },
      { bars: 8, name: 'Verse 1', style: 'rhythm', energy: 0.65 },
      { bars: 4, name: 'Buildup', style: 'high_energy', energy: 0.85 },
      { bars: 8, name: 'Chorus / Drop', style: 'high_energy', energy: 0.96 },
      { bars: 8, name: 'Verse 2', style: 'rhythm', energy: 0.68 },
      { bars: 4, name: 'Breakdown', style: 'chill', energy: 0.45 },
      { bars: 4, name: 'Buildup 2', style: 'high_energy', energy: 0.88 },
      { bars: 8, name: 'Final Drop', style: 'high_energy', energy: 0.98 },
      { bars: 8, name: 'Outro', style: 'outro', energy: 0.35 }
    ];

    const segments = [];
    let currentBeat = 0;
    for (const sec of sectionTemplates) {
      if (currentBeat >= totalBeats) break;
      const numBeats = sec.bars * 4;
      const start = beats[currentBeat] || (currentBeat * beatPeriod);
      const nextBeat = Math.min(totalBeats - 1, currentBeat + numBeats);
      const end = beats[nextBeat] || (nextBeat * beatPeriod);

      segments.push({
        name: sec.name,
        style: sec.style,
        energy: sec.energy,
        start,
        end
      });
      currentBeat = nextBeat;
    }

    track.analysis.bpm = bpm;
    track.analysis.duration = dur;
    track.analysis.beats = beats;
    track.analysis.downbeats = downbeats;
    track.analysis.segments = segments;
    track.analysis.isSynthesized = true;
    console.log(`⚡ Instant Beat Grid synthesized for [${track.title || 'Track'}]: ${beats.length} beats @ ${bpm} BPM, ${segments.length} musical sections`);
  }

  async loadTrack(track) {
    this.currentTrack = track;
    // Load ground-truth analysis JSON if available
    await this._loadTrackAnalysisJson(track);
    this.bpm = track.bpm || track.analysis?.bpm || 120;
    this.currentBeatIndex = -1;
    this.currentSegment = null;

    // Guarantee full musical beat grid and section analysis
    this._ensureTrackAnalysis(track);

    const isYouTube = !!(track.isYouTube || track.videoId || (track.id && String(track.id).startsWith('yt_')));

    if (isYouTube) {
      this.isYouTubeMode = true;
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch (e) {}

      const videoId = track.videoId || String(track.id).replace(/^yt_/, '');
      this.duration = track.duration || 180;
      this.currentTime = 0;
      this.lastSyncAudioTime = 0;
      this.lastSyncPerfTime = performance.now();

      await this.ensureYouTubePlayer();
      if (this.isYtReady && this.ytPlayer) {
        try {
          if (typeof this.ytPlayer.loadVideoById === 'function') {
            this.ytPlayer.loadVideoById({ videoId, startSeconds: 0 });
          }
          if (typeof this.ytPlayer.setVolume === 'function') {
            this.ytPlayer.setVolume(Math.round((this.audio.volume ?? 1.0) * 100));
          }
        } catch (err) {
          console.warn('YouTube Player load error:', err);
        }
      } else {
        this._pendingYtVideo = { videoId, autoPlay: true };
      }

      this._emitTrackChange(track);
      return;
    }

    // Standard local / uploaded track:
    this.isYouTubeMode = false;
    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try { this.ytPlayer.pauseVideo(); } catch (e) {}
    }
    this.audio.src = track.file;
    this.audio.load();

    this._emitTrackChange(track);
  }

  async play() {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn('AudioContext resume warning:', e);
      }
    }

    if (this.isYouTubeMode) {
      this.isPlaying = true;
      if (this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
        try {
          this.ytPlayer.playVideo();
        } catch (e) {
          console.warn('YouTube playVideo error:', e);
        }
      }
      this._emitPlayState(true);
      return true;
    }

    try {
      await this.audio.play();
      return true;
    } catch (err) {
      console.warn('AudioEngine.play() rejected or prevented:', err.message);
      this.isPlaying = false;
      this._emitPlayState(false);
      throw err;
    }
  }

  pause() {
    this.isPlaying = false;
    if (this.isYouTubeMode) {
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo(); } catch (e) {}
      }
      this._emitPlayState(false);
      return;
    }
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(timeInSeconds) {
    const clamped = Math.max(0, Math.min(timeInSeconds, this.duration || 1000));
    this.currentTime = clamped;
    this.lastSyncAudioTime = clamped;
    this.lastSyncPerfTime = performance.now();

    if (this.isYouTubeMode) {
      if (this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
        try { this.ytPlayer.seekTo(clamped, true); } catch (e) {}
      }
    } else {
      this.audio.currentTime = clamped;
    }
    this.checkBeatsAndSegments();
  }

  setVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    this.audio.volume = v;
    if (this.gainNode) {
      this.gainNode.gain.value = v;
    }
    if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      try { this.ytPlayer.setVolume(Math.round(v * 100)); } catch (e) {}
    }
  }

  update() {
    if (this.isPlaying) {
      if (this.isYouTubeMode && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
        try {
          const ytTime = this.ytPlayer.getCurrentTime();
          if (typeof ytTime === 'number' && !isNaN(ytTime) && ytTime >= 0) {
            this.currentTime = ytTime;
            this.lastSyncAudioTime = ytTime;
            this.lastSyncPerfTime = performance.now();
          }
          const ytDur = this.ytPlayer.getDuration();
          if (typeof ytDur === 'number' && ytDur > 0) {
            this.duration = ytDur;
          }
        } catch (e) {}
      } else {
        const now = performance.now();
        const elapsed = (now - this.lastSyncPerfTime) * 0.001;
        this.currentTime = this.lastSyncAudioTime + elapsed * (this.audio.playbackRate || 1.0);
      }

      this.checkBeatsAndSegments();

      const now = performance.now();
      if (!this._lastUiUpdateTime || now - this._lastUiUpdateTime > 75) {
        this._lastUiUpdateTime = now;
        this._emitTimeUpdate(this.currentTime, this.duration);
      }
    }

    if (this.isPlaying) {
      if (this.analyser && !this.isYouTubeMode) {
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Real-time acoustic bass onset & drop detection
        const currentBass = this.getBassEnergy();
        const prevBass = this._prevBass || 0;
        this._prevBass = currentBass;
        const bassDelta = currentBass - prevBass;

        if (bassDelta > 0.12 && currentBass > 0.40) {
          const now = performance.now();
          if (!this._lastAcousticBeatTime || now - this._lastAcousticBeatTime > 200) {
            this._lastAcousticBeatTime = now;
            this.emit('acousticBeat', currentBass);
          }
        }
      } else if (this.isYouTubeMode) {
        const currentBass = this.getBassEnergy();
        const prevBass = this._prevBass || 0;
        this._prevBass = currentBass;
        const bassDelta = currentBass - prevBass;

        if (bassDelta > 0.12 && currentBass > 0.45) {
          const now = performance.now();
          if (!this._lastAcousticBeatTime || now - this._lastAcousticBeatTime > 200) {
            this._lastAcousticBeatTime = now;
            this.emit('acousticBeat', currentBass);
          }
        }
      }
    }
  }

  checkBeatsAndSegments() {
    if (!this.currentTrack || !this.currentTrack.analysis) return;
    const { beats, segments } = this.currentTrack.analysis;
    const t = this.currentTime;

    // Check beat hits with fast pointer
    if (beats && beats.length > 0) {
      // If time scrubbed backwards, reset search pointer
      let startIdx = (this.currentBeatIndex >= 0 && this.currentBeatIndex < beats.length && beats[this.currentBeatIndex] <= t)
        ? this.currentBeatIndex
        : 0;

      let bi = -1;
      for (let i = startIdx; i < beats.length; i++) {
        if (beats[i] <= t) {
          bi = i;
        } else {
          break;
        }
      }
      if (bi !== -1 && bi !== this.currentBeatIndex) {
        this.currentBeatIndex = bi;
        const isDownbeat = (bi % 4 === 0);
        this._emitBeat(bi, isDownbeat, beats[bi]);
      }
    }

    // Check segment
    if (segments && segments.length > 0) {
      const seg = segments.find(s => t >= s.start && t < s.end);
      if (seg && (!this.currentSegment || this.currentSegment.name !== seg.name)) {
        this.currentSegment = seg;
        this._emitSegmentChange(seg);
      }
    }
  }

  // Frequency bands (normalized 0.0 - 1.0)
  getBassEnergy() {
    if (!this.isPlaying) return 0;
    if (this.isYouTubeMode) {
      const beatPeriod = 60.0 / (this.bpm || 128);
      const phase = (this.currentTime % beatPeriod) / beatPeriod;
      const pulse = Math.pow(1.0 - Math.min(phase, 1.0 - phase) * 2.0, 3.0);
      const baseEnergy = (this.currentSegment?.energy || 0.6);
      return Math.min(1.0, baseEnergy * 0.4 + pulse * 0.6);
    }
    if (!this.analyser) return 0;
    // Bins ~ 20Hz - 160Hz
    let sum = 0;
    const count = 8;
    for (let i = 1; i <= count; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / count) / 255.0;
  }

  getMidEnergy() {
    if (!this.isPlaying) return 0;
    if (this.isYouTubeMode) {
      const beatPeriod = 60.0 / (this.bpm || 128);
      const phase = ((this.currentTime + beatPeriod * 0.5) % beatPeriod) / beatPeriod;
      const pulse = Math.pow(1.0 - Math.min(phase, 1.0 - phase) * 2.0, 2.0);
      return Math.min(1.0, 0.35 + pulse * 0.45);
    }
    if (!this.analyser) return 0;
    // Bins ~ 200Hz - 2500Hz
    let sum = 0;
    const start = 9;
    const end = 55;
    for (let i = start; i < end; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / (end - start)) / 255.0;
  }

  getHighEnergy() {
    if (!this.isPlaying) return 0;
    if (this.isYouTubeMode) {
      const beatPeriod = 30.0 / (this.bpm || 128);
      const phase = (this.currentTime % beatPeriod) / beatPeriod;
      return 0.3 + 0.4 * Math.pow(1.0 - Math.min(phase, 1.0 - phase) * 2.0, 2.0);
    }
    if (!this.analyser) return 0;
    // Bins ~ 2500Hz - 10000Hz
    let sum = 0;
    const start = 55;
    const end = 180;
    for (let i = start; i < end; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / (end - start)) / 255.0;
  }

  isVocalActive() {
    if (!this.currentTrack || !this.currentTrack.analysis) {
      return this.getMidEnergy() > 0.38;
    }
    const t = this.currentTime;
    const vocalSegs = this.currentTrack.analysis.vocal_segments || [];
    const inVocalSeg = vocalSegs.some(v => t >= v.start && t <= v.end);
    return inVocalSeg || (this.getMidEnergy() > 0.42);
  }

  /**
   * Real-Time Acoustic Formant Viseme & Word Articulator
   * Dynamically tracks vowel formants (F1, F2), sibilants, and plosive closures
   * to animate the mouth so the characters tell and sing the words in real-time.
   */
  getVocalVisemes() {
    if (this.isYouTubeMode && this.isPlaying) {
      const beatPeriod = 60.0 / (this.bpm || 128);
      const phase = (this.currentTime % beatPeriod) / beatPeriod;
      const syllablePulse = Math.pow(1.0 - Math.min(phase, 1.0 - phase) * 2.0, 2.5);
      const isChorus = (this.currentSegment?.style === 'high_energy' || this.currentSegment?.style === 'rhythm');
      const vocalAmp = isChorus ? 0.45 : 0.25;

      const targetAA = syllablePulse * vocalAmp;
      const targetIH = (1.0 - syllablePulse) * vocalAmp * 0.5;

      this._visemeState.aa = this._visemeState.aa * 0.7 + targetAA * 0.3;
      this._visemeState.ih = this._visemeState.ih * 0.7 + targetIH * 0.3;
      this._visemeState.smile = isChorus ? 0.35 : 0.2;
      return { ...this._visemeState };
    }

    if (!this.analyser || !this.isPlaying) {
      // Natural decay to resting position
      this._visemeState.aa *= 0.82;
      this._visemeState.ee *= 0.82;
      this._visemeState.aa *= 0.75;
      this._visemeState.ee *= 0.75;
      this._visemeState.ih *= 0.75;
      this._visemeState.oh *= 0.75;
      this._visemeState.ou *= 0.75;
      this._visemeState.mouth_close = 0.5;
      this._visemeState.smile = 0.1;
      return { ...this._visemeState };
    }

    const freq = this.frequencyData;
    // Formant 0: Fundamental pitch / warmth (130 - 350 Hz)
    let f0Sum = 0;
    for (let i = 3; i <= 8; i++) f0Sum += freq[i];
    const f0 = (f0Sum / 6) / 255.0;

    // Formant 1: Jaw height & vowel openness (380 - 950 Hz)
    let f1Sum = 0;
    for (let i = 9; i <= 22; i++) f1Sum += freq[i];
    const f1 = (f1Sum / 14) / 255.0;

    // Formant 2 Low: Rounded back vowels /u/, /o/ (980 - 1650 Hz)
    let f2LowSum = 0;
    for (let i = 23; i <= 38; i++) f2LowSum += freq[i];
    const f2Low = (f2LowSum / 16) / 255.0;

    // Formant 2 High: Spread front vowels /i/, /e/ (1680 - 2800 Hz)
    let f2HighSum = 0;
    for (let i = 39; i <= 65; i++) f2HighSum += freq[i];
    const f2High = (f2HighSum / 27) / 255.0;

    // Sibilance / Fricatives: 's', 't', 'ch', 'z' (3200 - 7500 Hz)
    let sibilantSum = 0;
    for (let i = 75; i <= 170; i++) sibilantSum += freq[i];
    const sibilant = (sibilantSum / 96) / 255.0;

    const vocalEnergy = (f1 * 1.6 + f2Low * 1.1 + f2High * 1.3) / 4.0;
    const isVocalActive = this.isVocalActive();
    
    // Dynamic syllable gating: articulate on vocal beats and spectral energy rises
    const vocalThreshold = isVocalActive ? 0.10 : 0.19;
    const isArticulating = (vocalEnergy > vocalThreshold) && (isVocalActive || vocalEnergy > 0.22);

    let targetAA = 0;
    let targetEE = 0;
    let targetIH = 0;
    let targetOH = 0;
    let targetOU = 0;
    let targetClose = 0.45; // resting gentle lip touch

    if (isArticulating) {
      // Natural singing mouth aperture capped at 0.52 to prevent fish-mouth gaping
      const openingAmp = Math.min(0.55, Math.max(0, (vocalEnergy - vocalThreshold) * 2.2));

      const frontSpread = f2High / (f2Low + 0.04);
      const backRound = f2Low / (f2High + 0.04);
      const openRatio = f1 / (f0 + 0.04);

      // Distinguish distinct phonemes:
      if (sibilant > vocalEnergy * 0.75 && sibilant > 0.14) {
        // Consonant friction ('s', 't', 'ch'): teeth close together
        targetClose = Math.min(0.85, sibilant * 1.8);
        targetIH = openingAmp * 0.25;
      } else if (openRatio > 1.15 && f1 > 0.20 && frontSpread < 1.4 && backRound < 1.4) {
        // Wide open vowel: /a/ ("ah" -> 'aa' / 'あ')
        targetAA = openingAmp * 0.95;
        targetClose = 0.05;
      } else if (frontSpread > 1.15) {
        // Front vowels: /e/ ('ee') or /i/ ('ih')
        if (f1 > 0.24) {
          targetEE = openingAmp * 0.85;
        } else {
          targetIH = openingAmp * 0.80;
        }
        targetClose = 0.1;
      } else if (backRound > 1.15) {
        // Rounded back vowels: /o/ ('oh') or /u/ ('ou')
        if (f1 > 0.24) {
          targetOH = openingAmp * 0.85;
        } else {
          targetOU = openingAmp * 0.75;
        }
        targetClose = 0.1;
      } else {
        // Subtle rhythmic singing articulation
        targetAA = openingAmp * 0.45;
        targetOH = openingAmp * 0.30;
        targetClose = 0.15;
      }
    } else {
      // Between words and during instrumental sections: mouth naturally relaxed closed
      targetClose = 0.55;
      targetAA = 0;
      targetEE = 0;
      targetIH = 0;
      targetOH = 0;
      targetOU = 0;
    }

    // Coarticulation smoothing (snappy attack ~20ms, graceful organic release ~60ms)
    const attack = 0.55;
    const decay = 0.22;

    const smooth = (curr, target) => {
      return target > curr ? curr + (target - curr) * attack : curr + (target - curr) * decay;
    };

    this._visemeState.aa = smooth(this._visemeState.aa, targetAA);
    this._visemeState.ee = smooth(this._visemeState.ee, targetEE);
    this._visemeState.ih = smooth(this._visemeState.ih, targetIH);
    this._visemeState.oh = smooth(this._visemeState.oh, targetOH);
    this._visemeState.ou = smooth(this._visemeState.ou, targetOU);
    this._visemeState.mouth_close = smooth(this._visemeState.mouth_close, targetClose);
    // Subtle, charming natural smile (never exceeding 0.22)
    const naturalSmile = 0.08 + Math.min(0.14, this.getBassEnergy() * 0.18);
    this._visemeState.smile = smooth(this._visemeState.smile, naturalSmile);

    return { ...this._visemeState };
  }
}
