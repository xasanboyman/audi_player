import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mixamoVRMRigMap } from './mixamoVRMRigMap.js';

/**
 * FBXRetargeter.js
 * Retargets Mixamo FBX skeletal animations directly to Three.js VRM normalized humanoid bones
 * using world-space rest-pose inverse transforms.
 */
export class FBXRetargeter {
  constructor() {
    this.loader = new FBXLoader();
  }

  async loadFBXClip(url, vrm) {
    const asset = await this.loader.loadAsync(url);
    if (!asset.animations || asset.animations.length === 0) {
      throw new Error(`No animations found in ${url}`);
    }

    const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') || asset.animations[0];
    const tracks = [];

    const restRotationInverse = new THREE.Quaternion();
    const parentRestWorldRotation = new THREE.Quaternion();
    const _quatA = new THREE.Quaternion();

    // Adjust with reference to hips height
    const motionHipsNode = asset.getObjectByName('mixamorigHips') 
      || asset.getObjectByName('mixamorig:Hips') 
      || asset.getObjectByName('Hips');
    const motionHipsHeight = motionHipsNode ? motionHipsNode.position.y : 100.0;
    const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] || 1.0;
    const hipsPositionScale = Math.abs(motionHipsHeight) > 1e-4 ? (vrmHipsHeight / motionHipsHeight) : 0.01;

