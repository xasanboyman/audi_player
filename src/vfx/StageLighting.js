import * as THREE from 'three';

/**
 * StageLighting.js
 * Creates a concert cyberpunk dance stage with audio-reactive floor rings,
 * 3D equalizer bars, moving spotlights, and ambient neon glow.
 */
export class StageLighting {
  constructor(scene) {
    this.scene = scene;
    this.equalizerBars = [];
    this.pulseRings = [];
    this.spotlights = [];

    this.setupEnvironment();
    this.setupFloor();
    this.setupEqualizerRing();
    this.setupSpotlights();
    this.setupParticleDust();
  }

  setupEnvironment() {
    // 1. Clean, flattering ambient fill light so VRM textures and anime faces are bright and clear
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.45);
    this.scene.add(this.ambientLight);

    // 2. Main Front Studio Key Light (Front-Top at gentle flattering angle ~30 deg, shining directly on faces)
    this.keyLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
    this.keyLight.position.set(0.8, 2.8, 3.8);
    this.keyLight.target.position.set(0, 1.0, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // 3. Soft Front Fill Light (Opposite side to eliminate harsh shadows)
    this.fillLight = new THREE.DirectionalLight(0xeef4ff, 1.3);
    this.fillLight.position.set(-2.2, 1.8, 3.2);
    this.fillLight.target.position.set(0, 1.0, 0);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    // 4. Rim Back Light for crisp anime hair & silhouette highlights against dark background
    this.rimLight = new THREE.DirectionalLight(0xffd5fa, 2.0);
    this.rimLight.position.set(0, 3.8, -3.2);
    this.rimLight.target.position.set(0, 1.0, 0);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // 5. Dedicated Dancer Stage Follow Spots (tracking Ani & Riko)
    this.dancerSpotAni = new THREE.SpotLight(0xff44aa, 4.0, 12, Math.PI / 5, 0.45, 1.0);
    this.dancerSpotAni.position.set(-0.6, 5.0, 1.8);
    this.dancerSpotAni.target.position.set(-0.55, 0.9, 0);
    this.scene.add(this.dancerSpotAni);
    this.scene.add(this.dancerSpotAni.target);

    this.dancerSpotRiko = new THREE.SpotLight(0x00f0ff, 4.0, 12, Math.PI / 5, 0.45, 1.0);
    this.dancerSpotRiko.position.set(0.6, 5.0, 1.8);
    this.dancerSpotRiko.target.position.set(0.55, 0.9, -0.2);
    this.scene.add(this.dancerSpotRiko);
    this.scene.add(this.dancerSpotRiko.target);
  }

  setupFloor() {
    // Main dark reflective stage floor
    const floorGeo = new THREE.CylinderGeometry(8, 8, 0.2, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090912,
      roughness: 0.15,
      metalness: 0.85
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.position.y = -0.1;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // Circular neon edge ring
    const edgeGeo = new THREE.RingGeometry(7.9, 8.05, 64);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide
    });
    const edgeRing = new THREE.Mesh(edgeGeo, edgeMat);
    edgeRing.rotation.x = -Math.PI / 2;
    edgeRing.position.y = 0.005;
    this.scene.add(edgeRing);

    // Dynamic bass pulse rings under dancers
    for (let i = 0; i < 2; i++) {
      const ringGeo = new THREE.RingGeometry(0.8, 0.88, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xff2a85 : 0x00f0ff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(i === 0 ? -0.85 : 0.85, 0.006, 0);
      this.scene.add(ring);
      this.pulseRings.push(ring);
    }
  }

