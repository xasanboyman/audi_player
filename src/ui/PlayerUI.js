/**
 * PlayerUI.js
 * Modern tablet audio player UI matching the uploaded design, with full open-source
 * music search (Audius decentralized network), live 3D stage cards, A/B dancer switcher,
 * and stop/idle synchronization.
 */
const BUILTIN_TRACKS = [
  {
    id: 'brawl_stars_phonk',
    title: 'Brawl Stars Phonk (Drift Mix)',
    artist: 'Cyber Funk',
    file: '/tracks/brawl_stars_phonk.mp3',
    fileName: 'brawl_stars_phonk.mp3',
    bpm: 99.4,
    duration: 110.36,
    analysis: { bpm: 99.4, duration: 110.36, beats: [] }
  },
  {
    id: 'cyber_phonk_140',
    title: 'Cyber Phonk 140',
    artist: 'GhostxBlade',
    file: '/tracks/cyber_phonk_140.mp3',
    fileName: 'cyber_phonk_140.mp3',
    bpm: 140.0,
    duration: 45.0,
    analysis: { bpm: 140.0, duration: 45.0, beats: [] }
  },
  {
    id: 'future_idol_128',
    title: 'Future Idol 128',
    artist: 'K-Pop AI Studio',
    file: '/tracks/future_idol_128.mp3',
    fileName: 'future_idol_128.mp3',
    bpm: 128.0,
    duration: 45.0,
    analysis: { bpm: 128.0, duration: 45.0, beats: [] }
  }
];

export class PlayerUI {
  constructor(audioEngine, danceEngine, sceneManager) {
    this.audioEngine = audioEngine;
    this.danceEngine = danceEngine;
    this.sceneManager = sceneManager;

    this.tracks = [];
    this.currentTrackIndex = 0;
    this.isSeeking = false;
    this.isRepeat = false;
    this.isMuted = false;
    this.savedVolume = 0.9;

    this.initDOM();
    this.bindEvents();
    this.bindSearchEvents();
  }