    clip.tracks.forEach((track) => {
      const trackParts = track.name.split('.');
      const rawRigName = trackParts[0];
      const propertyName = trackParts[1];

      // Normalize rig name to match mixamoVRMRigMap
      let cleanRigName = rawRigName;
      if (cleanRigName.includes(':')) cleanRigName = cleanRigName.split(':').pop();
      if (cleanRigName.includes('|')) cleanRigName = cleanRigName.split('|').pop();
      cleanRigName = cleanRigName.replace(/^mixamorig_?/i, '');

      const mapKey = 'mixamorig' + cleanRigName;
      const vrmBoneName = mixamoVRMRigMap[mapKey] || mixamoVRMRigMap[rawRigName] || mixamoVRMRigMap[cleanRigName];
      if (!vrmBoneName) return;

      const targetBoneNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
      if (!targetBoneNode) return;

      const vrmNodeName = targetBoneNode.name;
      const mixamoRigNode = asset.getObjectByName(rawRigName) || asset.getObjectByName(cleanRigName) || asset.getObjectByName(mapKey);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const clonedValues = new Float32Array(track.values);

        if (mixamoRigNode) {
          mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
          if (mixamoRigNode.parent) {
            mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);
          } else {
            parentRestWorldRotation.identity();
          }

          for (let i = 0; i < clonedValues.length; i += 4) {
            _quatA.fromArray(clonedValues, i);
            _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
            _quatA.toArray(clonedValues, i);
          }
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            clonedValues
          )
        );
      } else if (track instanceof THREE.VectorKeyframeTrack && vrmBoneName === 'hips') {
        const scaledValues = new Float32Array(track.values.length);
        const initX = track.values[0] || 0;
        const initZ = track.values[2] || 0;
        const lateralScale = hipsPositionScale * 0.45;
        for (let i = 0; i < track.values.length; i += 3) {
          // Centered lateral movement (X, Z) scaled to keep character within stage spotlight
          scaledValues[i] = (track.values[i] - initX) * lateralScale;
          // Scale vertical position directly relative to floor (Y=0) using hipsPositionScale
          // Preserves mocap floor contact without artificial height offsets
          scaledValues[i + 1] = track.values[i + 1] * hipsPositionScale;
          scaledValues[i + 2] = (track.values[i + 2] - initZ) * lateralScale;
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, scaledValues)
        );
      }
    });

    return new THREE.AnimationClip(clip.name || 'RetargetedDance', clip.duration, tracks);
  }

  /**
   * Loads and retargets pre-converted VRM dance JSON clips (e.g. from dance-pet library)
   * into standard Three.js AnimationClip mapped to the given VRM model's normalized bones.
   */
  async loadRetargetedJsonClip(url, vrm) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status} fetching ${url}`);
    const clipData = await res.json();

    const bipToHumanoid = {
      'Hips': 'hips',
      'Spine': 'spine',
      'Chest': 'chest',
      'UpperChest': 'upperChest',
      'Neck': 'neck',
      'Head': 'head',
      'L_Shoulder': 'leftShoulder',
      'L_UpperArm': 'leftUpperArm',
      'L_LowerArm': 'leftLowerArm',
      'L_Hand': 'leftHand',
      'L_Thumb1': 'leftThumbMetacarpal',
      'L_Thumb2': 'leftThumbProximal',
      'L_Thumb3': 'leftThumbDistal',
      'L_Index1': 'leftIndexProximal',
      'L_Index2': 'leftIndexIntermediate',
      'L_Index3': 'leftIndexDistal',
      'L_Middle1': 'leftMiddleProximal',
      'L_Middle2': 'leftMiddleIntermediate',
      'L_Middle3': 'leftMiddleDistal',
      'L_Ring1': 'leftRingProximal',
      'L_Ring2': 'leftRingIntermediate',
      'L_Ring3': 'leftRingDistal',
      'L_Little1': 'leftLittleProximal',
      'L_Little2': 'leftLittleIntermediate',
      'L_Little3': 'leftLittleDistal',
      'R_Shoulder': 'rightShoulder',
      'R_UpperArm': 'rightUpperArm',
      'R_LowerArm': 'rightLowerArm',
      'R_Hand': 'rightHand',
      'R_Thumb1': 'rightThumbMetacarpal',
      'R_Thumb2': 'rightThumbProximal',
      'R_Thumb3': 'rightThumbDistal',
      'R_Index1': 'rightIndexProximal',
      'R_Index2': 'rightIndexIntermediate',
      'R_Index3': 'rightIndexDistal',
      'R_Middle1': 'rightMiddleProximal',
      'R_Middle2': 'rightMiddleIntermediate',
      'R_Middle3': 'rightMiddleDistal',
      'R_Ring1': 'rightRingProximal',
      'R_Ring2': 'rightRingIntermediate',
      'R_Ring3': 'rightRingDistal',
      'R_Little1': 'rightLittleProximal',
      'R_Little2': 'rightLittleIntermediate',
      'R_Little3': 'rightLittleDistal',
      'L_UpperLeg': 'leftUpperLeg',
      'L_LowerLeg': 'leftLowerLeg',
      'L_Foot': 'leftFoot',
      'L_ToeBase': 'leftToes',
      'R_UpperLeg': 'rightUpperLeg',
      'R_LowerLeg': 'rightLowerLeg',
      'R_Foot': 'rightFoot',
      'R_ToeBase': 'rightToes'
    };

    const tracks = [];
    const _qTemp = new THREE.Quaternion();
    const _eulerHips = new THREE.Euler();

    for (const track of clipData.tracks) {
      const parts = track.name.split('.');
      const rawNode = parts[0];
      const prop = parts[1];
      const cleaned = rawNode.replace(/^Normalized_J_Bip_C_/, '').replace(/^Normalized_J_Bip_/, '');
      const humanoidKey = bipToHumanoid[cleaned];
      if (!humanoidKey) continue;
      const targetNode = vrm.humanoid?.getNormalizedBoneNode(humanoidKey);
      if (!targetNode) continue;

      const targetTrackName = `${targetNode.name}.${prop}`;
      if (track.type === 'quaternion') {
        tracks.push(new THREE.QuaternionKeyframeTrack(targetTrackName, track.times, track.values));
      } else if (track.type === 'vector' && humanoidKey === 'hips') {
        const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] || 0.85;
        const refHeight = 0.85;
        const vScale = vrmHipsHeight / refHeight;
        const vals = new Float32Array(track.values.length);
        const initX = track.values[0] || 0;
        const initZ = track.values[2] || 0;
        const lateralScale = 0.45;
        for (let i = 0; i < track.values.length; i += 3) {
          vals[i] = (track.values[i] - initX) * lateralScale;
          vals[i + 1] = track.values[i + 1] * vScale;
          vals[i + 2] = (track.values[i + 2] - initZ) * lateralScale;
        }
        tracks.push(new THREE.VectorKeyframeTrack(targetTrackName, track.times, vals));
      }
    }

    const clipName = url.split('/').pop().replace(/\.json$/, '');
    return new THREE.AnimationClip(clipName, clipData.duration, tracks);
  }

  /**
   * Loads and retargets curated Speech2Motion dataset clips (from motions_processed/curated)
   * containing 21 standard VRM humanoid bones and root translation into Three.js AnimationClip.
   * Enforces strict anatomical joint safety and posture uprightness so characters never tilt or pop.
   */
  loadCuratedMotionClip(clipData, vrm) {
    if (!clipData || !vrm) return null;
    const fps = clipData.fps || 30.0;
    const nFrames = clipData.n_frames || (clipData.transl ? clipData.transl.length : 60);
    const duration = clipData.duration || (nFrames / fps);

    const times = new Float32Array(nFrames);
    for (let i = 0; i < nFrames; i++) {
      times[i] = i / fps;
    }

    const tracks = [];
    const qTemp = new THREE.Quaternion();
    const prevQ = new THREE.Quaternion();
    const eulerTemp = new THREE.Euler();

    // 1. Bone rotational keyframe tracks
    if (clipData.bones) {
      for (const [boneName, quatList] of Object.entries(clipData.bones)) {
        if (!quatList || quatList.length < nFrames) continue;
        const targetNode = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (!targetNode) continue;

        const quatValues = new Float32Array(nFrames * 4);
        prevQ.set(0, 0, 0, 1);

        for (let i = 0; i < nFrames; i++) {
          const q = quatList[i] || [0, 0, 0, 1];
          qTemp.set(q[0], q[1], q[2], q[3]);

          // NaN / degenerate guard
          if (isNaN(qTemp.x) || isNaN(qTemp.y) || isNaN(qTemp.z) || isNaN(qTemp.w) || qTemp.lengthSq() < 1e-5) {
            qTemp.set(0, 0, 0, 1);
          } else {
            qTemp.normalize();
          }

          // Hips Posture Guard:
          // Strictly clamp sideways roll (Z) so characters stay firmly upright on stage.
          // Completely eliminates mid-air sideways tipping (breaking point bug) while preserving
          // full natural dance rotations, hip sways, and yaw turns.
          if (boneName === 'hips') {
            eulerTemp.setFromQuaternion(qTemp, 'YXZ');
            eulerTemp.z = THREE.MathUtils.clamp(eulerTemp.z, -0.08, 0.08); // max ~4.6 deg sideways roll
            eulerTemp.x = THREE.MathUtils.clamp(eulerTemp.x, -0.35, 0.45); // natural dance pitch
            qTemp.setFromEuler(eulerTemp);
          }

          // Quaternion Continuity Guard:
          // Ensure dot(qTemp, prevQ) >= 0 to avoid antipodal 360-degree rotation snapping
          if (i > 0) {
            const dot = qTemp.x * prevQ.x + qTemp.y * prevQ.y + qTemp.z * prevQ.z + qTemp.w * prevQ.w;
            if (dot < 0) {
              qTemp.x = -qTemp.x;
              qTemp.y = -qTemp.y;
              qTemp.z = -qTemp.z;
              qTemp.w = -qTemp.w;
            }
          }
          prevQ.copy(qTemp);

          quatValues[i * 4 + 0] = qTemp.x;
          quatValues[i * 4 + 1] = qTemp.y;
          quatValues[i * 4 + 2] = qTemp.z;
          quatValues[i * 4 + 3] = qTemp.w;
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${targetNode.name}.quaternion`,
            times,
            quatValues
          )
        );
      }
    }

    // 2. Hips translation keyframe track (scaled to VRM humanoid hips height)
    // Lateral drift is softly dampened so characters stay centered on their stage pads
    // while maintaining full, explosive vertical beat bouncing.
    if (clipData.transl && clipData.transl.length >= nFrames) {
      const hipsNode = vrm.humanoid?.getNormalizedBoneNode('hips');
      if (hipsNode) {
        const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] || 0.85;
        const translValues = new Float32Array(nFrames * 3);
        const initX = clipData.transl[0]?.[0] || 0;
        const initZ = clipData.transl[0]?.[2] || 0;
        const lateralScale = 0.20;
        for (let i = 0; i < nFrames; i++) {
          const t = clipData.transl[i] || [0, 0, 0];
          const rawDx = (t[0] - initX) * lateralScale;
          const rawDz = (t[2] - initZ) * lateralScale;
          translValues[i * 3 + 0] = Math.max(-0.12, Math.min(0.12, rawDx));
          const yVal = vrmHipsHeight + (t[1] * (vrmHipsHeight / 0.85));
          translValues[i * 3 + 1] = Math.max(0.30, Math.min(1.60, yVal));
          translValues[i * 3 + 2] = Math.max(-0.12, Math.min(0.12, rawDz));
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${hipsNode.name}.position`,
            times,
            translValues
          )
        );
      }
    }

    const clipName = clipData.filename || `motion_${clipData.id}`;
    const clip = new THREE.AnimationClip(clipName, duration, tracks);
    clip.userData = { isCurated: true };
    return clip;
  }
}

