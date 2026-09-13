import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GlowingRibbon } from '../vfx/GlowingRibbon.js';
import { FBXRetargeter } from './FBXRetargeter.js';

/**
 * Bidirectional mapping between Speech2Motion Japanese Kana blendshapes
 * and standard VRM English Visemes and Expression names.
 */
export const BLENDSHAPE_ALIAS_MAP = {
  // Japanese Kana -> VRM 1.0 / English Visemes
  'あ': 'aa',
  'あ２': 'aa',
  'い': 'ih',
  'い１': 'ih',
  'い２': 'ih',
  'う': 'ou',
  'え': 'ee',
  'お': 'oh',
  'ん': 'mouth_close',

  // VRM English -> Japanese Kana aliases
  'aa': 'あ',
  'ih': 'い',
  'ou': 'う',
  'ee': 'え',
  'oh': 'お',
  'mouth_close': 'ん',

  // Facial expressions & emotion morphs
  '口角上げ': 'happy',
  '口横広げ': 'ih',
  '口横狭め': 'ou',
  'にっこり': 'happy',
  'にやり': 'smile',
  'にやり２': 'smile',
  '笑い': 'laugh',
  'ω': 'cat_mouth',
  'まばたき': 'blink',
  'ウィンク': 'blinkLeft',
  'ウィンク右': 'blinkRight',
  '喜び': 'happy',
  'なごみ': 'relaxed',
  'なごみ左': 'relaxed',
  'なごみ右': 'relaxed',
  'びっくり': 'surprised',
  '照れ': 'blush',
  '怒り': 'angry',
  '困る': 'sad',
  '困る２': 'sad',
  '真面目': 'neutral'
};

/**
 * Anatomical Hand Gesture Library
 * Complete 30-bone finger configurations for idol dancing, conversational speech,
 * and acrobatic ground floor contact.
 * Format for fingers: { p: [curlZ, splayY], i: [curlZ, splayY], d: [curlZ, splayY] }
 * Format for thumb:   { p: [curlZ, splayY], d: [curlZ, splayY] }
 */