  initDOM() {
    // Top Navigation
    this.projectTitle = document.getElementById('project-title');
    this.segBtns = document.querySelectorAll('#stage-segmented-control .seg-btn');

    // Right Floating Dock
    this.dockBtnStage = document.getElementById('dock-btn-stage');
    this.dockBtnSearch = document.getElementById('dock-btn-search');
    this.dockBtnMotions = document.getElementById('dock-btn-motions');
    this.dockBtnTrails = document.getElementById('dock-btn-trails');
    this.dockBtnSettings = document.getElementById('dock-btn-settings');

    // Floating Stage Cards
    this.cardTrackThumb = document.getElementById('card-track-thumb');
    this.cardTrackTitle = document.getElementById('card-track-title');
    this.cardTrackArtist = document.getElementById('card-track-artist');
    this.toggleCardPlaylist = document.getElementById('toggle-card-playlist');
    this.toggleCardOpenSearch = document.getElementById('toggle-card-opensearch');
    this.btnExpandTracks = document.getElementById('btn-expand-tracks');

    this.ovBpm = document.getElementById('ov-bpm');
    this.ovSection = document.getElementById('ov-section');
    this.selectDanceStyle = document.getElementById('select-dance-style');
    this.choreoPillMood = document.getElementById('choreo-pill-mood');
    this.choreoTextDetail = document.getElementById('choreo-text-detail');

    this.vocalEnergyFill = document.getElementById('vocal-energy-fill');
    this.vocalStatusText = document.getElementById('vocal-status-text');
    this.chipAA = document.getElementById('chip-aa');
    this.chipIH = document.getElementById('chip-ih');
    this.chipOU = document.getElementById('chip-ou');

    // Bottom Controls
    this.timeCurrent = document.getElementById('time-current');
    this.timeTotal = document.getElementById('time-total');
    this.trackTitle = document.getElementById('track-title');
    this.activeTrackLabelRow = document.getElementById('active-track-label-row');

    this.seekbarContainer = document.getElementById('seekbar-container');
    this.seekbarFill = document.getElementById('seekbar-fill');
    this.seekbarThumb = document.getElementById('seekbar-thumb');
    this.seekbarTooltip = document.getElementById('seekbar-tooltip');

    this.btnRewind = document.getElementById('btn-rewind');
    this.btnForward = document.getElementById('btn-forward');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnPlay = document.getElementById('btn-play');
    this.playIcon = document.getElementById('play-icon');
    this.btnStop = document.getElementById('btn-stop');
    this.btnRepeat = document.getElementById('btn-repeat');

    this.btnSearchOpenMusic = document.getElementById('btn-search-open-music');
    this.btnUploadMusic = document.getElementById('btn-upload-music');
    this.btnMute = document.getElementById('btn-mute');
    this.volumeIcon = document.getElementById('volume-icon');
    this.volumeSlider = document.getElementById('volume-slider');

    this.btnDancerA = document.getElementById('btn-dancer-a');
    this.btnDancerB = document.getElementById('btn-dancer-b');

    // Open Source Search Modal
    this.searchModal = document.getElementById('open-music-modal');
    this.searchModalBackdrop = document.getElementById('search-modal-backdrop');
    this.btnCloseSearchModal = document.getElementById('btn-close-search-modal');
    this.searchInput = document.getElementById('open-music-search-input');
    this.btnSubmitSearch = document.getElementById('btn-submit-music-search');
    this.genreChips = document.querySelectorAll('.chip-btn');
    this.searchResultsContainer = document.getElementById('open-music-results');
    this.searchLoadingIndicator = document.getElementById('search-loading-indicator');

    // Hidden inputs & modals
    this.audioFileInput = document.getElementById('audio-file-input');
    this.animFileInput = document.getElementById('anim-file-input');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalStatus = document.getElementById('modal-status');
  }

