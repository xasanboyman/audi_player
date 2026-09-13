import * as THREE from 'three';

/**
 * GlowingRibbon.js
 * Creates a glowing, neon ribbon trail behind a 3D bone (e.g. wrist/hand).
 * Matches the glowing particle trail seen in the screencast!
 */
export class GlowingRibbon {
  constructor(targetBone, scene, options = {}) {
    this.targetBone = targetBone;
    this.scene = scene;

    this.color = options.color || new THREE.Color(1.0, 0.18, 0.55); // Neon Pink
    this.width = options.width || 0.048;
    this.maxPoints = options.maxPoints || 32; // Crisp, sleek ~0.4s comet trail
    this.lifetime = options.lifetime || 0.40; // seconds

    this.history = []; // { pos: Vector3, time: number }
    this.enabled = true;

    // Buffer geometry for dynamic strip
    // Each point produces 2 vertices (top & bottom edges of the ribbon)
    this.geometry = new THREE.BufferGeometry();
    const maxVerts = this.maxPoints * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    this.alphas = new Float32Array(maxVerts);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    // Indices for triangle strip
    const indices = [];
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      // Two triangles per segment
      indices.push(v0, v1, v2);
      indices.push(v1, v3, v2);
    }
    this.geometry.setIndex(indices);

    // Glowing additive material
    this.material = new THREE.MeshBasicMaterial({
      color: this.color,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this._worldPos = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._side = new THREE.Vector3();
  }

  setColor(hex) {
    this.color.set(hex);
    this.material.color.set(hex);
  }

  clear() {
    this.history = [];
    if (this.geometry) {
      this.geometry.setDrawRange(0, 0);
    }
  }

  update(delta, camera) {
    if (!this.enabled || !this.targetBone) {
      this.mesh.visible = false;
      return;
    }

    // Get current world position of bone
    this.targetBone.getWorldPosition(this._worldPos);

    // Suppress ribbons if bone is planted near the floor during floor freezes/spins
    if (this._worldPos.y < 0.12) {
      this.clear();
      this.mesh.visible = false;
      return;
    }

    const lastPt = this.history[0];
    if (lastPt) {
      const dist = this._worldPos.distanceTo(lastPt.pos);
      // Teleport / animation crossfade jump rejection:
      // If bone moved > 0.22m in a single frame, clear trail instead of stretching a laser beam across the scene!
      if (dist > 0.22) {
        this.clear();
      }
    }

    // Add new point only if bone has moved smoothly
    const curLast = this.history[0];
    const moved = !curLast || this._worldPos.distanceTo(curLast.pos) > 0.008;
    if (moved) {
      this.history.unshift({
        pos: this._worldPos.clone(),
        time: 0
      });
    }

    // Age existing points and remove expired
    for (let i = this.history.length - 1; i >= 0; i--) {
      this.history[i].time += delta;
      if (this.history[i].time > this.lifetime) {
        this.history.splice(i, 1);
      }
    }

    if (this.history.length > this.maxPoints) {
      this.history.length = this.maxPoints;
    }

    if (this.history.length < 2) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
    camera.getWorldPosition(this._camPos);

    // Build smooth curve points using Catmull-Rom spline interpolation
    // Eliminates sharp polygonal angles and creates silky, flowing neon ribbon curves
    let curvePoints = [];
    if (this.history.length >= 3) {
      try {
        const rawPoints = this.history.map(h => h.pos);
        const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'centripetal', 0.5);
        const sampleCount = Math.min(this.maxPoints, (this.history.length - 1) * 2 + 1);
        curvePoints = curve.getPoints(sampleCount);
      } catch (e) {
        curvePoints = this.history.map(h => h.pos);
      }
    } else {
      curvePoints = this.history.map(h => h.pos);
    }

    const n = Math.min(curvePoints.length, this.maxPoints);
    let posIdx = 0;
    let colIdx = 0;

    for (let i = 0; i < n; i++) {
      const ptPos = curvePoints[i];
      const t = i / Math.max(1, n - 1); // 0.0 at head (newest), 1.0 at tail (oldest)
      const taper = Math.max(0.04, Math.pow(1.0 - t, 1.2)); // Tapers smoothly towards tail
      const currentWidth = this.width * taper;

      // Calculate tangent along ribbon
      if (i < n - 1) {
        this._dir.subVectors(ptPos, curvePoints[i + 1]).normalize();
      } else {
        this._dir.subVectors(curvePoints[i - 1], ptPos).normalize();
      }

      // Normal to camera
      this._normal.subVectors(this._camPos, ptPos).normalize();
      this._side.crossVectors(this._dir, this._normal).normalize().multiplyScalar(currentWidth * 0.5);

      // Top vertex
      this.positions[posIdx] = ptPos.x + this._side.x;
      this.positions[posIdx + 1] = ptPos.y + this._side.y;
      this.positions[posIdx + 2] = ptPos.z + this._side.z;

      // Bottom vertex
      this.positions[posIdx + 3] = ptPos.x - this._side.x;
      this.positions[posIdx + 4] = ptPos.y - this._side.y;
      this.positions[posIdx + 5] = ptPos.z - this._side.z;

      // Luminous falloff with smooth exponential decay
      const brightness = Math.pow(1.0 - t, 1.5);
      this.colors[colIdx] = this.color.r * brightness;
      this.colors[colIdx + 1] = this.color.g * brightness;
      this.colors[colIdx + 2] = this.color.b * brightness;

      this.colors[colIdx + 3] = this.color.r * brightness;
      this.colors[colIdx + 4] = this.color.g * brightness;
      this.colors[colIdx + 5] = this.color.b * brightness;

      posIdx += 6;
      colIdx += 6;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
