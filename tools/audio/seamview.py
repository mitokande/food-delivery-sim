#!/usr/bin/env python3
"""Debug helper: spectrogram/waveform of the loop seam (file tiled twice, +-secs around the join).
   python3 -I seamview.py loop.mp3 out.png [secs=3] [maxfreq=8000]"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import decode, SR
from viz import render
from PIL import Image, ImageDraw
p, out = sys.argv[1], sys.argv[2]
secs = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
maxf = float(sys.argv[4]) if len(sys.argv) > 4 else 8000
x = decode(p); m = x.mean(axis=1)
N = len(m); t = np.concatenate([m, m])
a = max(0, N - int(secs * SR)); b = min(len(t), N + int(secs * SR))
render(t[a:b], out, maxf=maxf)
im = Image.open(out); d = ImageDraw.Draw(im); xs = int(im.width * (N - a) / (b - a))
d.line([(xs, 0), (xs, im.height)], fill=(255, 255, 0), width=1); im.save(out)
