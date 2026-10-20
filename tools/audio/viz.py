#!/usr/bin/env python3
"""Debug helper: waveform + spectrogram PNG of an audio file (or a slice).
   python3 -I viz.py in.mp3 out.png [start_s] [dur_s] [maxfreq_hz]"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import decode, SR
from PIL import Image, ImageDraw

def render(x, out, sr=SR, maxf=8000, W=1400, H_WAVE=160, H_SPEC=320):
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = len(m)
    img = Image.new("RGB", (W, H_WAVE + H_SPEC + 24), (20, 20, 24))
    d = ImageDraw.Draw(img)
    # waveform
    step = max(1, n // W)
    for px in range(W):
        seg = m[px * step:(px + 1) * step]
        if len(seg) == 0: break
        lo, hi = seg.min(), seg.max()
        d.line([(px, H_WAVE / 2 - hi * H_WAVE / 2), (px, H_WAVE / 2 - lo * H_WAVE / 2)], fill=(90, 200, 255))
    d.line([(0, H_WAVE / 2), (W, H_WAVE / 2)], fill=(60, 60, 70))
    # spectrogram
    nfft = 2048; hop = max(32, n // W)
    win = np.hanning(nfft)
    cols = []
    for px in range(W):
        i = px * hop
        fr = m[i:i + nfft]
        if len(fr) < nfft: fr = np.pad(fr, (0, nfft - len(fr)))
        cols.append(np.abs(np.fft.rfft(fr * win)))
    S = 20 * np.log10(np.array(cols).T + 1e-9)
    f = np.fft.rfftfreq(nfft, 1 / sr)
    kmax = np.searchsorted(f, maxf)
    S = S[:kmax]
    S = np.clip((S - (S.max() - 80)) / 80, 0, 1)
    rows = np.linspace(kmax - 1, 0, H_SPEC).astype(int)
    pic = (S[rows] * 255).astype(np.uint8)
    cm = np.stack([pic, (pic.astype(float) ** 1.3 / 255 ** 0.3).astype(np.uint8) * 0 + pic // 2, 255 - pic], axis=-1)
    img.paste(Image.fromarray(cm), (0, H_WAVE + 24))
    d.text((4, H_WAVE + 6), f"{n / sr:.2f}s  0-{maxf}Hz  peak {20*np.log10(np.abs(m).max()+1e-9):.1f} dB", fill=(220, 220, 220))
    img.save(out)

if __name__ == "__main__":
    p, out = sys.argv[1], sys.argv[2]
    ss = float(sys.argv[3]) if len(sys.argv) > 3 else None
    dur = float(sys.argv[4]) if len(sys.argv) > 4 else None
    maxf = float(sys.argv[5]) if len(sys.argv) > 5 else 8000
    render(decode(p, mono=True, ss=ss, t=dur), out, maxf=maxf)