  setupEqualizerRing() {
    // 48 equalizer pillars around stage perimeter
    const barCount = 48;
    const radius = 6.8;
    const barGeo = new THREE.BoxGeometry(0.12, 1, 0.12);

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const hue = i / barCount;
      const col = new THREE.Color().setHSL(0.85 - hue * 0.45, 0.9, 0.6);

      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      const bar = new THREE.Mesh(barGeo, mat);
      bar.position.x = Math.sin(angle) * radius;
      bar.position.z = Math.cos(angle) * radius;
      bar.position.y = 0.5;
      bar.scale.y = 0.1;
      this.scene.add(bar);
      this.equalizerBars.push(bar);
    }
  }

  setupSpotlights() {
    // Moving colored spotlights
    const colors = [0xff1177, 0x00d4ff, 0xaa00ff];
    for (let i = 0; i < 3; i++) {
      const spot = new THREE.SpotLight(colors[i], 5.0, 15, Math.PI / 6, 0.4, 1.2);
      spot.position.set(Math.sin(i * 2.1) * 4, 7, Math.cos(i * 2.1) * 4);
      spot.target.position.set(0, 1, 0);
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.spotlights.push(spot);
    }
  }

  setupParticleDust() {
    // Subtle floating neon sparkles
    const pCount = 200;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 8;
      pPos[i * 3 + 1] = Math.random() * 4;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xff99dd,
      size: 0.04,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.scene.add(this.particles);
  }

  update(time, audioEngine) {
    const bass = audioEngine ? audioEngine.getBassEnergy() : 0;
    const mid = audioEngine ? audioEngine.getMidEnergy() : 0;
    const high = audioEngine ? audioEngine.getHighEnergy() : 0;
    const isPlaying = audioEngine ? audioEngine.isPlaying : false;
    const freqData = audioEngine?.frequencyData;

    // 1. Update Floor pulse rings
    this.pulseRings.forEach((ring, idx) => {
      const scale = isPlaying ? (1.0 + (bass * 1.1) + Math.sin(time * 6 + idx) * 0.15) : 1.0;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = isPlaying ? Math.min(1.0, 0.4 + bass * 0.8) : 0.25;
    });

    // 2. Update Equalizer bars (Dynamic spectrum for both native FFT and loud YouTube/synthesis modes)
    let hasLiveFft = false;
    if (freqData && isPlaying) {
      for (let k = 0; k < 48; k++) {
        if (freqData[k] > 0) {
          hasLiveFft = true;
          break;
        }
      }
    }

    const numBars = this.equalizerBars.length;
    for (let i = 0; i < numBars; i++) {
      const bar = this.equalizerBars[i];
      let targetScale = 0.08;

      if (isPlaying) {
        if (hasLiveFft) {
          const freqIdx = Math.floor((i / numBars) * (freqData.length * 0.45));
          const val = (freqData[freqIdx] || 0) / 255.0;
          targetScale = Math.max(0.12, Math.pow(val, 1.2) * 3.8 + bass * 1.5);
        } else {
          // Dynamic kinetic spectrum mapped to 48 pillars around stage
          const normPos = Math.abs(i - numBars / 2) / (numBars / 2);
          const bassWave = Math.sin(time * 12 + i * 0.45) * 0.35 + 0.65;
          const bassPillar = Math.pow(bass, 1.4) * 3.5 * (1.0 - normPos * 0.3) * bassWave;

          const midWave = Math.sin(time * 16 + i * 0.75) * 0.35 + 0.65;
          const midPillar = Math.pow(mid, 1.3) * 2.6 * (0.3 + normPos * 0.7) * midWave;

          const highWave = Math.sin(time * 26 + i * 1.2) * 0.4 + 0.6;
          const highPillar = high * 1.6 * highWave;

          targetScale = Math.max(0.12, (bassPillar + midPillar + highPillar) * 1.3);
        }

        // Glow & opacity modulation during loud music
        if (bar.material) {
          const loudnessBoost = Math.min(1.0, bass * 0.8 + mid * 0.4);
          bar.material.opacity = Math.min(1.0, 0.7 + loudnessBoost * 0.3);
        }
      } else {
        // Idle gentle breathing wave
        targetScale = 0.08 + Math.sin(time * 2 + i * 0.3) * 0.03;
        if (bar.material) bar.material.opacity = 0.5;
      }

      bar.scale.y += (targetScale - bar.scale.y) * 0.35;
      bar.position.y = bar.scale.y * 0.5;
    }

    // 3. Move spotlights smoothly
    this.spotlights.forEach((spot, i) => {
      const angle = time * 0.8 + (i * Math.PI * 2 / 3);
      spot.position.x = Math.sin(angle) * 4.5;
      spot.position.z = Math.cos(angle) * 4.5;
      spot.intensity = 3.5 + bass * 4.0;
    });

    // Dancer follow spots reactive glow
    if (this.dancerSpotAni) {
      this.dancerSpotAni.intensity = 3.5 + bass * 2.5;
    }
    if (this.dancerSpotRiko) {
      this.dancerSpotRiko.intensity = 3.5 + bass * 2.5;
    }

    // 4. Slow particle drift
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] += 0.003;
        if (pos[i] > 4.5) pos[i] = 0;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
  }
}