export const HAND_GESTURE_PRESETS = {
  BALLET_PORT_DE_BRAS: {
    // 🦢 Classical Ballet Port de Bras: elongated crescent index, opposed thumb, floating pinky
    index: { p: [0.10, 0.04], i: [0.16, 0], d: [-0.03, 0] },
    middle: { p: [0.22, 0.0], i: [0.32, 0], d: [0.06, 0] },
    ring: { p: [0.26, 0.03], i: [0.36, 0], d: [0.08, 0] },
    little: { p: [0.12, 0.14], i: [0.18, 0], d: [-0.04, 0] },
    thumb: { m: [0.18, 0.26], p: [0.16, 0.18], d: [0.08, 0] }
  },
  ORCHID_BLOSSOM: {
    // 🌸 Lan Hua Zhi (兰花指): delicate flower blossom, thumb & middle tips touching, arched index
    index: { p: [-0.05, 0.08], i: [-0.02, 0], d: [-0.06, 0] },
    middle: { p: [0.42, 0.0], i: [0.55, 0], d: [0.35, 0] },
    ring: { p: [0.34, 0.06], i: [0.44, 0], d: [0.22, 0] },
    little: { p: [0.22, 0.16], i: [0.28, 0], d: [0.08, 0] },
    thumb: { m: [0.28, 0.32], p: [0.32, 0.28], d: [0.22, 0] }
  },
  IDOL_TWINKLE_HEART: {
    // 🫰 K-Pop / J-Pop Finger Heart: thumb & index crossed, other fingers in soft nest
    index: { p: [0.28, -0.06], i: [0.32, 0], d: [0.10, 0] },
    middle: { p: [0.72, 0.0], i: [0.82, 0], d: [0.65, 0] },
    ring: { p: [0.76, 0.0], i: [0.84, 0], d: [0.68, 0] },
    little: { p: [0.78, 0.02], i: [0.86, 0], d: [0.70, 0] },
    thumb: { m: [0.22, 0.28], p: [0.30, 0.34], d: [0.22, 0] }
  },
  VICTORY_PEACE_CUTE: {
    // ✌️ Delicate Anime Idol V-Sign: soft crescent tips, gentle V-spread, pinky overlapping ring
    index: { p: [0.02, 0.12], i: [0.03, 0], d: [-0.02, 0] },
    middle: { p: [0.02, 0.0], i: [0.03, 0], d: [-0.02, 0] },
    ring: { p: [0.80, 0.0], i: [0.86, 0], d: [0.72, 0] },
    little: { p: [0.82, 0.02], i: [0.88, 0], d: [0.75, 0] },
    thumb: { m: [0.26, 0.22], p: [0.42, 0.28], d: [0.35, 0] }
  },
  POETIC_TOUCH_CHEST: {
    // 💖 Lyrical Chest Touch: poetic hand placed near heart, fingers in soft fan
    index: { p: [0.16, 0.04], i: [0.24, 0], d: [0.12, 0] },
    middle: { p: [0.20, 0.0], i: [0.28, 0], d: [0.15, 0] },
    ring: { p: [0.24, 0.04], i: [0.32, 0], d: [0.18, 0] },
    little: { p: [0.28, 0.08], i: [0.36, 0], d: [0.20, 0] },
    thumb: { m: [0.10, 0.18], p: [0.14, 0.22], d: [0.10, 0] }
  },
  KITSUNE_SPIRIT: {
    // 🦊 Japanese Kitsune Fox Spirit: thumb touching middle & ring, index & pinky ears
    index: { p: [-0.02, 0.08], i: [0.02, 0], d: [-0.03, 0] },
    middle: { p: [0.55, 0.0], i: [0.65, 0], d: [0.45, 0] },
    ring: { p: [0.55, 0.0], i: [0.65, 0], d: [0.45, 0] },
    little: { p: [-0.02, 0.12], i: [0.02, 0], d: [-0.03, 0] },
    thumb: { m: [0.28, 0.26], p: [0.36, 0.28], d: [0.30, 0] }
  },
  FLUTTER_BUTTERFLY: {
    // 🦋 Butterfly Wave Flutter: multi-phase undulating wave across finger joints
    index: { p: [0.08, 0.08], i: [0.12, 0], d: [0.04, 0] },
    middle: { p: [0.12, 0.02], i: [0.16, 0], d: [0.06, 0] },
    ring: { p: [0.16, 0.06], i: [0.20, 0], d: [0.08, 0] },
    little: { p: [0.20, 0.14], i: [0.24, 0], d: [0.10, 0] },
    thumb: { m: [0.06, 0.22], p: [0.08, 0.26], d: [0.06, 0] }
  },
  LYRICAL_POINT_EXTEND: {
    // 👉 Melodic Point Accent: elongated index leading rhythm, soft nested supporting fingers
    index: { p: [0.02, 0.02], i: [0.02, 0], d: [-0.02, 0] },
    middle: { p: [0.72, 0.0], i: [0.80, 0], d: [0.65, 0] },
    ring: { p: [0.76, 0.0], i: [0.84, 0], d: [0.68, 0] },
    little: { p: [0.80, 0.02], i: [0.86, 0], d: [0.72, 0] },
    thumb: { m: [0.24, 0.22], p: [0.36, 0.26], d: [0.30, 0] }
  },
  CHIC_GROOVE_SNAP: {
    // ✨ K-Pop Chic Snap: thumb & middle pressed with dynamic tension, index lifted
    index: { p: [0.12, 0.06], i: [0.14, 0], d: [0.02, 0] },
    middle: { p: [0.48, 0.0], i: [0.60, 0], d: [0.42, 0] },
    ring: { p: [0.70, 0.0], i: [0.78, 0], d: [0.62, 0] },
    little: { p: [0.74, 0.04], i: [0.82, 0], d: [0.66, 0] },
    thumb: { m: [0.26, 0.28], p: [0.38, 0.32], d: [0.28, 0] }
  },
  EXPRESSIVE_SPEECH_BLOOM: {
    // 🗣️ Conversational Vocal Bloom: presents outward, breathes & splays with voice energy
    index: { p: [0.06, 0.08], i: [0.10, 0], d: [0.04, 0] },
    middle: { p: [0.10, 0.02], i: [0.14, 0], d: [0.06, 0] },
    ring: { p: [0.15, 0.06], i: [0.18, 0], d: [0.08, 0] },
    little: { p: [0.20, 0.14], i: [0.24, 0], d: [0.12, 0] },
    thumb: { m: [0.04, 0.20], p: [0.06, 0.24], d: [0.06, 0] }
  },
  ELEGANT_SWEEP_REACH: {
    // 🌊 Sinuous Sweep & Reach: inviting reach with flared pinky and flowing air drag
    index: { p: [0.08, 0.08], i: [0.12, 0], d: [0.04, 0] },
    middle: { p: [0.12, 0.02], i: [0.16, 0], d: [0.06, 0] },
    ring: { p: [0.18, 0.06], i: [0.22, 0], d: [0.10, 0] },
    little: { p: [0.14, 0.16], i: [0.18, 0], d: [-0.02, 0] },
    thumb: { m: [0.08, 0.24], p: [0.10, 0.26], d: [0.08, 0] }
  },
  GROUND_FLOOR_FLAT: {
    // 🤸 Ground Floor Contact: flat splayed palm for physical support
    index: { p: [0.0, 0.10], i: [0.0, 0], d: [0.0, 0] },
    middle: { p: [0.0, 0.0], i: [0.0, 0], d: [0.0, 0] },
    ring: { p: [0.0, 0.08], i: [0.0, 0], d: [0.0, 0] },
    little: { p: [0.0, 0.16], i: [0.0, 0], d: [0.0, 0] },
    thumb: { m: [0.02, 0.35], p: [0.04, 0.38], d: [0.02, 0] }
  }
};

/**
 * Dancer.js
 * Controls a 3D VRM character, handles bone retargeting, facial morphs,
 * spring physics, and glowing wrist ribbon trails.
 */