  bindEvents() {
    // Top Nav Segmented Control (Duo / Solo Ani / Solo Riko)
    this.segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.segBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.sceneManager.setDancerMode(mode);
        this.updateABButtons(mode);
      });
    });

    // Right Dock
    if (this.dockBtnStage) {
      this.dockBtnStage.addEventListener('click', () => {
        this.sceneManager.cameraMode = 'dynamic';
      });
    }

    if (this.dockBtnSearch) {
      this.dockBtnSearch.addEventListener('click', () => this.openSearchModal());
    }

    if (this.dockBtnMotions) {
      this.dockBtnMotions.addEventListener('click', () => {
        // Cycle dance styles
        const styles = ['auto', 'phonk', 'idol', 'groove', 'bending', 'expressive'];
        const currentIdx = styles.indexOf(this.danceEngine.danceStyle);
        const nextStyle = styles[(currentIdx + 1) % styles.length];
        this.danceEngine.danceStyle = nextStyle;
        if (this.selectDanceStyle) this.selectDanceStyle.value = nextStyle;
        if (this.audioEngine.isPlaying) this.danceEngine.selectNextChoreography(true);
      });
    }

    if (this.dockBtnTrails) {
      this.dockBtnTrails.addEventListener('click', () => {
        const enabled = !this.sceneManager.glowingTrailsEnabled;
        this.sceneManager.setGlowingTrailsEnabled(enabled);
        this.dockBtnTrails.classList.toggle('active', enabled);
      });
    }

    if (this.dockBtnSettings) {
      this.dockBtnSettings.addEventListener('click', () => this.openSearchModal());
    }

    // Floating Cards
    if (this.btnExpandTracks) {
      this.btnExpandTracks.addEventListener('click', () => this.openSearchModal());
    }
    if (this.toggleCardOpenSearch) {
      this.toggleCardOpenSearch.addEventListener('click', () => this.openSearchModal());
    }
    if (this.activeTrackLabelRow) {
      this.activeTrackLabelRow.addEventListener('click', () => this.openSearchModal());
    }

    // Dance Style Selector
    if (this.selectDanceStyle) {
      this.selectDanceStyle.addEventListener('change', (e) => {
        this.danceEngine.danceStyle = e.target.value;
        if (this.audioEngine.isPlaying) {
          this.danceEngine.selectNextChoreography(true);
        }
      });
    }

    // Playback Controls
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => this.audioEngine.togglePlay());
    }

    if (this.btnRewind) {
      this.btnRewind.addEventListener('click', () => {
        this.audioEngine.seek(Math.max(0, this.audioEngine.currentTime - 5.0));
      });
    }

    if (this.btnForward) {
      this.btnForward.addEventListener('click', () => {
        this.audioEngine.seek(Math.min(this.audioEngine.duration, this.audioEngine.currentTime + 5.0));
      });
    }

    if (this.btnPrev) {
      this.btnPrev.addEventListener('click', () => this.playPrevTrack());
    }

    // Stop Button: Immediately stops playback, seeks to 0, and crossfades dancers into Idle pose!
    if (this.btnStop) {
      this.btnStop.addEventListener('click', () => {
        this.audioEngine.pause();
        this.audioEngine.seek(0);
        this.danceEngine.playIdle(0.65);
      });
    }

    // Repeat Toggle
    if (this.btnRepeat) {
      this.btnRepeat.addEventListener('click', () => {
        this.isRepeat = !this.isRepeat;
        this.btnRepeat.classList.toggle('active', this.isRepeat);
        this.btnRepeat.title = this.isRepeat ? 'Repeat (On)' : 'Repeat (Off)';
      });
    }

    // Play State Listener
    this.audioEngine.on('playStateChange', (isPlaying) => {
      if (this.playIcon) {
        this.playIcon.textContent = isPlaying ? '❚❚' : '▶';
      }
      if (this.btnPlay) {
        this.btnPlay.classList.toggle('playing', isPlaying);
      }
      if (!isPlaying) {
        if (this.choreoPillMood) {
          this.choreoPillMood.className = 'choreo-pill calm';
          this.choreoPillMood.textContent = '🧘 IDLE POSE';
        }
        if (this.choreoTextDetail) {
          this.choreoTextDetail.textContent = 'Dual Dancers Resting in Poised Idle Stance';
        }
      }
    });

    // Live Choreography Listener (Updates from 1,000+ Motion Library)
    this.danceEngine.on('choreographyChange', ({ lead, partner, mood }) => {
      if (this.choreoPillMood) {
        this.choreoPillMood.className = `choreo-pill ${mood || 'groove'}`;
        const moodLabels = {
          energetic: '🔥 ENERGETIC',
          calm: '🌊 CALM FLOW',
          vocal: '🎤 VOCALS',
          groove: '🎵 GROOVE'
        };
        this.choreoPillMood.textContent = moodLabels[mood] || '💃 DANCE';
      }
      if (this.choreoTextDetail) {
        const leadTitle = lead?.title || lead?.description || 'Performance';
        const partnerTitle = partner?.title || partner?.description || 'Performance';
        this.choreoTextDetail.textContent = `Ani: ${leadTitle} • Riko: ${partnerTitle}`;
      }
    });

    // Song ended
    const onSongEnded = () => {
      if (this.isRepeat) {
        this.selectTrack(this.currentTrackIndex, true);
      } else {
        this.playNextTrack();
      }
    };
    this.audioEngine.audio.addEventListener('ended', onSongEnded);
    this.audioEngine.on('ended', onSongEnded);

    // Time update & seeking
    this.audioEngine.on('timeUpdate', (curr, dur) => {
      if (!this.isSeeking) {
        if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(curr);
        if (this.timeTotal) this.timeTotal.textContent = this.formatTime(dur);
        const pct = dur > 0 ? (curr / dur) * 100 : 0;
        if (this.seekbarFill) this.seekbarFill.style.width = `${pct}%`;
        if (this.seekbarThumb) this.seekbarThumb.style.left = `${pct}%`;
      }

      // Vocal intensity & visemes in card 3
      if (this.vocalEnergyFill) {
        const isVocal = this.audioEngine.isVocalActive();
        const vocalEnergy = isVocal ? (this.audioEngine.getBassEnergy() * 100) : 0;
        this.vocalEnergyFill.style.width = `${Math.min(100, Math.max(0, vocalEnergy))}%`;
        if (this.vocalStatusText) {
          this.vocalStatusText.textContent = isVocal 
            ? '🎤 Vocals Detected • Speech2Motion Active' 
            : '🎵 Musical Rhythm Phrasing';
        }
      }

      // Update viseme chips
      const visemes = this.audioEngine.getVocalVisemes();
      if (visemes) {
        if (this.chipAA) this.chipAA.classList.toggle('active', visemes.aa > 0.35);
        if (this.chipIH) this.chipIH.classList.toggle('active', visemes.ih > 0.35);
        if (this.chipOU) this.chipOU.classList.toggle('active', visemes.ou > 0.35);
      }
    });

    // Seekbar mouse events
    if (this.seekbarContainer) {
      this.seekbarContainer.addEventListener('mousemove', (e) => {
        const rect = this.seekbarContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const hoverTime = ratio * (this.audioEngine.duration || 0);
        if (this.seekbarTooltip) {
          this.seekbarTooltip.textContent = this.formatTime(hoverTime);
          this.seekbarTooltip.style.left = `${(e.clientX - rect.left)}px`;
          this.seekbarTooltip.style.opacity = '1';
        }
        if (this.isSeeking) {
          this.updateSeek(e);
        }
      });

      this.seekbarContainer.addEventListener('mouseleave', () => {
        if (this.seekbarTooltip) this.seekbarTooltip.style.opacity = '0';
      });

      this.seekbarContainer.addEventListener('mousedown', (e) => {
        this.isSeeking = true;
        this.updateSeek(e);
        const onMouseMove = (moveE) => this.updateSeek(moveE);
        const onMouseUp = () => {
          this.isSeeking = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    // Volume & Mute
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.audioEngine.setVolume(val);
        this.isMuted = (val === 0);
        this.updateVolumeIcon(val);
      });
    }

    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        if (this.isMuted) {
          this.isMuted = false;
          const vol = this.savedVolume || 0.8;
          this.audioEngine.setVolume(vol);
          if (this.volumeSlider) this.volumeSlider.value = vol;
          this.updateVolumeIcon(vol);
        } else {
          this.savedVolume = parseFloat(this.volumeSlider?.value || 0.8);
          this.isMuted = true;
          this.audioEngine.setVolume(0);
          if (this.volumeSlider) this.volumeSlider.value = 0;
          this.updateVolumeIcon(0);
        }
      });
    }

    // A / B Dancer Switcher
    if (this.btnDancerA && this.btnDancerB) {
      this.btnDancerA.addEventListener('click', () => {
        const isBActive = this.btnDancerB.classList.contains('active');
        if (!isBActive) {
          // B is off, ensure A stays on
          this.btnDancerA.classList.add('active');
          this.sceneManager.setDancerMode('solo_ani');
        } else {
          // Both were on, toggle to solo Riko
          this.btnDancerA.classList.remove('active');
          this.sceneManager.setDancerMode('solo_riko');
        }
        this.syncSegWithAB();
      });

      this.btnDancerB.addEventListener('click', () => {
        const isAActive = this.btnDancerA.classList.contains('active');
        if (!isAActive) {
          this.btnDancerB.classList.add('active');
          this.sceneManager.setDancerMode('solo_riko');
        } else {
          this.btnDancerB.classList.remove('active');
          this.sceneManager.setDancerMode('solo_ani');
        }
        this.syncSegWithAB();
      });
    }

    // Open Music Search button & Upload button
    if (this.btnSearchOpenMusic) {
      this.btnSearchOpenMusic.addEventListener('click', () => this.openSearchModal());
    }

    if (this.btnUploadMusic && this.audioFileInput) {
      this.btnUploadMusic.addEventListener('click', () => this.audioFileInput.click());
      this.audioFileInput.addEventListener('change', (e) => this.handleAudioUpload(e));
    }

    // Segment & Beat updates for Card 2 (Overview)
    this.audioEngine.on('segmentChange', (seg) => {
      if (this.ovSection) this.ovSection.textContent = (seg.name || 'VERSE').toUpperCase();
    });

    this.audioEngine.on('beat', (beatIndex, isDownbeat) => {
      if (this.ovBpm) {
        this.ovBpm.textContent = (this.audioEngine.bpm || 120).toFixed(1);
      }
    });
  }

  updateABButtons(mode) {
    if (!this.btnDancerA || !this.btnDancerB) return;
    if (mode === 'duo') {
      this.btnDancerA.classList.add('active');
      this.btnDancerB.classList.add('active');
    } else if (mode === 'solo_ani') {
      this.btnDancerA.classList.add('active');
      this.btnDancerB.classList.remove('active');
    } else if (mode === 'solo_riko') {
      this.btnDancerA.classList.remove('active');
      this.btnDancerB.classList.add('active');
    }
  }

  syncSegWithAB() {
    const a = this.btnDancerA.classList.contains('active');
    const b = this.btnDancerB.classList.contains('active');
    let mode = 'duo';
    if (a && !b) mode = 'solo_ani';
    else if (!a && b) mode = 'solo_riko';
    else if (a && b) mode = 'duo';

    this.segBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  updateVolumeIcon(val) {
    if (!this.volumeIcon) return;
    if (val === 0) {
      this.volumeIcon.textContent = '🔇';
    } else if (val < 0.5) {
      this.volumeIcon.textContent = '🔉';
    } else {
      this.volumeIcon.textContent = '🔊';
    }
  }

  updateSeek(e) {
    const rect = this.seekbarContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = ratio * (this.audioEngine.duration || 0);
    this.audioEngine.seek(seekTime);
  }

  formatTime(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // ==========================================
  // Open Source Music Search Engine
  // ==========================================
  bindSearchEvents() {
    if (this.btnCloseSearchModal && this.searchModal) {
      const close = () => {
        this.searchModal.classList.remove('active');
        this.searchModalBackdrop.classList.remove('active');
      };
      this.btnCloseSearchModal.addEventListener('click', close);
      if (this.searchModalBackdrop) this.searchModalBackdrop.addEventListener('click', close);
    }

    if (this.btnSubmitSearch && this.searchInput) {
      this.btnSubmitSearch.addEventListener('click', () => {
        this.searchOpenMusic(this.searchInput.value.trim());
      });
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.searchOpenMusic(this.searchInput.value.trim());
        }
      });
    }

    // Genre chips
    this.genreChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.genreChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const q = chip.dataset.query;
        if (q === 'trending') {
          this.fetchTrendingOpenMusic();
        } else {
          if (this.searchInput) this.searchInput.value = q;
          this.searchOpenMusic(q);
        }
      });
    });
  }

  openSearchModal() {
    if (!this.searchModal) return;
    this.searchModal.classList.add('active');
    if (this.searchModalBackdrop) this.searchModalBackdrop.classList.add('active');
    if (this.searchInput) this.searchInput.focus();

    // If results list is empty, pre-load trending tracks!
    if (this.searchResultsContainer && this.searchResultsContainer.children.length <= 1) {
      this.fetchTrendingOpenMusic();
    }
  }

  async fetchTrendingOpenMusic() {
    this.showSearchLoading(true);
    try {
      const res = await fetch('/api/music/trending?limit=25');
      const data = await res.json();
      if (data.success && data.tracks) {
        this.renderSearchResults(data.tracks);
      }
    } catch (e) {
      console.error('Error fetching trending open music:', e);
    } finally {
      this.showSearchLoading(false);
    }
  }

  async searchOpenMusic(query) {
    if (!query) return;
    this.showSearchLoading(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=25`);
      const data = await res.json();
      if (data.success && data.tracks) {
        this.renderSearchResults(data.tracks);
      }
    } catch (e) {
      console.error('Error searching open music:', e);
    } finally {
      this.showSearchLoading(false);
    }
  }

  showSearchLoading(show) {
    if (this.searchLoadingIndicator) {
      this.searchLoadingIndicator.style.display = show ? 'flex' : 'none';
    }
  }

  renderSearchResults(tracks) {
    if (!this.searchResultsContainer) return;
    // Clear previous results but keep loading indicator
    const indicator = this.searchLoadingIndicator;
    this.searchResultsContainer.innerHTML = '';
    if (indicator) this.searchResultsContainer.appendChild(indicator);

    if (tracks.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'padding:40px;text-align:center;color:var(--text-muted);font-size:13px;';
      emptyMsg.textContent = 'No tracks found for this query. Try "phonk drift", "cyberpunk", or "edm"!';
      this.searchResultsContainer.appendChild(emptyMsg);
      return;
    }

    tracks.forEach(t => {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      const thumbUrl = t.thumbnail || t.artwork;
      const durationStr = t.durationFormatted || this.formatTime(t.duration || 180);
      const channelName = t.channel || t.artist || 'YouTube';
      const viewsStr = t.views ? `<span class="res-view-count">• ${t.views}</span>` : '';

      const thumbHtml = thumbUrl
        ? `<div class="res-thumb-container">
             <img class="res-thumb-img" src="${thumbUrl}" alt="${t.title}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'res-thumb-fallback\\'>🎧</div>';">
             <span class="res-duration-badge">${durationStr}</span>
           </div>`
        : `<div class="res-thumb-container">
             <div class="res-thumb-fallback">🎧</div>
             <span class="res-duration-badge">${durationStr}</span>
           </div>`;

      item.innerHTML = `
        <div class="res-left">
          ${thumbHtml}
          <div class="res-meta">
            <div class="res-title" title="${t.title}">${t.title}</div>
            <div class="res-sub">
              <span class="res-channel-badge">${channelName}</span>
              ${viewsStr}
            </div>
          </div>
        </div>
        <div class="res-right">
          <button class="res-btn-play">▶ Play & Dance</button>
        </div>
      `;

      item.addEventListener('click', () => {
        this.playOpenSourceTrack(t);
        // Close modal
        if (this.searchModal) this.searchModal.classList.remove('active');
        if (this.searchModalBackdrop) this.searchModalBackdrop.classList.remove('active');
      });

      this.searchResultsContainer.appendChild(item);
    });
  }

  async playOpenSourceTrack(track) {
    const channelName = track.channel || track.artist || 'YouTube';
    const artworkUrl = track.thumbnail || track.artwork || '';
    const cleanVideoId = track.videoId || (track.id ? String(track.id).replace(/^yt_/, '') : '');
    const streamUrl = track.streamUrl || `/api/youtube/stream/${cleanVideoId}`;

    console.log(`📺 Playing YouTube Track: [${track.title}] by ${channelName}`);

    // Update UI Elements
    if (this.trackTitle) this.trackTitle.textContent = track.title;
    if (this.cardTrackTitle) this.cardTrackTitle.textContent = track.title;
    if (this.cardTrackArtist) this.cardTrackArtist.textContent = `${channelName} • YouTube Live`;
    if (this.ovBpm) this.ovBpm.textContent = (track.bpm || 128).toFixed(1);

    if (this.cardTrackThumb) {
      if (artworkUrl) {
        this.cardTrackThumb.innerHTML = `<img src="${artworkUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentNode.innerHTML='<span>🎧</span>'">`;
      } else {
        this.cardTrackThumb.innerHTML = `<span>🎧</span>`;
      }
    }

    const formattedTrack = {
      id: track.id || `yt_${cleanVideoId}`,
      videoId: cleanVideoId,
      isYouTube: true,
      title: track.title,
      artist: channelName,
      file: streamUrl,
      duration: track.duration || 180,
      bpm: track.bpm || 128,
      artwork: artworkUrl,
      analysis: {
        bpm: track.bpm || 128,
        duration: track.duration || 180,
        beats: []
      }
    };

    // Add to tracks list if not present
    this.tracks.unshift(formattedTrack);
    this.currentTrackIndex = 0;

    try {
      await this.audioEngine.loadTrack(formattedTrack);
      await this.audioEngine.play();
      await this.danceEngine.selectNextChoreography(true);
    } catch (err) {
      console.warn('Playback interrupted or prevented on YouTube track:', err);
      await this.danceEngine.playIdle(0.4);
    }
  }

  // ==========================================
  // Initial Data & Audio Uploads
  // ==========================================
  async loadInitialData() {
    await this.fetchTracks();
    await this.danceEngine.loadCuratedMotions();
  }

  async fetchTracks() {
    try {
      const res = await fetch('/api/tracks');
      if (res.ok) {
        const text = await res.text();
        if (text && text.startsWith('{')) {
          const data = JSON.parse(text);
          if (data.success && data.tracks && data.tracks.length > 0) {
            this.tracks = data.tracks;
            this.selectTrack(0, false);
            return;
          }
        }
      }
    } catch (e) {}

    // Graceful built-in fallback tracks (instant, zero-latency on static Vercel edge)
    this.tracks = BUILTIN_TRACKS;
    this.selectTrack(0, false);
  }

  async selectTrack(index, autoPlay = true) {
    if (index < 0 || index >= this.tracks.length) return;
    this.currentTrackIndex = index;
    const track = this.tracks[index];

    if (this.trackTitle) this.trackTitle.textContent = track.title;
    if (this.cardTrackTitle) this.cardTrackTitle.textContent = track.title;
    if (this.cardTrackArtist) this.cardTrackArtist.textContent = `${track.artist} • ${track.bpm || 120} BPM`;
    if (this.ovBpm) this.ovBpm.textContent = (track.bpm || 120).toFixed(1);

    await this.audioEngine.loadTrack(track);

    if (autoPlay) {
      try {
        await this.audioEngine.play();
        await this.danceEngine.selectNextChoreography(true);
      } catch (err) {
        console.warn('AutoPlay prevented or interrupted:', err);
        await this.danceEngine.playIdle(0.3);
      }
    } else {
      await this.danceEngine.playIdle(0.3);
    }
  }

  playNextTrack() {
    if (this.tracks.length === 0) return;
    const nextIdx = (this.currentTrackIndex + 1) % this.tracks.length;
    this.selectTrack(nextIdx, true);
  }

  playPrevTrack() {
    if (this.tracks.length === 0) return;
    const prevIdx = (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
    this.selectTrack(prevIdx, true);
  }

  async handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    this.showModal('Analyzing Audio with Librosa...', 'Extracting high-precision BPM, beat grid, energy curve, and vocal segments...');

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.track) {
        this.tracks.unshift(data.track);
        this.selectTrack(0, true);
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Audio upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      this.hideModal();
      this.audioFileInput.value = '';
    }
  }

  showModal(title, text) {
    if (this.modalOverlay) {
      if (this.modalStatus) this.modalStatus.textContent = title;
      this.modalOverlay.classList.add('active');
    }
  }

  hideModal() {
    if (this.modalOverlay) {
      this.modalOverlay.classList.remove('active');
    }
  }
}
