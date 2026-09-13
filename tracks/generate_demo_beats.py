#!/usr/bin/env python3
import numpy as np
import scipy.io.wavfile as wavfile
import subprocess
import os

sr = 44100

def create_kick(t):
    f0, f1 = 150, 45
    freq = f1 + (f0 - f1) * np.exp(-t * 35)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    env = np.exp(-t * 12)
    return np.sin(phase) * env

def create_snare(t):
    noise = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 25)
    return tone * 0.4 + noise * 0.6

def create_hihat(t, open_hat=False):
    noise = np.random.uniform(-1, 1, len(t))
    decay = 15 if open_hat else 60
    return noise * np.exp(-t * decay)

def create_cowbell(t, pitch=800):
    env = np.exp(-t * 15)
    wave = np.sin(2 * np.pi * pitch * t) + 0.5 * np.sin(2 * np.pi * pitch * 1.5 * t)
    return wave * env

def generate_phonk_track(filename, duration_sec=45, bpm=140):
    total_samples = int(duration_sec * sr)
    left = np.zeros(total_samples)
    right = np.zeros(total_samples)
    
    beat_dur = 60.0 / bpm
    sixteenth = beat_dur / 4.0
    num_beats = int(duration_sec / beat_dur)
    
    # Cowbell melody (frequencies in Hz)
    melody_scale = [587.33, 659.25, 783.99, 880.0, 1046.50, 880.0, 783.99, 659.25]
    
    for b in range(num_beats):
        t_start = b * beat_dur
        s_start = int(t_start * sr)
        
        # Kick on 1 and 3 (or phonk syncopated)
        if b % 2 == 0 or (b % 4 == 2):
            k_len = int(0.3 * sr)
            if s_start + k_len < total_samples:
                t = np.linspace(0, 0.3, k_len)
                k = create_kick(t) * 0.9
                left[s_start:s_start+k_len] += k
                right[s_start:s_start+k_len] += k
                
        # Snare/Clap on 2 and 4
        if b % 2 == 1:
            sn_len = int(0.25 * sr)
            if s_start + sn_len < total_samples:
                t = np.linspace(0, 0.25, sn_len)
                sn = create_snare(t) * 0.7
                left[s_start:s_start+sn_len] += sn * 0.8
                right[s_start:s_start+sn_len] += sn * 0.9
                
        # Hi-hats every 16th note
        for s in range(4):
            h_time = t_start + s * sixteenth
            h_idx = int(h_time * sr)
            h_len = int(0.08 * sr)
            if h_idx + h_len < total_samples:
                t = np.linspace(0, 0.08, h_len)
                h = create_hihat(t, open_hat=(s == 2)) * 0.25
                pan = 0.3 if s % 2 == 0 else 0.7
                left[h_idx:h_idx+h_len] += h * (1 - pan)
                right[h_idx:h_idx+h_len] += h * pan
                
        # Cowbell melody note
        pitch = melody_scale[b % len(melody_scale)]
        cb_len = int(0.35 * sr)
        if s_start + cb_len < total_samples:
            t = np.linspace(0, 0.35, cb_len)
            cb = create_cowbell(t, pitch=pitch) * 0.45
            left[s_start:s_start+cb_len] += cb * 0.7
            right[s_start:s_start+cb_len] += cb * 0.5
            
        # 808 distorted bass
        bass_len = int(beat_dur * sr)
        if s_start + bass_len < total_samples:
            t = np.linspace(0, beat_dur, bass_len)
            bass_freq = pitch / 8.0
            bass = np.tanh(np.sin(2 * np.pi * bass_freq * t) * 2.5) * 0.6 * np.exp(-t * 2)
            left[s_start:s_start+bass_len] += bass
            right[s_start:s_start+bass_len] += bass

    # Normalize
    max_val = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-4)
    left = (left / max_val * 0.92 * 32767).astype(np.int16)
    right = (right / max_val * 0.92 * 32767).astype(np.int16)
    stereo = np.column_stack((left, right))
    
    wav_path = filename.replace('.mp3', '.wav')
    wavfile.write(wav_path, sr, stereo)
    subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-b:a', '192k', filename], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(wav_path):
        os.remove(wav_path)
    print(f"Generated {filename} (BPM={bpm})")

def generate_edm_track(filename, duration_sec=45, bpm=128):
    total_samples = int(duration_sec * sr)
    left = np.zeros(total_samples)
    right = np.zeros(total_samples)
    
    beat_dur = 60.0 / bpm
    sixteenth = beat_dur / 4.0
    num_beats = int(duration_sec / beat_dur)
    
    # EDM 4-on-the-floor
    for b in range(num_beats):
        t_start = b * beat_dur
        s_start = int(t_start * sr)
        
        # Four on the floor kick
        k_len = int(0.25 * sr)
        if s_start + k_len < total_samples:
            t = np.linspace(0, 0.25, k_len)
            k = create_kick(t) * 0.95
            left[s_start:s_start+k_len] += k
            right[s_start:s_start+k_len] += k
            
        # Clap on beats 2 and 4
        if b % 2 == 1:
            sn_len = int(0.2 * sr)
            if s_start + sn_len < total_samples:
                t = np.linspace(0, 0.2, sn_len)
                sn = create_snare(t) * 0.65
                left[s_start:s_start+sn_len] += sn
                right[s_start:s_start+sn_len] += sn
                
        # Offbeat open hi-hat
        off_time = t_start + beat_dur * 0.5
        off_idx = int(off_time * sr)
        off_len = int(0.2 * sr)
        if off_idx + off_len < total_samples:
            t = np.linspace(0, 0.2, off_len)
            oh = create_hihat(t, open_hat=True) * 0.4
            left[off_idx:off_idx+off_len] += oh * 0.6
            right[off_idx:off_idx+off_len] += oh * 0.8
            
        # Synth chord arpeggio
        chords = [
            [440.0, 554.37, 659.25], # A maj
            [369.99, 440.0, 554.37], # F# min
            [293.66, 369.99, 440.0], # D maj
            [329.63, 415.30, 493.88]  # E maj
        ]
        chord = chords[(b // 4) % len(chords)]
        for step in range(4):
            note_time = t_start + step * sixteenth
            n_idx = int(note_time * sr)
            n_len = int(0.12 * sr)
            if n_idx + n_len < total_samples:
                t = np.linspace(0, 0.12, n_len)
                f = chord[step % 3] * (2.0 if step == 3 else 1.0)
                saw = 2 * (f * t - np.floor(0.5 + f * t))
                env = np.exp(-t * 18)
                left[n_idx:n_idx+n_len] += saw * env * 0.3
                right[n_idx:n_idx+n_len] += saw * env * 0.35

    max_val = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-4)
    left = (left / max_val * 0.92 * 32767).astype(np.int16)
    right = (right / max_val * 0.92 * 32767).astype(np.int16)
    stereo = np.column_stack((left, right))
    
    wav_path = filename.replace('.mp3', '.wav')
    wavfile.write(wav_path, sr, stereo)
    subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-b:a', '192k', filename], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(wav_path):
        os.remove(wav_path)
    print(f"Generated {filename} (BPM={bpm})")

if __name__ == '__main__':
    os.makedirs('/home/xasanboy/audi_player/tracks', exist_ok=True)
    generate_phonk_track('/home/xasanboy/audi_player/tracks/cyber_phonk_140.mp3', 45, 140)
    generate_edm_track('/home/xasanboy/audi_player/tracks/future_idol_128.mp3', 45, 128)
