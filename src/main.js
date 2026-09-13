// Suppress benign Three.js FBXLoader material and skinning warnings from console
const _nativeWarn = console.warn;
console.warn = function (...args) {
  const first = typeof args[0] === 'string' ? args[0] : (args[0]?.message || '');
  if (
    first.includes('THREE.FBXLoader') ||
    first.includes('ShininessExponent') ||
    first.includes('skinning weights') ||
    first.includes('Deleting additional weights') ||
    first.includes('skipping texture') ||
    first.includes('WebGLRenderer: A lot of textures')
  ) {
    return;
  }
  _nativeWarn.apply(console, args);
};

import './ui/styles.css';
import * as THREE from 'three';
import { AudioEngine } from './audio/AudioEngine.js';
import { DanceEngine } from './dance/DanceEngine.js';
import { SceneManager } from './stage/SceneManager.js';
import { PlayerUI } from './ui/PlayerUI.js';

window.THREE = THREE;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');

  // 1. Initialize Audio Engine
  const audioEngine = new AudioEngine();

  // 2. Initialize Dance & Choreography Engine
  const danceEngine = new DanceEngine(audioEngine);

  // 3. Initialize Three.js Stage & VRM Dancers
  const sceneManager = new SceneManager(container, audioEngine, danceEngine);

  // 4. Initialize UI Controllers
  const playerUI = new PlayerUI(audioEngine, danceEngine, sceneManager);

  // 5. Load Initial Data (tracks, motion library, etc.)
  await playerUI.loadInitialData();

  // 6. Start Render Loop
  sceneManager.start();

  window.audioEngine = audioEngine;
  window.danceEngine = danceEngine;
  window.sceneManager = sceneManager;
  window.playerUI = playerUI;

  console.log('✨ 3D Music-Driven Dancing Player is fully running!');
});
