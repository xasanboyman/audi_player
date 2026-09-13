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
    // 48 equalizer pillars around stage perimeter converted to a single high-performance InstancedMesh
    // Slashes 47 draw calls per frame, massively reducing laptop GPU driver overhead and power draw!
    const barCount = 48;
    this.barCount = barCount;
    this.equalizerRadius = 6.8;
    const barGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.equalizerInstancedMesh = new THREE.InstancedMesh(barGeo, barMat, barCount);
    this.equalizerInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._barDummy = new THREE.Object3D();
    this._barScales = new Float32Array(barCount);
    this._barAngles = new Float32Array(barCount);

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      this._barAngles[i] = angle;
      this._barScales[i] = 0.1;
      const hue = i / barCount;
      const col = new THREE.Color().setHSL(0.85 - hue * 0.45, 0.9, 0.6);
      this.equalizerInstancedMesh.setColorAt(i, col);

      this._barDummy.position.set(Math.sin(angle) * this.equalizerRadius, 0.05, Math.cos(angle) * this.equalizerRadius);
      this._barDummy.scale.set(1, 0.1, 1);
      this._barDummy.updateMatrix();
      this.equalizerInstancedMesh.setMatrixAt(i, this._barDummy.matrix);
    }

    if (this.equalizerInstancedMesh.instanceColor) {
      this.equalizerInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.equalizerInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.equalizerInstancedMesh);
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
    const bpm = audioEngine?.bpm || 120;
    const beatProg = (audioEngine && typeof audioEngine.getBeatProgress === 'function')
      ? audioEngine.getBeatProgress()
      : ((time % (60.0 / bpm)) / (60.0 / bpm));

    // Crisp exponential transient impulses (exact attack on beat downbeat & snare upbeat)
    const kickImpulse = Math.exp(-12.0 * beatProg);
    const snareProg = Math.abs(beatProg - 0.5);
    const snareImpulse = Math.exp(-14.0 * snareProg);

    // 1. Update Floor pulse rings with crisp beat pulse
    this.pulseRings.forEach((ring, idx) => {
      const ringPulse = Math.exp(-10.0 * ((beatProg + idx * 0.08) % 1.0));
      const scale = isPlaying ? (1.0 + bass * 0.9 + kickImpulse * 0.55) : 1.0;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = isPlaying ? Math.min(1.0, 0.35 + bass * 0.65 + ringPulse * 0.40) : 0.25;
    });

    // 2. Update Equalizer pillars (stripes) with symmetrical spectral spread and zero-lag kick response
    let hasLiveFft = false;
    if (freqData && isPlaying) {
      for (let k = 0; k < 32; k++) {
        if (freqData[k] > 0) {
          hasLiveFft = true;
          break;
        }
      }
    }

    if (this.equalizerInstancedMesh) {
      const numBars = this.barCount;
      const halfBars = (numBars - 1) * 0.5;

      for (let i = 0; i < numBars; i++) {
        let targetScale = 0.08;

        if (isPlaying) {
          // Symmetrical distance from center (0.0 at center directly behind dancers, 1.0 at outer wings)
          const normDist = Math.abs(i - halfBars) / halfBars;
          const centerWeight = Math.max(0, 1.0 - normDist * 1.25);
          const midWeight = Math.sin(normDist * Math.PI);
          const wingWeight = Math.pow(normDist, 1.4);

          if (hasLiveFft) {
            // Symmetrical frequency mapping: center = bass, flanks = mids, wings = treble
            const binIdx = Math.floor(Math.pow(normDist, 1.4) * 90 + 1);
            const val = (freqData[binIdx] || 0) / 255.0;

            // Rhythmic transients: punchy kick pulse on center pillars, snare on flanks
            const beatKick = kickImpulse * (2.2 + bass * 2.8) * (0.45 + centerWeight * 1.10);
            const beatSnare = snareImpulse * (1.6 + mid * 2.0) * midWeight;
            const freqHeight = Math.pow(val, 1.2) * 3.6;
            targetScale = Math.max(0.12, freqHeight + beatKick + beatSnare);
          } else {
            // Synthetic beat-locked kinetic spectrum for YouTube and non-analysed audio
            const beatKick = kickImpulse * (2.4 + bass * 3.0) * (0.5 + centerWeight * 1.0);
            const beatSnare = snareImpulse * (1.8 + mid * 2.2) * midWeight;
            const highPulse = Math.pow(Math.sin(beatProg * Math.PI * 2), 2.0) * high * 1.8 * wingWeight;
            targetScale = Math.max(0.12, (beatKick + beatSnare + highPulse) * 1.25);
          }
        } else {
          // Idle gentle breathing wave
          targetScale = 0.08 + Math.sin(time * 2 + i * 0.3) * 0.03;
        }

        // Asymmetric attack/decay (zero-lag peak follower):
        // On beat hits, rise INSTANTLY on that exact frame (0.92), then decay smoothly (0.20)
        if (targetScale > this._barScales[i]) {
          this._barScales[i] = THREE.MathUtils.lerp(this._barScales[i], targetScale, 0.92);
        } else {
          this._barScales[i] = THREE.MathUtils.lerp(this._barScales[i], targetScale, 0.20);
        }

        const currentScaleY = this._barScales[i];
        const angle = this._barAngles[i];

        this._barDummy.position.set(
          Math.sin(angle) * this.equalizerRadius,
          currentScaleY * 0.5,
          Math.cos(angle) * this.equalizerRadius
        );
        this._barDummy.scale.set(1, currentScaleY, 1);
        this._barDummy.updateMatrix();
        this.equalizerInstancedMesh.setMatrixAt(i, this._barDummy.matrix);
      }
      this.equalizerInstancedMesh.instanceMatrix.needsUpdate = true;
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
