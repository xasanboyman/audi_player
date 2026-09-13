import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn, execFile } from 'child_process';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Directories
const TRACKS_DIR = path.join(__dirname, 'tracks');
const MODELS_DIR = path.join(__dirname, 'models');
const MOTIONS_DIR = path.join(__dirname, 'motions_processed');
const CURATED_DIR = path.join(MOTIONS_DIR, 'curated');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const MOCAP_DIR = path.join(__dirname, 'external_mocap', 'all_fbx_dances');
[TRACKS_DIR, MODELS_DIR, MOTIONS_DIR, CURATED_DIR, UPLOADS_DIR, MOCAP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve static files
app.use('/tracks', express.static(TRACKS_DIR));
app.use('/models', express.static(MODELS_DIR));
app.use('/motions', express.static(MOTIONS_DIR));
app.use('/mocap', express.static(MOCAP_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// Multer storage configuration
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TRACKS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}_${Date.now()}${ext}`);
  }
});

const motionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `motion_${safeName}_${Date.now()}${ext}`);
  }
});

const uploadAudio = multer({ storage: audioStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadMotion = multer({ storage: motionStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// Helper: Run Python Analyzer with uv
function runAnalyzer(audioPath, jsonPath) {
  return new Promise((resolve, reject) => {
    const uvPath = '/home/xasanboy/.local/bin/uv';
    const analyzerScript = path.join(__dirname, 'analyzer.py');
    const args = [
      'run',
      '--with', 'numpy',
      '--with', 'scipy',
      '--with', 'librosa',
      '--with', 'soundfile',
      'python',
      analyzerScript,
      audioPath,
      jsonPath
    ];

    const proc = spawn(uvPath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => {
      if (code === 0 && fs.existsSync(jsonPath)) {
        try {
          const result = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse analyzer output: ${err.message}`));
        }
      } else {
        reject(new Error(`Analyzer failed (code ${code}): ${stderr || stdout}`));
      }
    });
  });
}