export class Dancer {
  constructor(name, scene, options = {}) {
    this.name = name;
    this.scene = scene;
    this.options = options;

    this.vrm = null;
    this.isLoaded = false;
    this.basePosition = options.position || new THREE.Vector3(0, 0, 0);
    this.baseRotationY = options.rotationY || 0;

    this.ribbonColor = options.ribbonColor || new THREE.Color(1.0, 0.18, 0.55);
    this.leftRibbon = null;
    this.rightRibbon = null;

    this.boneMap = new Map();
    this.initialHipsY = 1.0;
    this.morphTargetMeshes = []; // { mesh, dict }

    // Dynamic hand gesture controller state
    this.gestureStateLeft = 'IDLE_GRACEFUL';
    this.gestureStateRight = 'IDLE_GRACEFUL';
    this.gestureTimer = 0;
    this.gestureCycleDuration = 3.2;
    this.handPulseTime = 0;
    this.currentSpeechContext = null;
    this._isLeftHandFloorContact = false;
    this._isRightHandFloorContact = false;

    this.mixer = null;
    this.currentMode = 'procedural';
    this.fbxRetargeter = new FBXRetargeter();

    this.loader = new GLTFLoader();
    this.loader.register(parser => new VRMLoaderPlugin(parser));
  }

  async load(vrmUrl) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        vrmUrl,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) {
            reject(new Error(`Failed to extract VRM from ${vrmUrl}`));
            return;
          }

          // Optimize VRM
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);

          this.vrm = vrm;
          this.scene.add(vrm.scene);

          // Position character
          vrm.scene.position.copy(this.basePosition);
          vrm.scene.rotation.y = this.baseRotationY;

          // Map humanoid bones
          this.mapHumanoidBones();

          // Initialize glowing hand ribbons
          this.setupGlowRibbons();

          // Cache morph targets across model meshes for direct Japanese & ARKit blendshape driving
          this.morphTargetMeshes = [];
          vrm.scene.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetDictionary) {
              this.morphTargetMeshes.push({
                mesh: obj,
                dict: obj.morphTargetDictionary
              });
            }
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          this.isLoaded = true;
          console.log(`Dancer [${this.name}] loaded successfully with ${this.morphTargetMeshes.length} morph-capable meshes`);
          resolve(this);
        },
        (progress) => {
          // Loading progress
        },
        (error) => {
          console.error(`Error loading VRM [${this.name}]:`, error);
          reject(error);
        }
      );
    });
  }

  mapHumanoidBones() {
    if (!this.vrm || !this.vrm.humanoid) return;
    const humanoid = this.vrm.humanoid;
    this.boneMap = new Map();
    this.restPositions = new Map();

    // Standard VRM Humanoid bones
    const boneKeys = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'
    ];

    for (const key of boneKeys) {
      const boneNode = humanoid.getNormalizedBoneNode(key);
      if (boneNode) {
        this.boneMap.set(key, boneNode);
        this.restPositions.set(key, boneNode.position.clone());
      }
    }

    // Map all 30 human finger bones for graceful idol hands
    const fingerKeys = [
      'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
      'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
      'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
      'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
      'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
      'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
      'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
      'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
      'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
      'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal'
    ];
    this.fingerBones = new Map();
    for (const key of fingerKeys) {
      const boneNode = humanoid.getNormalizedBoneNode(key);
      if (boneNode) {
        this.fingerBones.set(key, boneNode);
      }
    }

    const hipsNode = this.boneMap.get('hips');
    if (hipsNode) {
      this.initialHipsY = hipsNode.position.y;
    }
  }

  setupGlowRibbons() {
    const leftHand = this.boneMap.get('leftHand') || this.boneMap.get('leftLowerArm');
    const rightHand = this.boneMap.get('rightHand') || this.boneMap.get('rightLowerArm');

    if (leftHand) {
      this.leftRibbon = new GlowingRibbon(leftHand, this.scene, {
        color: this.ribbonColor,
        width: 0.05
      });
    }

    if (rightHand) {
      this.rightRibbon = new GlowingRibbon(rightHand, this.scene, {
        color: this.ribbonColor,
        width: 0.05
      });
    }
  }

  setRibbonsEnabled(enabled) {
    if (this.leftRibbon) this.leftRibbon.enabled = enabled;
    if (this.rightRibbon) this.rightRibbon.enabled = enabled;
  }

  setRibbonColor(hex) {
    if (this.leftRibbon) this.leftRibbon.setColor(hex);
    if (this.rightRibbon) this.rightRibbon.setColor(hex);
  }

  setVisible(visible) {
    if (this.vrm && this.vrm.scene) {
      this.vrm.scene.visible = visible;
    }
    if (this.leftRibbon) this.leftRibbon.mesh.visible = visible;
    if (this.rightRibbon) this.rightRibbon.mesh.visible = visible;
  }

  applyPose(poseData) {
    if (!this.isLoaded || !this.vrm) return;

    const { bones, transl, expressions, speechContext } = poseData;
    this.currentSpeechContext = speechContext;

    // 1. Apply procedural skeletal poses if in procedural mode
    if (this.currentMode === 'procedural') {
      if (bones) {
        for (const [boneName, quat] of Object.entries(bones)) {
          const boneNode = this.boneMap.get(boneName);
          if (boneNode) {
            boneNode.quaternion.copy(quat);
          }
        }
      }

      const hipsNode = this.boneMap.get('hips');
      if (hipsNode && transl) {
        hipsNode.position.x = transl.x;
        hipsNode.position.y = this.initialHipsY + transl.y;
        hipsNode.position.z = transl.z;
      }
    }

    // 2. Apply Expressions, Speech2Motion blendshapes & Lip Sync (both VRM expressionManager and mesh morph targets)
    if (expressions) {
      const em = this.vrm.expressionManager;
      const isRiko = (this.name === 'Riko');

      for (const [exprName, rawVal] of Object.entries(expressions)) {
        if (typeof rawVal !== 'number' || isNaN(rawVal)) continue;

        // Never trigger Fcl_ALL_Joy / happy on Riko to prevent squinted derpy face
        if (isRiko && (exprName === 'happy' || exprName === 'にっこり' || exprName === '喜び')) {
          continue;
        }

        let val = Math.max(0, Math.min(1.0, rawVal));
        // Cap singing jaw opening to natural range (max 0.52) so dancers never look like gaping fish
        if (exprName === 'aa' || exprName === 'あ' || exprName === 'oh' || exprName === 'お') {
          val = Math.min(0.52, val);
        }

        // 1. Set on VRM ExpressionManager
        if (em) {
          try { em.setValue(exprName, val); } catch (_) {}
          const alias = BLENDSHAPE_ALIAS_MAP[exprName];
          if (alias) {
            // Also protect Riko from alias
            if (!(isRiko && alias === 'happy')) {
              try { em.setValue(alias, val); } catch (_) {}
            }
          }
        }

        // 2. Set on Mesh Morph Targets directly
        for (let m = 0; m < this.morphTargetMeshes.length; m++) {
          const item = this.morphTargetMeshes[m];
          let idx = item.dict[exprName];
          if (idx === undefined && BLENDSHAPE_ALIAS_MAP[exprName]) {
            idx = item.dict[BLENDSHAPE_ALIAS_MAP[exprName]];
          }
          if (idx !== undefined && item.mesh.morphTargetInfluences) {
            item.mesh.morphTargetInfluences[idx] = val;
          }
        }
      }

      if (em) {
        em.update();
      }
    }
  }

  setHandGesture(side, gestureName) {
    if (gestureName === 'auto') {
      this.manualGestureOverride = false;
      this.manualGestureTimer = 0;
      return;
    }
    if (side === 'left' || side === 'both') this.gestureStateLeft = gestureName;
    if (side === 'right' || side === 'both') this.gestureStateRight = gestureName;
    this.manualGestureOverride = true;
    this.manualGestureTimer = 999999; // Stays active until user changes or selects auto
  }

  /**
   * Anatomical Multi-Gesture Hand Engine:
   * Dynamically generates expressive, buttery-smooth finger animations across all 30 hand joints:
   * 1. Speech2Motion conversational open-palm gesturing with vocal vowel blooming & cadence
   * 2. Iconic idol poses: K-Pop Finger Heart, Peace / Victory Sign, Anime Cat Paws, Rock Horns, Chic Fist, Thumbs Up
   * 3. Splayed flat palm floor support for physical contact during freezes & handstands
   * 4. Rhythmic beat-pulse micro-breathing & lyrical sinusoidal cascade waves across fingers
   * 5. Full 3-segment thumb articulation (Metacarpal, Proximal, Distal)
   * 6. Continuous spherical linear interpolation (slerp) eliminating all popping (60fps silky smooth)
   */
  applyGracefulHandGestures(delta) {
    if (!this.vrm || !this.vrm.humanoid || !this.fingerBones) return;

    // 1. Natural wrist angle limiter (prevents backward claw hyperextension seen in raw FBX)
    const leftWrist = this.boneMap.get('leftHand');
    const rightWrist = this.boneMap.get('rightHand');
    if (leftWrist) {
      if (leftWrist.quaternion.z < -0.32) {
        leftWrist.quaternion.z = THREE.MathUtils.lerp(leftWrist.quaternion.z, -0.16, 0.25);
        leftWrist.quaternion.normalize();
      }
    }
    if (rightWrist) {
      if (rightWrist.quaternion.z > 0.32) {
        rightWrist.quaternion.z = THREE.MathUtils.lerp(rightWrist.quaternion.z, 0.16, 0.25);
        rightWrist.quaternion.normalize();
      }
    }

    // 2. Autonomous Context & State Transition Coordinator
    this.gestureTimer += delta;
    this.handPulseTime += delta * 3.2;

    const isLeftSupporting = (this._isLeftHandFloorContact === true);
    const isRightSupporting = (this._isRightHandFloorContact === true);
    const speechCtx = this.currentSpeechContext;
    const isSpeaking = speechCtx?.isSpeaking;
    const vocalEnergy = speechCtx?.vocalEnergy || 0.0;
    const isSpeechClipActive = speechCtx?.isSpeechClipActive;

    // Floor Contact has highest physical priority
    if (isLeftSupporting) {
      this.gestureStateLeft = 'GROUND_FLOOR_FLAT';
    }
    if (isRightSupporting) {
      this.gestureStateRight = 'GROUND_FLOOR_FLAT';
    }

    if (this.manualGestureTimer > 0 && this.manualGestureTimer < 900000) {
      this.manualGestureTimer -= delta;
      if (this.manualGestureTimer <= 0) {
        this.manualGestureOverride = false;
      }
    }

    // Dynamic gesture transitions over musical phrases when not locked to floor and not in manual override
    if (!isLeftSupporting && !isRightSupporting && !this.manualGestureOverride) {
      if (isSpeaking || isSpeechClipActive || vocalEnergy > 0.08) {
        // Conversational speech mode: dynamic speech flow with vocal cadence
        if (this.gestureTimer > this.gestureCycleDuration) {
          this.gestureTimer = 0;
          this.gestureCycleDuration = 2.2 + Math.random() * 2.0;

          const speechPoolLeft = ['EXPRESSIVE_SPEECH_BLOOM', 'ELEGANT_SWEEP_REACH', 'POETIC_TOUCH_CHEST', 'BALLET_PORT_DE_BRAS', 'ORCHID_BLOSSOM'];
          const speechPoolRight = ['EXPRESSIVE_SPEECH_BLOOM', 'LYRICAL_POINT_EXTEND', 'POETIC_TOUCH_CHEST', 'BALLET_PORT_DE_BRAS', 'FLUTTER_BUTTERFLY'];

          this.gestureStateLeft = speechPoolLeft[Math.floor(Math.random() * speechPoolLeft.length)];
          this.gestureStateRight = speechPoolRight[Math.floor(Math.random() * speechPoolRight.length)];
        }

        // When arms are raised high during speech/singing, trigger lively idol accents
        if (leftWrist && leftWrist.position.y > 0.35) {
          this.gestureStateLeft = (this.name === 'Ani') ? 'ORCHID_BLOSSOM' : 'VICTORY_PEACE_CUTE';
        }
        if (rightWrist && rightWrist.position.y > 0.35) {
          this.gestureStateRight = (this.name === 'Ani') ? 'IDOL_TWINKLE_HEART' : 'LYRICAL_POINT_EXTEND';
        }
      } else if (this.gestureTimer > this.gestureCycleDuration) {
        this.gestureTimer = 0;
        this.gestureCycleDuration = 2.5 + Math.random() * 2.2;

        // Delicate dance & idol gesture repertoire
        const aniGestures = [
          'BALLET_PORT_DE_BRAS', 'ORCHID_BLOSSOM', 'IDOL_TWINKLE_HEART',
          'VICTORY_PEACE_CUTE', 'FLUTTER_BUTTERFLY', 'KITSUNE_SPIRIT', 'ELEGANT_SWEEP_REACH'
        ];
        const rikoGestures = [
          'BALLET_PORT_DE_BRAS', 'POETIC_TOUCH_CHEST', 'CHIC_GROOVE_SNAP',
          'LYRICAL_POINT_EXTEND', 'ORCHID_BLOSSOM', 'VICTORY_PEACE_CUTE', 'ELEGANT_SWEEP_REACH'
        ];

        const poolLeft = (this.name === 'Ani') ? aniGestures : rikoGestures;
        const poolRight = (this.name === 'Ani') ? aniGestures : rikoGestures;

        this.gestureStateLeft = poolLeft[Math.floor(Math.random() * poolLeft.length)];
        this.gestureStateRight = poolRight[Math.floor(Math.random() * poolRight.length)];
      }
    }

    // 3. Compute Target Quaternions and smoothly slerp every finger bone
    if (!this._handTargetQ) this._handTargetQ = new THREE.Quaternion();
    if (!this._handZAxis) this._handZAxis = new THREE.Vector3(0, 0, 1);
    if (!this._handYAxis) this._handYAxis = new THREE.Vector3(0, 1, 0);

    const _targetQ = this._handTargetQ;
    const _zAxis = this._handZAxis;
    const _yAxis = this._handYAxis;

    const applyFingerPhalanx = (boneNode, curlZ, splayOutward, fingerSide, isRight, pulseOffset = 0) => {
      if (!boneNode) return;
      const signZ = isRight ? 1.0 : -1.0;
      const handSign = isRight ? -1.0 : 1.0;
      const totalCurl = curlZ + pulseOffset;

      // Primary palmar flexion / extension
      _targetQ.setFromAxisAngle(_zAxis, totalCurl * signZ);

      // Anatomical splay outward away from middle finger
      // fingerSide: Index: -1.0 (towards thumb side), Middle: 0.0, Ring/Little: +1.0 (towards pinky side)
      const effectiveSplay = splayOutward * fingerSide * handSign;
      if (Math.abs(effectiveSplay) > 1e-4) {
        const qY = new THREE.Quaternion().setFromAxisAngle(_yAxis, effectiveSplay);
        _targetQ.multiply(qY);
      }
      // Continuous spherical linear interpolation: silky-smooth 60fps transitions
      boneNode.quaternion.slerp(_targetQ, Math.min(1.0, delta * 14.0));
    };

    const applyThumbPhalanx = (boneNode, curlZ, oppositionY, isRight, pulseOffset = 0) => {
      if (!boneNode) return;
      const signZ = isRight ? 1.0 : -1.0;
      const handSign = isRight ? -1.0 : 1.0;
      const totalCurl = curlZ + pulseOffset;

      _targetQ.setFromAxisAngle(_zAxis, totalCurl * signZ);
      // Opposition across palm toward middle finger
      const effectiveOpp = oppositionY * handSign;
      if (Math.abs(effectiveOpp) > 1e-4) {
        const qY = new THREE.Quaternion().setFromAxisAngle(_yAxis, effectiveOpp);
        _targetQ.multiply(qY);
      }
      boneNode.quaternion.slerp(_targetQ, Math.min(1.0, delta * 14.0));
    };

    const applyWristBalletAesthetics = (wristNode, gestureKey, isRight) => {
      if (!wristNode) return;
      const handSign = isRight ? -1.0 : 1.0;
      let targetFlexZ = 0.0;
      let targetSupY = 0.0;

      if (gestureKey === 'BALLET_PORT_DE_BRAS') {
        targetFlexZ = -0.09 * handSign;
        targetSupY = 0.14 * handSign;
      } else if (gestureKey === 'ORCHID_BLOSSOM') {
        targetFlexZ = -0.12 * handSign;
        targetSupY = 0.16 * handSign;
      } else if (gestureKey === 'POETIC_TOUCH_CHEST') {
        targetFlexZ = -0.14 * handSign;
        targetSupY = 0.20 * handSign;
      } else if (gestureKey === 'FLUTTER_BUTTERFLY' || gestureKey === 'ELEGANT_SWEEP_REACH') {
        const wave = Math.sin(this.handPulseTime * 3.2) * 0.06;
        targetFlexZ = (-0.07 + wave) * handSign;
        targetSupY = 0.10 * handSign;
      }

      if (Math.abs(targetFlexZ) > 1e-4 || Math.abs(targetSupY) > 1e-4) {
        if (!this._wristOffsetQ) this._wristOffsetQ = new THREE.Quaternion();
        this._wristOffsetQ.setFromEuler(new THREE.Euler(-0.04, targetSupY, targetFlexZ, 'YXZ'));
        wristNode.quaternion.slerp(wristNode.quaternion.clone().multiply(this._wristOffsetQ), Math.min(1.0, delta * 6.0));
      }
    };

    const applyHandSide = (sideName, gestureKey, isRight) => {
      const preset = HAND_GESTURE_PRESETS[gestureKey] || HAND_GESTURE_PRESETS.BALLET_PORT_DE_BRAS;
      const isSpeech = (gestureKey === 'EXPRESSIVE_SPEECH_BLOOM');
      const vocalBloom = isSpeech ? Math.min(0.20, vocalEnergy * 0.25) : 0;
      const pulse = Math.sin(this.handPulseTime) * 0.02;

      const fingers = [
        { name: 'Index', data: preset.index, side: -1.0, phase: 0.0 },
        { name: 'Middle', data: preset.middle, side: 0.0, phase: 0.45 },
        { name: 'Ring', data: preset.ring, side: 1.0, phase: 0.90 },
        { name: 'Little', data: preset.little, side: 1.0, phase: 1.35 }
      ];

      for (const f of fingers) {
        const pNode = this.fingerBones.get(sideName + f.name + 'Proximal');
        const iNode = this.fingerBones.get(sideName + f.name + 'Intermediate');
        const dNode = this.fingerBones.get(sideName + f.name + 'Distal');

        let waveOffset = pulse;
        if (gestureKey === 'FLUTTER_BUTTERFLY') {
          waveOffset = Math.sin(this.handPulseTime * 4.0 - f.phase * 1.5) * 0.08;
        } else if (gestureKey === 'BALLET_PORT_DE_BRAS' || gestureKey === 'ORCHID_BLOSSOM') {
          waveOffset = Math.sin(this.handPulseTime * 2.2 - f.phase * 1.1) * 0.035;
        } else if (isSpeech) {
          waveOffset = Math.sin(this.handPulseTime * 2.8 - f.phase * 0.8) * 0.03 + (isSpeaking ? vocalEnergy * 0.05 : 0);
        }

        applyFingerPhalanx(pNode, f.data.p[0], f.data.p[1] + vocalBloom, f.side, isRight, waveOffset * 0.7);
        applyFingerPhalanx(iNode, f.data.i[0], f.data.i[1], 0, isRight, waveOffset * 1.1);
        applyFingerPhalanx(dNode, f.data.d[0], f.data.d[1], 0, isRight, waveOffset * 0.9);
      }

      // Thumb: complete 3-segment anatomical opposition & flexion (Metacarpal, Proximal, Distal)
      const tMNode = this.fingerBones.get(sideName + 'ThumbMetacarpal');
      const tPNode = this.fingerBones.get(sideName + 'ThumbProximal');
      const tDNode = this.fingerBones.get(sideName + 'ThumbDistal');

      if (tMNode && preset.thumb.m) {
        applyThumbPhalanx(tMNode, preset.thumb.m[0], preset.thumb.m[1] + vocalBloom * 0.6, isRight, pulse * 0.3);
      }
      applyThumbPhalanx(tPNode, preset.thumb.p[0], preset.thumb.p[1] + vocalBloom * 0.8, isRight, pulse * 0.4);
      applyThumbPhalanx(tDNode, preset.thumb.d[0], preset.thumb.d[1], isRight, pulse * 0.4);

      // Coordinate supple ballet wrist line
      const wristNode = this.boneMap.get(sideName + 'Hand');
      applyWristBalletAesthetics(wristNode, gestureKey, isRight);
    };

    applyHandSide('left', this.gestureStateLeft, false);
    applyHandSide('right', this.gestureStateRight, true);
  }

  crossfadeToClip(clip, fadeDuration = 0.75, timeScale = 1.0) {
    if (!this.isLoaded || !this.vrm) return;
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    }
    const newAction = this.mixer.clipAction(clip);
    if (this.currentAction === newAction && newAction.isRunning()) {
      newAction.setEffectiveTimeScale(timeScale);
      return;
    }

    newAction.setLoop(THREE.LoopPingPong, Infinity);
    newAction.clampWhenFinished = false;

    const prevAction = this.currentAction;

    // Immediately stop and uncache any orphan/stale actions in the mixer
    if (this.mixer._actions) {
      const allActions = [...this.mixer._actions];
      for (const act of allActions) {
        if (act !== newAction && act !== prevAction) {
          act.stop();
          act.setEffectiveWeight(0);
          try {
            this.mixer.uncacheAction(act.getClip());
          } catch (e) {}
        }
      }
    }

    // Gracefully fade out previous action and uncache it once faded
    if (prevAction && prevAction.isRunning()) {
      prevAction.fadeOut(fadeDuration);
      const clipToUncache = prevAction.getClip();
      setTimeout(() => {
        if (prevAction !== this.currentAction) {
          prevAction.stop();
          prevAction.setEffectiveWeight(0);
          try {
            this.mixer?.uncacheAction(clipToUncache);
          } catch (e) {}
        }
      }, Math.ceil(fadeDuration * 1000) + 60);
    }

    newAction.reset();
    newAction.setEffectiveTimeScale(timeScale);
    newAction.setEffectiveWeight(1.0);
    if (prevAction && prevAction.isRunning()) {
      newAction.fadeIn(fadeDuration);
    }
    newAction.play();

    this.currentAction = newAction;
    this.currentMode = 'fbx';
    this.isCuratedClip = false;
  }

  async playRetargeted(url, fadeDuration = 0.85, timeScale = 1.0) {
    if (!this.isLoaded || !this.vrm) return;
    try {
      const clip = await this.fbxRetargeter.loadRetargetedJsonClip(url, this.vrm);
      this.crossfadeToClip(clip, fadeDuration, timeScale);
      console.log(`Dancer [${this.name}] playing retargeted dance: ${clip.name}`);
      return clip;
    } catch (e) {
      console.error(`Failed to play retargeted clip on [${this.name}]:`, e);
    }
  }

  async playFBX(url, fadeDuration = 0.85, timeScale = 1.0) {
    if (!this.isLoaded || !this.vrm) return;
    try {
      const clip = await this.fbxRetargeter.loadFBXClip(url, this.vrm);
      this.crossfadeToClip(clip, fadeDuration, timeScale);
      console.log(`Dancer [${this.name}] playing FBX clip: ${clip.name}`);
      return clip;
    } catch (e) {
      console.error(`Failed to play FBX on dancer [${this.name}]:`, e);
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    if (mode === 'procedural' && this.mixer) {
      this.mixer.stopAllAction();
      this.currentAction = null;
    }
  }

  /**
   * Anatomical Joint Safety Guard
   * Guarantees bones never break, invert, or dislocate under any animation or crossfade:
   * 1. Hips translation boundary (prevents falling through stage floor or flying off)
   * 2. Non-hip bone positions locked to native rest offsets (prevents joint dislocations)
   * 3. NaN / degenerate quaternion protection (prevents mesh explosion)
   * Authentic mocap bone rotations play naturally without artificial joint lockups.
   */
  enforceAnatomicalJointLimits() {
    if (!this.vrm || !this.vrm.humanoid) return;

    // 1. Sanitize Hips Position & Floor Boundary
    const hips = this.boneMap.get('hips');
    if (hips) {
      if (isNaN(hips.position.x) || isNaN(hips.position.y) || isNaN(hips.position.z)) {
        hips.position.set(0, this.initialHipsY || 1.0, 0);
      } else {
        // Prevent character sinking below stage floor
        hips.position.y = Math.max(0.15, Math.min(2.2, hips.position.y));
        // Keep character on visible stage area
        hips.position.x = Math.max(-2.5, Math.min(2.5, hips.position.x));
        hips.position.z = Math.max(-2.5, Math.min(2.5, hips.position.z));
      }
    }

    // 2. Prevent Joint Dislocation: Ensure non-hip bones maintain their native rest offsets
    for (const [key, bone] of this.boneMap.entries()) {
      if (key === 'hips') continue;
      const restPos = this.restPositions.get(key);
      if (restPos && bone.position.distanceToSquared(restPos) > 1e-4) {
        bone.position.copy(restPos);
      }
    }

    // 3. Sanitize Quaternions (guards against NaNs or collapsed orientations)
    const checkAndFixQuat = (bone) => {
      if (!bone) return;
      const q = bone.quaternion;
      if (isNaN(q.x) || isNaN(q.y) || isNaN(q.z) || isNaN(q.w) || q.lengthSq() < 1e-5) {
        q.set(0, 0, 0, 1);
      } else {
        q.normalize();
      }
    };

    for (const bone of this.boneMap.values()) {
      checkAndFixQuat(bone);
    }
    for (const bone of this.fingerBones.values()) {
      checkAndFixQuat(bone);
    }
  }

  /**
   * Applies music-synchronized dynamic beat groove, vertical bounce, lateral sway, and head nod.
   */
  applyBeatGroove(groove) {
    if (!this.isLoaded || !this.vrm || !groove) return;

    // 1. Vertical bounce & lateral rhythm sway on hips
    const hips = this.boneMap.get('hips');
    if (hips) {
      hips.position.y -= groove.bounceY || 0;
      const side = (this.name === 'Riko') ? -1.0 : 1.0;
      hips.position.x += (groove.swayX || 0) * side;
    }

    // 2. Head nod & rhythmic tilt
    const head = this.boneMap.get('head');
    if (head && groove.headNod) {
      head.quaternion.x = THREE.MathUtils.lerp(head.quaternion.x, head.quaternion.x + groove.headNod * 0.4, 0.25);
      head.quaternion.normalize();
    }
  }

  /**
   * Ground Contact Floor Snapping & Anti-Hovering IK:
   * Dynamically tracks supporting contact points (palms, head, shoe soles, toes)
   * to ensure that floor freezes, handstands, and ground drops make clean, physical contact
   * with the stage floor (Y = 0) without floating in mid-air or sinking through the ground.
   */
  applyGroundFloorContact(delta) {
    if (!this.vrm || !this.vrm.humanoid || !this.boneMap) return;
    const hips = this.boneMap.get('hips');
    if (!hips) return;

    if (!this._tempVecContact) {
      this._tempVecContact = new THREE.Vector3();
    }
    const wp = this._tempVecContact;

    // Contact joint candidates
    const leftHand = this.boneMap.get('leftHand');
    const rightHand = this.boneMap.get('rightHand');
    const head = this.boneMap.get('head');
    const leftFoot = this.boneMap.get('leftFoot');
    const rightFoot = this.boneMap.get('rightFoot');
    const leftToes = this.boneMap.get('leftToes');
    const rightToes = this.boneMap.get('rightToes');

    // Force world matrix update so bone world positions reflect current mixer frame
    this.vrm.scene.updateMatrixWorld(true);

    const getBoneY = (bone) => {
      if (!bone) return 999.0;
      bone.getWorldPosition(wp);
      return wp.y;
    };

    const lhY = getBoneY(leftHand);
    const rhY = getBoneY(rightHand);
    const headY = getBoneY(head);
    const lfY = getBoneY(leftFoot);
    const rfY = getBoneY(rightFoot);
    const ltY = getBoneY(leftToes);
    const rtY = getBoneY(rightToes);
    const hipsY = getBoneY(hips);

    // Anatomical offsets:
    // Wrist joint to palm surface contact (~0.055m)
    const PALM_OFFSET = 0.055;
    // Ankle joint to shoe sole contact (~0.065m)
    const SOLE_OFFSET = 0.065;

    // Detect genuine inverted / floor freeze (head significantly lower than hips, or deep ground handstand freeze)
    const isInvertedFreeze = (headY < hipsY - 0.15) || (hipsY < 0.35 && Math.min(lhY, rhY) < Math.min(lfY, rfY));
    let neededCorrection = 0.0;

    if (isInvertedFreeze) {
      // In handstands and floor freezes, hands or head form the ground contact
      const effectiveLh = lhY - PALM_OFFSET;
      const effectiveRh = rhY - PALM_OFFSET;
      const effectiveHead = headY - 0.04;
      const minUpper = Math.min(effectiveLh, effectiveRh, effectiveHead);

      this._isLeftHandFloorContact = (effectiveLh < 0.16);
      this._isRightHandFloorContact = (effectiveRh < 0.16);

      // Snap the lowest supporting upper body joint to stage floor Y = 0
      if (minUpper < 0.38 && minUpper > -0.28) {
        neededCorrection = -minUpper;
      }
    } else {
      this._isLeftHandFloorContact = false;
      this._isRightHandFloorContact = false;
      // Standing / dancing mode: feet are the primary ground support
      const effectiveLf = Math.min(lfY, ltY) - SOLE_OFFSET;
      const effectiveRf = Math.min(rfY, rtY) - SOLE_OFFSET;
      const minFoot = Math.min(effectiveLf, effectiveRf);

      // Prevent feet sinking below stage floor
      if (minFoot < 0.0) {
        neededCorrection = -minFoot;
      } else if (minFoot > 0.01 && minFoot < 0.10 && hipsY < 1.15) {
        // Subtle anti-hover correction for grounded dance steps
        neededCorrection = -minFoot * 0.4;
      }
    }

    // Apply continuous smooth damping to eliminate any sudden popping
    this._currentGroundCorrection = THREE.MathUtils.lerp(
      this._currentGroundCorrection || 0.0,
      neededCorrection,
      Math.min(1.0, delta * 16.0)
    );

    hips.position.y += this._currentGroundCorrection;
    hips.position.y = Math.max(0.04, Math.min(2.2, hips.position.y));
  }

  update(delta, camera) {
    if (!this.isLoaded || !this.vrm) return;

    // Update FBX mixer if in FBX mode
    if (this.currentMode === 'fbx' && this.mixer) {
      this.mixer.update(delta);
    }

    // Enforce anatomical joint limits (prevents bone breaking, dislocations, and hyperextension)
    this.enforceAnatomicalJointLimits();

    // Ground Contact Floor Snapping & Anti-Hovering IK
    this.applyGroundFloorContact(delta);

    // Apply graceful hand gestures and finger articulation
    this.applyGracefulHandGestures(delta);

    // Update VRM spring bones (hair and cloth physics)
    this.vrm.update(delta);

    // Update glowing hand ribbons
    if (this.leftRibbon) this.leftRibbon.update(delta, camera);
    if (this.rightRibbon) this.rightRibbon.update(delta, camera);
  }

  dispose() {
    if (this.leftRibbon) this.leftRibbon.dispose();
    if (this.rightRibbon) this.rightRibbon.dispose();
    if (this.mixer) this.mixer.stopAllAction();
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.scene.remove(this.vrm.scene);
    }
  }
}
