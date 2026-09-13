import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Dancer } from './Dancer.js';
import { StageLighting } from '../vfx/StageLighting.js';

/**
 * SceneManager.js
 * Manages Three.js WebGL scene, lighting, cameras, dual dancers, and the 60fps render loop.
 */
export class SceneManager {
  constructor(canvasContainer, audioEngine, danceEngine) {
    this.container = canvasContainer;
    this.audioEngine = audioEngine;
    this.danceEngine = danceEngine;

    this.dancers = [];
    this.activeDancerMode = 'duo'; // 'duo', 'solo_ani', 'solo_riko', 'solo_student'
    this.cameraMode = 'dynamic'; // 'dynamic', 'orbit', 'front'
    this.glowingTrailsEnabled = true;

    this.startTime = performance.now();
    this.lastFrameTime = performance.now();

    this.initThree();
    this.setupStage();
    this.setupDancers();
    this.setupEvents();
  }

  initThree() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06060c);
    this.scene.fog = new THREE.FogExp2(0x06060c, 0.04);

    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 50);
    this.camera.position.set(0, 1.45, 4.2);

    // Laptop & Battery Thermal Optimization:
    // Cap initial pixel ratio to 1.0 on standard displays or 1.15 on high-DPI
    // Eliminates massive multi-million pixel rasterization overload on laptop integrated GPUs (Intel Iris/UHD, AMD Vega)
    this.targetDpr = Math.min(window.devicePixelRatio || 1, 1.15);
    this.currentDpr = this.targetDpr;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'mediump'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(this.currentDpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false;

    // Performance monitor for dynamic resolution scaling
    this._frameHistory = [];
    this._dprCheckTimer = 0;
    this._lastRenderTime = 0;
    this.isTabVisible = !document.hidden;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.05, 0);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.02; // Don't go below stage floor
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 10;
  }

  setupStage() {
    this.stageLighting = new StageLighting(this.scene);
  }

  async setupDancers() {
    // Dancer 1: Ani (Pink Hair, Twintails, Cat ears) - matching screencast!
    this.dancerAni = new Dancer('Ani', this.scene, {
      position: new THREE.Vector3(-0.85, 0, 0),
      rotationY: 0.12,
      ribbonColor: new THREE.Color(1.0, 0.15, 0.58) // Hot Pink
    });

    // Dancer 2: Riko (Dark / Green Hair) - matching screencast!
    this.dancerRiko = new Dancer('Riko', this.scene, {
      position: new THREE.Vector3(0.85, 0, 0),
      rotationY: -0.12,
      ribbonColor: new THREE.Color(0.0, 0.95, 0.95) // Cyan
    });

    this.dancers = [this.dancerAni, this.dancerRiko];

    try {
      await Promise.all([
        this.dancerAni.load('/models/Ani.vrm'),
        this.dancerRiko.load('/models/riko.vrm')
      ]);
      console.log('Dual dancers (Ani & Riko) ready on stage!');
      if (this.danceEngine && this.danceEngine.setDancers) {
        this.danceEngine.setDancers(this.dancerAni, this.dancerRiko);
      }
    } catch (e) {
      console.error('Error loading initial dancers:', e);
    }
  }

  setDancerMode(mode) {
    this.activeDancerMode = mode;
    if (mode === 'duo') {
      if (this.dancerAni) {
        this.dancerAni.setVisible(true);
        this.dancerAni.basePosition.set(-0.85, 0, 0);
        if (this.dancerAni.vrm) this.dancerAni.vrm.scene.position.set(-0.85, 0, 0);
      }
      if (this.dancerRiko) {
        this.dancerRiko.setVisible(true);
        this.dancerRiko.basePosition.set(0.85, 0, 0);
        if (this.dancerRiko.vrm) this.dancerRiko.vrm.scene.position.set(0.85, 0, 0);
      }
    } else if (mode === 'solo_ani') {
      if (this.dancerAni) {
        this.dancerAni.setVisible(true);
        this.dancerAni.basePosition.set(0, 0, 0);
        if (this.dancerAni.vrm) this.dancerAni.vrm.scene.position.set(0, 0, 0);
      }
      if (this.dancerRiko) {
        this.dancerRiko.setVisible(false);
      }
    } else if (mode === 'solo_riko') {
      if (this.dancerAni) {
        this.dancerAni.setVisible(false);
      }
      if (this.dancerRiko) {
        this.dancerRiko.setVisible(true);
        this.dancerRiko.basePosition.set(0, 0, 0);
        if (this.dancerRiko.vrm) this.dancerRiko.vrm.scene.position.set(0, 0, 0);
      }
    }
  }

  setGlowingTrailsEnabled(enabled) {
    this.glowingTrailsEnabled = enabled;
    this.dancers.forEach(d => d.setRibbonsEnabled(enabled));
  }

  setRibbonColor(hex) {
    this.dancers.forEach(d => d.setRibbonColor(hex));
  }

  async playFBX(url) {
    for (const dancer of this.dancers) {
      if (url.endsWith('.json')) {
        await dancer.playRetargeted(url, 0.6);
      } else {
        await dancer.playFBX(url, 0.6);
      }
    }
  }

  setProceduralMode() {
    for (const dancer of this.dancers) {
      dancer.setMode('procedural');
    }
  }

  setupEvents() {
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
    });
  }

  onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.render());
  }

  render() {
    const now = performance.now();

    // 1. Laptop Thermal & Battery Saver: Skip rendering when browser tab is hidden in background
    if (document.hidden) {
      this.audioEngine.update();
      return;
    }

    // 2. Idle Power Saving Mode: Throttle to 30fps when music is paused to keep laptops cool
    const isPlaying = this.audioEngine.isPlaying;
    if (!isPlaying && (now - this._lastRenderTime < 32.0)) {
      return;
    }
    this._lastRenderTime = now;

    const realDelta = Math.max(0.001, Math.min((now - this.lastFrameTime) * 0.001, 0.066));
    this.lastFrameTime = now;
    const rawDelta = realDelta;
    const delta = realDelta;
    const elapsedTime = (now - this.startTime) * 0.001;

    // 3. Dynamic Resolution Scaling (DRS) for Laptop Performance Preservation
    this._frameHistory.push(rawDelta);
    if (this._frameHistory.length > 60) this._frameHistory.shift();
    this._dprCheckTimer += rawDelta;

    if (this._dprCheckTimer > 1.5 && this._frameHistory.length >= 30) {
      this._dprCheckTimer = 0;
      const avgDelta = this._frameHistory.reduce((a, b) => a + b, 0) / this._frameHistory.length;
      // If laptop is struggling (> 22ms per frame / < 45 FPS), smoothly downscale pixel ratio
      if (avgDelta > 0.022 && this.currentDpr > 0.75) {
        this.currentDpr = Math.max(0.75, this.currentDpr - 0.15);
        this.renderer.setPixelRatio(this.currentDpr);
      } 
      // If laptop has headroom (< 14ms per frame / > 70 FPS), gently restore toward targetDpr
      else if (avgDelta < 0.014 && this.currentDpr < this.targetDpr) {
        this.currentDpr = Math.min(this.targetDpr, this.currentDpr + 0.10);
        this.renderer.setPixelRatio(this.currentDpr);
      }
    }

    // 1. Update Audio Analysis
    this.audioEngine.update();

    // 2. Update Dance Engine
    this.danceEngine.update(delta);

    // 3. Update Dancers with synchronized poses (when in procedural mode)
    if (this.audioEngine.isPlaying) {
      const audioTime = this.audioEngine.currentTime;
      if (this.activeDancerMode === 'duo') {
        // Lead Dancer (Ani)
        if (this.dancerAni?.currentMode === 'procedural') {
          const poseAni = this.danceEngine.evaluatePose(audioTime, 0, false);
          this.dancerAni.applyPose(poseAni);
        }
        // Duo Partner (Riko)
        if (this.dancerRiko?.currentMode === 'procedural') {
          const poseRiko = this.danceEngine.evaluatePose(audioTime, 0.02, true);
          this.dancerRiko.applyPose(poseRiko);
        }
      } else if (this.activeDancerMode === 'solo_ani' && this.dancerAni?.currentMode === 'procedural') {
        const pose = this.danceEngine.evaluatePose(audioTime, 0, false);
        this.dancerAni.applyPose(pose);
      } else if (this.activeDancerMode === 'solo_riko' && this.dancerRiko?.currentMode === 'procedural') {
        const pose = this.danceEngine.evaluatePose(audioTime, 0, false);
        this.dancerRiko.applyPose(pose);
      }
    }

    // 4. Apply Dynamic Musical Beat Groove (bounce, lateral sway, head nod)
    if (this.danceEngine.grooveState) {
      if (this.dancerAni) this.dancerAni.applyBeatGroove(this.danceEngine.grooveState);
      if (this.dancerRiko) this.dancerRiko.applyBeatGroove(this.danceEngine.grooveState);
    }

    // 5. Update VRM Physics & Glowing Ribbon Trails
    this.dancers.forEach(dancer => dancer.update(delta, this.camera));

    // 5. Update Stage Lighting & 3D Audio Visualizer
    if (this.stageLighting) {
      this.stageLighting.update(elapsedTime, this.audioEngine);
    }

    // 6. Camera Motion
    if (this.cameraMode === 'dynamic') {
      // Subtle dynamic camera float + bass zoom
      const bass = this.audioEngine.getBassEnergy();
      const slowAngle = Math.sin(elapsedTime * 0.25) * 0.35;
      const camZ = 4.2 - bass * 0.25;
      const camY = 1.45 + Math.sin(elapsedTime * 0.5) * 0.08;

      this.camera.position.x = Math.sin(slowAngle) * camZ;
      this.camera.position.z = Math.cos(slowAngle) * camZ;
      this.camera.position.y = camY;
      this.camera.lookAt(0, 1.05 + bass * 0.05, 0);
    } else if (this.cameraMode === 'front') {
      this.camera.position.set(0, 1.45, 4.0);
      this.camera.lookAt(0, 1.05, 0);
    } else {
      this.controls.update();
    }

    // 7. Render
    this.renderer.render(this.scene, this.camera);
  }
}