// 1. Get tracks list
app.get('/api/tracks', (req, res) => {
  try {
    const files = fs.readdirSync(TRACKS_DIR);
    const audioFiles = files.filter(f => /\.(mp3|wav|flac|ogg)$/i.test(f));
    
    const trackList = audioFiles.map(file => {
      const baseName = file.replace(/\.(mp3|wav|flac|ogg)$/i, '');
      const jsonFile = `${baseName}.json`;
      const jsonPath = path.join(TRACKS_DIR, jsonFile);
      
      let analysis = null;
      if (fs.existsSync(jsonPath)) {
        try {
          analysis = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        } catch (e) {
          console.warn(`Error reading analysis for ${file}:`, e.message);
        }
      }
      
      // Derive friendly title and artist
      let title = baseName.replace(/_/g, ' ');
      let artist = 'Original Track';
      
      if (baseName.includes('brawl_stars_phonk')) {
        title = 'Brawl Stars Phonk';
        artist = 'Apovabin / Phonk Vibe';
      } else if (baseName.includes('cyber_phonk')) {
        title = 'Cyber Phonk 140';
        artist = 'Night City Drift';
      } else if (baseName.includes('future_idol')) {
        title = 'Future Idol Dance';
        artist = 'Neo Tokyo Pop';
      }
      
      return {
        id: baseName,
        title,
        artist,
        file: `/tracks/${file}`,
        fileName: file,
        bpm: analysis?.bpm || 120,
        duration: analysis?.duration || 60,
        analysis
      };
    });
    
    res.json({ success: true, tracks: trackList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Upload and analyze audio track (supports both /api/upload-track and /api/upload/audio)
async function handleUploadTrack(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file uploaded' });
    }

    const audioPath = req.file.path;
    const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
    const jsonPath = path.join(TRACKS_DIR, `${baseName}.json`);

    console.log(`Starting audio analysis on: ${req.file.filename}`);
    let analysis = null;
    try {
      analysis = await runAnalyzer(audioPath, jsonPath);
      console.log(`Analysis complete for ${req.file.filename}: BPM=${analysis.bpm}, Duration=${analysis.duration}s`);
    } catch (analysisErr) {
      console.warn(`Python analyzer fallback for ${req.file.filename}:`, analysisErr.message);
      // Fast fallback analysis: 128 BPM with generated beats
      const bpm = 128;
      const beatPeriod = 60.0 / bpm;
      const duration = 180;
      const totalBeats = Math.ceil(duration / beatPeriod);
      const beats = Array.from({ length: totalBeats }, (_, i) => parseFloat((i * beatPeriod).toFixed(4)));
      analysis = {
        bpm,
        duration,
        beats,
        downbeats: beats.filter((_, i) => i % 4 === 0),
        segments: [
          { name: 'Intro', style: 'intro', energy: 0.40, start: 0, end: 16 * beatPeriod },
          { name: 'Verse 1', style: 'rhythm', energy: 0.65, start: 16 * beatPeriod, end: 48 * beatPeriod },
          { name: 'Buildup', style: 'high_energy', energy: 0.85, start: 48 * beatPeriod, end: 64 * beatPeriod },
          { name: 'Chorus / Drop', style: 'high_energy', energy: 0.95, start: 64 * beatPeriod, end: 112 * beatPeriod },
          { name: 'Outro', style: 'outro', energy: 0.35, start: 112 * beatPeriod, end: duration }
        ],
        isFallback: true
      };
      fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
    }

    const track = {
      id: baseName,
      title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, "").replace(/_/g, ' '),
      artist: req.body.artist || 'Uploaded Track',
      file: `/tracks/${req.file.filename}`,
      fileName: req.file.filename,
      bpm: analysis.bpm || 128,
      duration: analysis.duration || 180,
      analysis
    };

    res.json({ success: true, track });
  } catch (err) {
    console.error('Upload track error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post('/api/upload-track', uploadAudio.single('audio'), handleUploadTrack);
app.post('/api/upload/audio', uploadAudio.single('audio'), handleUploadTrack);

// 3. Get models list
app.get('/api/models', (req, res) => {
  try {
    const files = fs.readdirSync(MODELS_DIR);
    const vrmFiles = files.filter(f => /\.(vrm|glb)$/i.test(f));
    
    const models = vrmFiles.map(file => {
      let name = file.replace(/\.(vrm|glb)$/i, '');
      let type = file.endsWith('.vrm') ? 'VRM' : 'GLB';
      return {
        id: file,
        name,
        type,
        url: `/models/${file}`
      };
    });
    
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get motion catalog & curated clips
app.get('/api/motions', (req, res) => {
  try {
    const catalogPath = path.join(MOTIONS_DIR, 'motion_catalog.json');
    if (!fs.existsSync(catalogPath)) {
      return res.status(404).json({ success: false, error: 'Catalog not found' });
    }
    
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    
    // Check available curated files
    const curatedFiles = fs.readdirSync(CURATED_DIR).filter(f => f.endsWith('.json'));
    const curatedIds = new Set(curatedFiles.map(f => f.replace('motion_', '').replace('.json', '')));
    const curatedList = catalog.filter(item => curatedIds.has(String(item.id))).map(item => ({
      ...item,
      clipUrl: `/motions/curated/motion_${item.id}.json`
    }));

    // Prepend authentic high-quality mocap dance performances with complete hand gestures
    const authenticPerformances = [
      // 1. High-Energy & Idol Arm Gestures
      { id: 'dance_arms_hiphop', description: 'Idol Pop & Arm Flow (Authentic Mocap)', category: 'Idol & Arm Gestures', duration: 22.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_arms_hiphop.json' },
      { id: 'dance_tut_hiphop', description: 'Finger Tutting & Geometry (Authentic Mocap)', category: 'Idol & Hand Tutting', duration: 18.5, isFBX: true, clipUrl: '/mocap/retargeted/dance_tut_hiphop.json' },
      { id: 'dance_booty_hiphop', description: 'Idol Bounce & Hips Rhythm (Authentic Mocap)', category: 'Idol & Bounce', duration: 16.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_booty_hiphop.json' },
      { id: 'dance_wave_hiphop', description: 'Body Wave & Arm Flow (Authentic Mocap)', category: 'Groove & Wave', duration: 16.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_wave_hiphop.json' },
      { id: 'dance_pop_groove', description: 'Pop Funk Groove (Mixamo FBX)', category: 'Groove & Funk', duration: 15.0, isFBX: true, clipUrl: '/mocap/Dance_Pop_Groove.fbx' },
      { id: 'hiphop_dancing_mixamo', description: 'Street Hip Hop Master (Mixamo FBX)', category: 'Phonk & Hip Hop', duration: 18.5, isFBX: true, clipUrl: '/mocap/HipHopDancing_Mixamo.fbx' },
      { id: 'girl_dance_groove', description: 'Girl Pop Groove (Mixamo FBX)', category: 'Idol & Groove', duration: 12.0, isFBX: true, clipUrl: '/mocap/Girl_Dance_Groove.fbx' },
      { id: 'rumba_dancing_mixamo', description: 'Sensual Rumba Flow (Mixamo FBX)', category: 'Chill & Flow', duration: 14.0, isFBX: true, clipUrl: '/mocap/Rumba_Dancing_Mixamo.fbx' },

      // 2. Breakdance & Floor Bending Moves
      { id: 'breakdance_ending', description: 'Floor B-Boy Freeze & Drop (Mixamo FBX)', category: 'Bending & Freeze', duration: 16.0, isFBX: true, clipUrl: '/mocap/Breakdance_Ending_Floor.fbx' },
      { id: 'breakdance_freeze_3', description: 'Power Freeze & Ground Spin (Mixamo FBX)', category: 'Bending & Freeze', duration: 15.0, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@Breakdance Freeze Var 3.fbx' },
      { id: 'breakdance_flair', description: 'Acrobatic Gymnastic Flair (Mixamo FBX)', category: 'Bending & Acrobatic', duration: 10.0, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@Flair.fbx' },
      { id: 'dance_breakdance_1990', description: '1990 Headspin & Ground Spin (Authentic Mocap)', category: 'Bending & Spins', duration: 14.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_breakdance_1990.json' },
      { id: 'dance_breakdance_uprock', description: 'Uprock Battle Steps (Authentic Mocap)', category: 'Phonk & Steps', duration: 15.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_breakdance_uprock.json' },
      { id: 'dance_capoeira', description: 'Acrobatic Sweep & Ginga (Authentic Mocap)', category: 'Bending & Martial', duration: 14.5, isFBX: true, clipUrl: '/mocap/retargeted/dance_capoeira.json' },

      // 3. Energetic Mixamo Dance Routines (Dance01 - Dance06)
      { id: 'dance_mixamo_01', description: 'Energetic Dance Routine 1 (Mixamo FBX)', category: 'Idol & Energetic', duration: 18.0, isFBX: true, clipUrl: '/mocap/Dance01.fbx' },
      { id: 'dance_mixamo_02', description: 'Dynamic Hip Hop Routine 2 (Mixamo FBX)', category: 'Phonk & Dynamic', duration: 17.5, isFBX: true, clipUrl: '/mocap/Dance02.fbx' },
      { id: 'dance_mixamo_03', description: 'Locking Wave Routine 3 (Mixamo FBX)', category: 'Groove & Waves', duration: 16.0, isFBX: true, clipUrl: '/mocap/Dance03.fbx' },
      { id: 'dance_mixamo_04', description: 'High Bounce Funk Routine 4 (Mixamo FBX)', category: 'Phonk & Bounce', duration: 18.0, isFBX: true, clipUrl: '/mocap/Dance04.fbx' },
      { id: 'dance_mixamo_05', description: 'Floor & Drop Routine 5 (Mixamo FBX)', category: 'Bending & Floor', duration: 17.0, isFBX: true, clipUrl: '/mocap/Dance05.fbx' },
      { id: 'dance_mixamo_06', description: 'Pop Star Solo Routine 6 (Mixamo FBX)', category: 'Idol & Pop', duration: 16.5, isFBX: true, clipUrl: '/mocap/Dance06.fbx' },

      // 4. Urban & Club Grooves
      { id: 'dance_step_hiphop', description: 'Rhythm Bounce & Footwork (Authentic Mocap)', category: 'Phonk & Bounce', duration: 14.2, isFBX: true, clipUrl: '/mocap/retargeted/dance_step_hiphop.json' },
      { id: 'dance_hiphop', description: 'Urban Hip Hop Routine (Authentic Mocap)', category: 'Groove & Hip Hop', duration: 12.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_hiphop.json' },
      { id: 'house_dance', description: 'House Step & Shuffle (Mixamo Mocap)', category: 'Phonk & House', duration: 16.5, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@House Dancing.fbx' },
      { id: 'locking_dance', description: 'Funk Locking & Pointing (Mixamo Mocap)', category: 'Groove & Locking', duration: 12.0, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@Locking Hip Hop Dance.fbx' },
      { id: 'samba_dance', description: 'Carnival Samba Rhythm (Mixamo Mocap)', category: 'Groove & Samba', duration: 18.0, isFBX: true, clipUrl: '/mocap/Samba Dancing.fbx' },
      { id: 'dance_samba_retarget', description: 'Fast Samba Steps (Authentic Mocap)', category: 'Groove & Samba', duration: 18.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_samba.json' },
      { id: 'swing_dance', description: 'Classic Swing Jive (Mixamo Mocap)', category: 'Groove & Swing', duration: 12.0, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@Swing Dancing.fbx' },
      { id: 'hiphop_dance_2', description: 'Hip Hop Street Flare (Mixamo Mocap)', category: 'Phonk & Flare', duration: 14.0, isFBX: true, clipUrl: '/mocap/HipHopDance.fbx' },
      { id: 'thriller_routine_3', description: 'Thriller Master Routine (Mixamo FBX)', category: 'Groove & Thriller', duration: 25.0, isFBX: true, clipUrl: '/mocap/Ch24_nonPBR@Thriller Part 3.fbx' },
      { id: 'dance_thriller', description: 'Thriller Zombie Groove (Authentic Mocap)', category: 'Groove & Thriller', duration: 16.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_thriller.json' },

      // 5. Expressive, Flow & Fun
      { id: 'arm_stretching_flow', description: 'Idol Arm Flow & Stretch (Mixamo FBX)', category: 'Expressive & Stretch', duration: 18.0, isFBX: true, clipUrl: '/mocap/Arm_Stretching_Flow.fbx' },
      { id: 'dance_twist', description: 'Pop Twist Groove (Authentic Mocap)', category: 'Groove & Twist', duration: 10.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_twist.json' },
      { id: 'dance_snake_hiphop', description: 'Sensual Snake Wave (Authentic Mocap)', category: 'Expressive & Waves', duration: 15.2, isFBX: true, clipUrl: '/mocap/retargeted/dance_snake_hiphop.json' },
      { id: 'dance_party', description: 'Party Jump & Bounce (Authentic Mocap)', category: 'Party & Jumps', duration: 11.5, isFBX: true, clipUrl: '/mocap/retargeted/dance_party.json' },
      { id: 'dance_silly', description: 'Playful Anime Idol Bounce (Authentic Mocap)', category: 'Idol & Bounce', duration: 12.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_silly.json' },
      { id: 'dance_ymca', description: 'High Overhead Poses (Authentic Mocap)', category: 'Expressive & Poses', duration: 14.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_ymca.json' },
      { id: 'dance_rumba', description: 'Smooth Latin Sway (Authentic Mocap)', category: 'Chill & Sway', duration: 14.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_rumba.json' },
      { id: 'dance_jazz', description: 'Broadway Jazz Kicks (Authentic Mocap)', category: 'Groove & Jazz', duration: 13.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_jazz.json' },
      { id: 'dance_belly', description: 'Ribcage & Hip Isolation (Authentic Mocap)', category: 'Expressive & Rhythm', duration: 15.0, isFBX: true, clipUrl: '/mocap/retargeted/dance_belly.json' },
      { id: 'idle_stand_02', description: 'Chic Rhythm Idle Sway (Authentic Mocap)', category: 'Chill & Idle', duration: 10.0, isFBX: true, clipUrl: '/mocap/retargeted/idle_stand_02.json' },
      { id: 'idle_breathe_01', description: 'Natural Breathing Rest (Authentic Mocap)', category: 'Chill & Idle', duration: 8.0, isFBX: true, clipUrl: '/mocap/retargeted/idle_breathe_01.json' }
    ];

    const allMotions = [...authenticPerformances, ...curatedList];

    res.json({
      success: true,
      totalMotions: allMotions.length,
      curated: allMotions,
      categories: ['Idol & Arm Gestures', 'Phonk & Bounce', 'Groove & Hip Hop', 'Chill & Sway', 'Bending & Martial']
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get curated motion clip JSON
app.get('/api/motions/clip/:id', (req, res) => {
  try {
    const safeId = req.params.id.replace(/^motion_/, '');
    const clipFile = path.join(CURATED_DIR, `motion_${safeId}.json`);
    if (!fs.existsSync(clipFile)) {
      return res.status(404).json({ success: false, error: 'Clip not found' });
    }
    const data = JSON.parse(fs.readFileSync(clipFile, 'utf8'));
    res.json({ success: true, clip: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. Save or update curated motion clip (e.g. converted from FBX)
app.post('/api/save-curated-motion', (req, res) => {
  try {
    const clip = req.body;
    if (!clip || !clip.id) return res.status(400).json({ success: false, error: 'Missing clip data' });
    const clipFile = path.join(CURATED_DIR, `motion_${clip.id}.json`);
    fs.writeFileSync(clipFile, JSON.stringify(clip));

    const catalogPath = path.join(MOTIONS_DIR, 'motion_catalog.json');
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const idx = catalog.findIndex(item => String(item.id) === String(clip.id));
      const entry = {
        id: clip.id,
        description: clip.description,
        filename: clip.filename || `motion_${clip.id}`,
        category: clip.category || 'energetic_dance',
        character_origin: clip.character_origin || 'Mixamo',
        energy: clip.energy || 0.95,
        duration: clip.duration,
        n_frames: clip.n_frames,
        clipUrl: `/motions/curated/motion_${clip.id}.json`
      };
      if (idx >= 0) {
        catalog[idx] = entry;
      } else {
        catalog.unshift(entry);
      }
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    }
    res.json({ success: true, id: clip.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Upload custom animation
app.post('/api/upload-animation', uploadMotion.single('animation'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No animation file uploaded' });
    }
    
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    if (ext === '.npz') {
      // Process uploaded NPZ using process_motions or python converter
      const uvPath = '/home/xasanboy/.local/bin/uv';
      const convScript = `
import sys, json, numpy as np
from process_motions import rotmat_to_quat, JOINT_MAP
data = np.load(sys.argv[1])
joint_names = [str(j) for j in data['joint_names']]
rotmat = data['rotmat']
transl = data['transl']
quats = rotmat_to_quat(rotmat)
bones_data = {}
for j_idx, j_name in enumerate(joint_names):
    vrm_bone = JOINT_MAP.get(j_name)
    if vrm_bone:
        bones_data[vrm_bone] = np.round(quats[:, j_idx, :].astype(np.float32), 4).tolist()
hip_transl = []
base_y = float(transl[0, 2])
for t in transl:
    hip_transl.append([round(float(t[0]), 4), round(float(t[2] - base_y), 4), -round(float(t[1]), 4)])
clip = {
    'id': 'uploaded_' + str(np.random.randint(1000, 9999)),
    'category': 'uploaded',
    'description': sys.argv[2],
    'fps': 30.0,
    'duration': len(transl) / 30.0,
    'n_frames': len(transl),
    'transl': hip_transl,
    'bones': bones_data
}
with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump(clip, f)
`;
      const outJson = path.join(CURATED_DIR, `motion_up_${Date.now()}.json`);
      const proc = spawn(uvPath, ['run', '--with', 'numpy', 'python', '-c', convScript, filePath, req.file.originalname, outJson], {
        cwd: __dirname
      });
      
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outJson)) {
          const clip = JSON.parse(fs.readFileSync(outJson, 'utf8'));
          res.json({ success: true, message: 'NPZ animation converted successfully', clip });
        } else {
          res.status(500).json({ success: false, error: 'Failed to convert NPZ animation' });
        }
      });
    } else {
      // Return file URL for Three.js loaders (FBX/GLTF/BVH)
      res.json({
        success: true,
        message: 'Animation file uploaded',
        url: `/uploads/${req.file.filename}`,
        filename: req.file.originalname,
        type: ext
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to proxy external audio streams with full CORS & Range (seeking) support
async function handleAudioStreamProxy(targetUrl, req, res) {
  try {
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.warn(`[Stream Proxy] Upstream returned status ${upstream.status} for ${targetUrl}`);
      return res.status(upstream.status).send(`Upstream audio error: ${upstream.status}`);
    }

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (!upstream.body) return res.end();

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', (err) => {
      console.warn('[Stream Proxy] Stream pipe error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });
    req.on('close', () => {
      nodeStream.destroy();
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error('[Stream Proxy] Fatal proxy error:', err);
    if (!res.headersSent) {
      res.status(500).send(err.message);
    }
  }
}

// ====================================================
// YouTube Stealth Playwright Search & Streaming Engine
// ====================================================
const YOUTUBE_SEARCH_SCRIPT = path.join(__dirname, 'youtube_search.py');
const youtubeSearchCache = new Map(); // query -> { timestamp, data }
const youtubeStreamCache = new Map(); // videoId -> { timestamp, streamUrl }

function runStealthYoutubeSearch(query, limit = 20) {
  return new Promise((resolve, reject) => {
    const cacheKey = `${(query || 'trending').toLowerCase().trim()}_${limit}`;
    const cached = youtubeSearchCache.get(cacheKey);
    // Cache search results for 10 minutes
    if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
      return resolve(cached.data);
    }

    const uvPath = '/home/xasanboy/.local/bin/uv';
    const args = [
      'run',
      '--with', 'playwright',
      '--with', 'playwright-stealth',
      'python',
      YOUTUBE_SEARCH_SCRIPT,
      query || 'trending music phonk',
      String(limit)
    ];

    execFile(uvPath, args, { timeout: 35000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[YouTube Stealth Search] Execution error:', err.message, stderr);
        if (cached) return resolve(cached.data);
        return reject(new Error(stderr || err.message));
      }

      try {
        const json = JSON.parse(stdout.trim());
        if (json.success && Array.isArray(json.results)) {
          youtubeSearchCache.set(cacheKey, { timestamp: Date.now(), data: json.results });
          resolve(json.results);
        } else {
          reject(new Error(json.error || 'YouTube search returned no results'));
        }
      } catch (parseErr) {
        console.error('[YouTube Stealth Search] Parse error:', parseErr, stdout);
        reject(parseErr);
      }
    });
  });
}

function getYoutubeAudioStreamUrl(videoId) {
  return new Promise((resolve, reject) => {
    const cleanId = videoId.replace(/^yt_/, '');
    const cached = youtubeStreamCache.get(cleanId);
    // Cache stream URLs for 3 hours
    if (cached && (Date.now() - cached.timestamp < 3 * 60 * 60 * 1000)) {
      return resolve(cached.streamUrl);
    }

    const uvPath = '/home/xasanboy/.local/bin/uv';
    const targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
    const args = [
      'run',
      '--with', 'yt-dlp',
      'yt-dlp',
      '-f', 'bestaudio/best',
      '-g',
      targetUrl
    ];

    execFile(uvPath, args, { timeout: 25000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[YouTube Stream] yt-dlp error for ${cleanId}:`, err.message, stderr);
        return reject(new Error(stderr || err.message));
      }

      const streamUrl = stdout.trim().split('\n').pop().trim();
      if (!streamUrl || !streamUrl.startsWith('http')) {
        return reject(new Error('Invalid stream URL extracted from yt-dlp'));
      }

      youtubeStreamCache.set(cleanId, { timestamp: Date.now(), streamUrl });
      resolve(streamUrl);
    });
  });
}

// 5. Search YouTube Music using Stealth Playwright
app.get('/api/music/search', async (req, res) => {
  try {
    const query = req.query.q || 'phonk music';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 40);
    const results = await runStealthYoutubeSearch(query, limit);

    res.json({
      success: true,
      count: results.length,
      query,
      source: 'YouTube (Stealth Playwright)',
      tracks: results
    });
  } catch (err) {
    console.error('[YouTube Search API] Route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias for youtube specific search
app.get('/api/youtube/search', async (req, res) => {
  try {
    const query = req.query.q || 'phonk music';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 40);
    const results = await runStealthYoutubeSearch(query, limit);
    res.json({ success: true, count: results.length, query, tracks: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Get Trending YouTube Music via Stealth Playwright
app.get('/api/music/trending', async (req, res) => {
  try {
    const genre = req.query.genre || '';
    const query = genre ? `${genre} trending music` : 'trending music phonk electronic 2026';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 30);
    const results = await runStealthYoutubeSearch(query, limit);

    res.json({
      success: true,
      count: results.length,
      genre,
      source: 'YouTube (Stealth Playwright)',
      tracks: results
    });
  } catch (err) {
    console.error('[YouTube Trending API] Route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Stream YouTube audio by Video ID
app.get('/api/youtube/stream/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const streamUrl = await getYoutubeAudioStreamUrl(videoId);
    await handleAudioStreamProxy(streamUrl, req, res);
  } catch (err) {
    console.error('[YouTube Stream Proxy] Error:', err);
    if (!res.headersSent) res.status(500).send(`YouTube stream error: ${err.message}`);
  }
});

// 8. Proxied audio stream by Track ID (YouTube or Legacy)
app.get('/api/music/stream/:id', async (req, res) => {
  const trackId = req.params.id;
  if (trackId.startsWith('yt_') || trackId.length === 11 || !trackId.includes('-')) {
    try {
      const cleanId = trackId.replace(/^yt_/, '');
      const streamUrl = await getYoutubeAudioStreamUrl(cleanId);
      return await handleAudioStreamProxy(streamUrl, req, res);
    } catch (err) {
      console.error('[Music Stream YouTube Proxy] Error:', err);
      if (!res.headersSent) return res.status(500).send(`YouTube stream error: ${err.message}`);
      return;
    }
  }

  // Fallback for Audius if legacy ID
  const audiusHost = 'https://discoveryprovider.audius.co';
  const targetUrl = `${audiusHost}/v1/tracks/${trackId}/stream?app_name=CYBERDANCE`;
  await handleAudioStreamProxy(targetUrl, req, res);
});

// 9. General proxy endpoint for arbitrary external audio streams
app.get('/api/music/proxy-stream', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }
  await handleAudioStreamProxy(targetUrl, req, res);
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎵 Audio Player & Dance Engine Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
