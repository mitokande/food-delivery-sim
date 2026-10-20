#!/usr/bin/env python3
"""Debug helper: contact sheet of spectrogram thumbnails.
   python3 -I sheet.py out.png file[@start@dur] file2 ...   (max ~12 per sheet)"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import decode, SR
from PIL import Image, ImageDraw

def thumb(x, label, W=620, Hw=70, Hs=150, maxf=8000, sr=SR):
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = len(m)
    img = Image.new("RGB", (W, Hw + Hs + 16), (20, 20, 24)); d = ImageDraw.Draw(img)
    step = max(1, n // W)
    for px in range(W):
        seg = m[px * step:(px + 1) * step]
        if len(seg) == 0: break
        d.line([(px, Hw / 2 - seg.max() * Hw / 2), (px, Hw / 2 - seg.min() * Hw / 2)], fill=(90, 200, 255))
    nfft = 1024; hop = max(128, n // W); win = np.hanning(nfft); cols = []
    for px in range(W):
        fr = m[px * hop:px * hop + nfft]
        if len(fr) < nfft: fr = np.pad(fr, (0, nfft - len(fr)))
        cols.append(np.abs(np.fft.rfft(fr * win)))
    S = 20 * np.log10(np.array(cols).T + 1e-9); f = np.fft.rfftfreq(nfft, 1 / sr); k = np.searchsorted(f, maxf)
    S = np.clip((S[:k] - (S.max() - 70)) / 70, 0, 1)
    pic = (S[np.linspace(k - 1, 0, Hs).astype(int)] * 255).astype(np.uint8)
    img.paste(Image.fromarray(np.stack([pic, pic // 2, 255 - pic], -1)), (0, Hw + 16))
    d.text((3, Hw + 3), f"{label}  {n / sr:.2f}s pk{20 * np.log10(np.abs(m).max() + 1e-9):.0f}dB", fill=(255, 255, 160))
    return img

if __name__ == "__main__":
    out = sys.argv[1]; imgs = []
    for a in sys.argv[2:]:
        p, *r = a.split("@"); ss = float(r[0]) if r else None; du = float(r[1]) if len(r) > 1 else None
        try: x = decode(p, mono=True, ss=ss, t=du)
        except Exception as e: print("skip", a, e); continue
        imgs.append(thumb(x, (os.path.basename(os.path.dirname(p)) if os.path.basename(p) in ("hq.mp3",) else os.path.basename(p)) + (f"@{ss}" if ss else "")))
    cols = 2; rows = (len(imgs) + cols - 1) // cols
    w, h = imgs[0].size
    sheet = Image.new("RGB", (w * cols, h * rows), (0, 0, 0))
    for i, im in enumerate(imgs): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out)
