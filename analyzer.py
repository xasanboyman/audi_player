#!/usr/bin/env python3
import sys
import json
import numpy as np
import librosa

def analyze_audio(audio_path, output_json=None):
    # Load audio (downsampled to 22050 for fast analysis)
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    
    # Beat tracking
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if isinstance(tempo, np.ndarray):
        bpm = float(tempo.item(0))
    else:
        bpm = float(tempo)
        
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    
    # Downbeats (assume 4/4 meter by default, group every 4 beats)
    downbeats = [beat_times[i] for i in range(0, len(beat_times), 4)]
    
    # RMS Energy & Onset Envelope
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    # Normalize energy to 0.0 - 1.0
    max_rms = float(np.max(rms)) if np.max(rms) > 0 else 1.0
    norm_rms = (rms / max_rms).tolist()
    
    # Resample energy curve to ~10 Hz (every 0.1s) for lightweight web transport
    target_sample_rate = 10  # 10 samples per second
    n_samples = max(1, int(duration * target_sample_rate))
    energy_curve = np.interp(
        np.linspace(0, duration, n_samples),
        rms_times,
        norm_rms
    ).tolist()
    
    # Harmonic-Percussive Separation for Vocal and Beat discrimination
    # Harmonic component roughly corresponds to vocals & melodic leads
    # Percussive corresponds to drums / rhythm
    y_harm, y_perc = librosa.effects.hpss(y)
    harm_rms = librosa.feature.rms(y=y_harm, hop_length=hop_length)[0]
    harm_times = librosa.frames_to_time(np.arange(len(harm_rms)), sr=sr, hop_length=hop_length)
    harm_norm = harm_rms / (np.max(harm_rms) if np.max(harm_rms) > 0 else 1.0)
    
    # Detect vocal/melodic presence: segments where harmonic energy > threshold
    harm_curve = np.interp(np.linspace(0, duration, n_samples), harm_times, harm_norm)
    vocal_threshold = 0.28
    is_vocal = harm_curve > vocal_threshold
    
    vocal_segments = []
    in_vocal = False
    seg_start = 0.0
    for i, active in enumerate(is_vocal):
        t = i / target_sample_rate
        if active and not in_vocal:
            in_vocal = True
            seg_start = t
        elif not active and in_vocal:
            in_vocal = False
            if t - seg_start >= 1.0:  # minimum 1 second duration
                vocal_segments.append({"start": round(seg_start, 2), "end": round(t, 2)})
    if in_vocal and (duration - seg_start >= 1.0):
        vocal_segments.append({"start": round(seg_start, 2), "end": round(duration, 2)})

    # Segmentation into musical parts (Intro, Verse, Buildup, Drop/Chorus, Outro)
    # Using 4-bar / 8-bar chunking combined with energy levels
    segments = []
    bar_duration = (60.0 / bpm) * 4 if bpm > 0 else 2.0
    chunk_dur = bar_duration * 4  # 16-beat sections (approx 6-8 bars)
    if chunk_dur < 8.0:
        chunk_dur = 16.0
        
    num_chunks = max(1, int(np.ceil(duration / chunk_dur)))
    
    for i in range(num_chunks):
        t_start = i * chunk_dur
        t_end = min(duration, (i + 1) * chunk_dur)
        if t_end <= t_start:
            break
            
        # calculate mean energy in this segment
        idx_start = int(t_start * target_sample_rate)
        idx_end = min(len(energy_curve), int(t_end * target_sample_rate))
        if idx_end > idx_start:
            chunk_energy = float(np.mean(energy_curve[idx_start:idx_end]))
        else:
            chunk_energy = 0.5
            
        # Classify segment style
        if i == 0:
            name = "Intro"
            style = "intro"
        elif i == num_chunks - 1:
            name = "Outro"
            style = "outro"
        elif chunk_energy >= 0.72:
            name = f"Drop / Chorus"
            style = "high_energy"
        elif chunk_energy >= 0.45:
            name = f"Verse / Groove"
            style = "rhythm"
        else:
            name = f"Breakdown / Chill"
            style = "chill"
            
        segments.append({
            "name": name,
            "start": round(t_start, 2),
            "end": round(t_end, 2),
            "energy": round(chunk_energy, 3),
            "style": style
        })
        
    result = {
        "bpm": round(bpm, 1),
        "duration": round(duration, 2),
        "beats": [round(b, 3) for b in beat_times],
        "downbeats": [round(db, 3) for db in downbeats],
        "energy_curve": [round(e, 3) for e in energy_curve],
        "vocal_segments": vocal_segments,
        "segments": segments
    }
    
    if output_json:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
            
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <audio_file> [output_json]")
        sys.exit(1)
        
    audio_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    res = analyze_audio(audio_file, out_file)
    if not out_file:
        print(json.dumps(res, indent=2))
