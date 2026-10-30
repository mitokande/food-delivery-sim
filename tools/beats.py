"""Beat grid of a song, for cutting a clip to it (tools/losercut.mjs).

    python3 tools/beats.py <song> [out.json]

Prints the tempo, where the bars fall and how loud each bar is (the loud stretches are the chorus candidates), and
writes { tempo, beats, downbeats, bars: [{ t, rms }] } as JSON. Downbeats are a guess: of the four ways to group the
beats into bars, the one whose first beats carry the most low-end onset energy (the kick usually lands on one).
Needs librosa (pip install --target <dir> librosa; then PYTHONPATH=<dir>).
"""
import json, sys
import numpy as np
import librosa

path = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
y, sr = librosa.load(path, sr=22050, mono=True)
tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames", tightness=120)
beats = librosa.frames_to_time(beat_frames, sr=sr)
tempo = float(np.atleast_1d(tempo)[0])

# low-end onsets (kick) at each beat, to find which beat of four is the one
low = librosa.onset.onset_strength(y=y, sr=sr, fmax=200, n_mels=32)
at = low[np.clip(beat_frames, 0, len(low) - 1)]
phase = int(np.argmax([at[p::4].mean() for p in range(4)]))
downbeats = beats[phase::4]

rms = librosa.feature.rms(y=y)[0]
rt = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
bars = []
for i, t in enumerate(downbeats):
    t1 = downbeats[i + 1] if i + 1 < len(downbeats) else t + 4 * 60 / tempo
    sel = (rt >= t) & (rt < t1)
    bars.append({"t": round(float(t), 3), "rms": round(float(rms[sel].mean()) if sel.any() else 0.0, 4)})

peak = max(b["rms"] for b in bars) or 1
print(f"tempo {tempo:.1f} BPM · {len(beats)} beats · bar = {4 * 60 / tempo:.2f} s · downbeat phase {phase}")
for i, b in enumerate(bars):
    print(f"bar {i:3d}  {b['t']:7.2f} s  {'#' * round(40 * b['rms'] / peak)}")
data = {"tempo": tempo, "beats": [round(float(t), 3) for t in beats], "downbeats": [round(float(t), 3) for t in downbeats], "bars": bars}
if out:
    with open(out, "w") as f: json.dump(data, f)
