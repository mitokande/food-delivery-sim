"""Shared DSP helpers for the Food Delivery Simulator audio build (numpy/scipy + ffmpeg)."""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import os, subprocess, tempfile, json
import numpy as np
from scipy import signal

SR = 44100

# ---------------------------------------------------------------- IO
def decode(path, sr=SR, mono=False, ss=None, t=None):
    """Decode any audio file with ffmpeg -> float32 array shaped (n, ch)."""
    cmd = ["ffmpeg", "-v", "error", "-nostdin"]
    if ss is not None: cmd += ["-ss", str(ss)]
    if t is not None: cmd += ["-t", str(t)]
    cmd += ["-i", path, "-vn", "-ar", str(sr)]
    if mono: cmd += ["-ac", "1"]
    cmd += ["-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    ch = 1 if mono else probe_channels(path)
    x = np.frombuffer(raw, dtype="<f4").reshape(-1, ch).astype(np.float64)
    return x

def probe_channels(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                          "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    return int(out.split(",")[0])

def encode_mp3(x, out, sr=SR, kbps=96, mono=True):
    """x: (n,) or (n,ch) float in [-1,1].  Writes MP3 with LAME gapless header."""
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    if mono and x.shape[1] > 1: x = x.mean(axis=1, keepdims=True)
    ch = x.shape[1]
    cmd = ["ffmpeg", "-v", "error", "-y", "-nostdin", "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "-i", "-",
           "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-ar", str(sr), "-ac", str(ch), "-id3v2_version", "0",
           "-write_id3v1", "0", out]
    subprocess.run(cmd, input=x.astype("<f4").tobytes(), check=True)

def _crc16_le(data, crc=0):
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc

def patch_lame_gapless(path, extra_delay, extra_padding):
    """Tell gapless-aware decoders (Chrome/ffmpeg, Firefox, Safari/CoreAudio) to additionally skip `extra_delay` samples
    at the start and `extra_padding` at the end, by editing the encoder-delay/padding fields of the LAME/Info tag
    that ffmpeg wrote (and fixing the tag CRC).  Max 4095 per field."""
    d = bytearray(open(path, "rb").read())
    i = d.find(b"Info", 0, 64)
    if i < 0: i = d.find(b"Xing", 0, 64)
    if i < 0: raise RuntimeError("no Xing/Info frame in " + path)
    o = i + 141
    v = int.from_bytes(d[o:o + 3], "big"); delay, pad = v >> 12, v & 0xFFF
    delay += extra_delay; pad += extra_padding
    if delay > 4095 or pad > 4095: raise RuntimeError(f"gapless field overflow {delay}/{pad}")
    d[o:o + 3] = ((delay << 12) | pad).to_bytes(3, "big")
    # tag CRC: CRC-16 (poly 0xA001 reflected, init 0) over the first 190 bytes of the frame with the CRC field zeroed
    d[i + 154:i + 156] = b"\0\0"
    d[i + 154:i + 156] = _crc16_le(bytes(d[:190])).to_bytes(2, "big")
    open(path, "wb").write(bytes(d))

def encode_loop_mp3(x, out, sr=SR, kbps=96, mono=True, pre=2048, post=2048):
    """Encode a loop so that the MP3 codec's start/end artefacts fall into regions the decoder is told to discard.
    The file holds [last `pre` samples][loop][first `post` samples]; the LAME tag makes gapless decoders skip those
    extras, so the decoded buffer is exactly the loop and its seam is as clean as the PCM was."""
    n = len(x)
    pre = min(pre, n); post = min(post, n)
    ext = np.concatenate([x[-pre:], x, x[:post]])
    encode_mp3(ext, out, sr=sr, kbps=kbps, mono=mono)
    patch_lame_gapless(out, pre, post)

def write_wav(x, path, sr=SR):
    import wave
    x = np.clip(x, -1, 1)
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype("<i2").tobytes())

# ---------------------------------------------------------------- loudness (ITU-R BS.1770-4)
def _kfilter(x, sr=SR):
    # stage 1 high shelf
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40); w0 = 2 * np.pi * fc / sr; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    y = signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)
    # stage 2 high pass (RLB)
    Q, fc = 0.5003270373238773, 38.13547087613982
    w0 = 2 * np.pi * fc / sr; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], y, axis=0)

def lufs(x, sr=SR):
    """Integrated loudness. Sounds shorter than one 400 ms block are measured over their own length."""
    x = x if x.ndim == 2 else x[:, None]
    y = _kfilter(x, sr)
    n = len(y); blk = int(0.4 * sr); hop = int(0.1 * sr)
    if n < blk:
        ms = np.mean(np.sum(y ** 2, axis=1)) if n else 1e-12
        return -0.691 + 10 * np.log10(ms + 1e-12)
    zs = []
    for i in range(0, n - blk + 1, hop):
        zs.append(np.sum(np.mean(y[i:i + blk] ** 2, axis=0)))
    zs = np.array(zs)
    l = -0.691 + 10 * np.log10(zs + 1e-12)
    zs1 = zs[l > -70]
    if len(zs1) == 0: return -70.0
    rel = -0.691 + 10 * np.log10(zs1.mean()) - 10
    zs2 = zs1[-0.691 + 10 * np.log10(zs1) > rel]
    return -0.691 + 10 * np.log10(zs2.mean() + 1e-12)

def peak_db(x):
    return 20 * np.log10(np.max(np.abs(x)) + 1e-12)

def true_peak_db(x):
    x = x if x.ndim == 2 else x[:, None]
    up = signal.resample_poly(x, 4, 1, axis=0)
    return peak_db(up)

def limiter(x, ceiling_db=-1.5, look_ms=3.0, rel_ms=80.0, sr=SR):
    """Look-ahead peak limiter working on a smoothed gain envelope (vectorised, no clipping)."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    c = 10 ** (ceiling_db / 20)
    x2 = x if x.ndim == 2 else x[:, None]
    pk = np.max(np.abs(x2), axis=1)
    lg = np.log(np.minimum(1.0, c / np.maximum(pk, 1e-9)))            # <= 0
    L = max(1, int(look_ms * sr / 1000))
    lg = minimum_filter1d(lg, size=2 * L + 1, mode="nearest")
    lg = uniform_filter1d(lg, size=2 * L + 1, mode="nearest")          # attack ramps in before the peak
    # release: env[i] = min(lg[i], env[i-1] + r)  ==  i*r + cummin(lg - j*r)
    r = 4.0 / (rel_ms * sr / 1000)
    idx = np.arange(len(lg))
    env = np.minimum(0.0, idx * r + np.minimum.accumulate(lg - idx * r))
    env = np.minimum(env, lg)
    g = np.exp(env)
    y = x2 * g[:, None]
    # tiny safety: smoothing could leave a hair over the ceiling
    over = np.max(np.abs(y))
    if over > c: y *= c / over
    return y if x.ndim == 2 else y[:, 0]

def softclip(x, ceiling_db, knee_db=-6.0):
    """tanh knee: linear below ceiling+knee, asymptotically approaches the ceiling above it."""
    c = 10 ** (ceiling_db / 20); k = c * 10 ** (knee_db / 20)
    a = np.abs(x)
    y = np.where(a <= k, a, k + (c - k) * np.tanh((a - k) / (c - k)))
    return np.sign(x) * y

def limit_chain(x, ceiling_db, sr=SR):
    """look-ahead limiter to ceiling+3 dB, then a soft knee for the last few dB of the sharpest transients."""
    y = limiter(x, ceiling_db + 3.0, sr=sr) if peak_db(x) > ceiling_db + 3.0 else x
    return softclip(y, ceiling_db) if peak_db(y) > ceiling_db else y

def normalise(x, target_lufs, ceiling_db=-1.5, sr=SR, max_gain_db=36, max_over_db=9.0):
    """Gain to target LUFS, peaks held under the ceiling.  Transient-heavy sounds would end up quieter than the target
    once limited, so the gain is raised until the *limited* signal reaches the target, but never asking for more than
    max_over_db of peak reduction (keeps transients recognisable).  Returns (y, measured_lufs_before, gain_db)."""
    l0 = lufs(x, sr)
    g = max(-60, min(max_gain_db, target_lufs - l0))
    y = x * 10 ** (g / 20)
    if peak_db(y) <= ceiling_db:
        return y, l0, g
    best = None
    g_cap = ceiling_db + max_over_db - peak_db(x)            # gain at which the peak is max_over_db above the ceiling
    if g_cap < g:                                            # extreme crest factor: stay at the cap
        yy = limit_chain(x * 10 ** (g_cap / 20), ceiling_db, sr=sr)
        return yy, l0, g_cap
    for step in range(0, 25):
        gg = g + step * 0.5
        if peak_db(x * 10 ** (gg / 20)) - ceiling_db > max_over_db: break
        yy = limit_chain(x * 10 ** (gg / 20), ceiling_db, sr=sr)
        l1 = lufs(yy, sr)
        if best is None or abs(l1 - target_lufs) < abs(best[1] - target_lufs): best = (yy, l1, gg)
        if l1 >= target_lufs - 0.2: break
    y, l1, g = best
    return y, l0, g

# ---------------------------------------------------------------- editing
def trim_silence(x, thresh_db=-45, pad_ms=(5, 40), sr=SR):
    """trim leading/trailing samples below thresh_db *relative to the peak*"""
    m = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    idx = np.where(m > m.max() * 10 ** (thresh_db / 20))[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] - int(pad_ms[0] * sr / 1000)); b = min(len(x), idx[-1] + int(pad_ms[1] * sr / 1000))
    return x[a:b]

def fade(x, in_ms=3, out_ms=30, sr=SR):
    y = x.copy().astype(np.float64)
    n = len(y)
    fi = min(n // 2, int(in_ms * sr / 1000)); fo = min(n // 2, int(out_ms * sr / 1000))
    if fi > 0:
        w = np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
        y[:fi] *= (w[:, None] if y.ndim == 2 else w)
    if fo > 0:
        w = np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
        y[n - fo:] *= (w[:, None] if y.ndim == 2 else w)
    return y

def hp(x, f, sr=SR, order=2):
    sos = signal.butter(order, f, "highpass", fs=sr, output="sos"); return signal.sosfilt(sos, x, axis=0)
def lp(x, f, sr=SR, order=2):
    sos = signal.butter(order, f, "lowpass", fs=sr, output="sos"); return signal.sosfilt(sos, x, axis=0)
def bp(x, f1, f2, sr=SR, order=2):
    sos = signal.butter(order, [f1, f2], "bandpass", fs=sr, output="sos"); return signal.sosfilt(sos, x, axis=0)

def to_mono(x): return x.mean(axis=1) if x.ndim == 2 else x

# ---------------------------------------------------------------- looping
def make_loop_xfade(x, s, e, fade_len, power=False):
    """Loop = x[s:e] where the head is cross-faded with the material *after* the loop end (x[e:e+F]),
    so the seam e-1 -> s is the original continuous signal.  Needs e+F <= len(x)."""
    F = fade_len
    assert e + F <= len(x), "not enough material after loop end"
    seg = x[s:e].copy()
    t = np.linspace(0, 1, F, endpoint=False)
    if power:  w_in, w_out = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)       # equal power (uncorrelated noise)
    else:      w_in, w_out = t, 1 - t                                           # equal gain (correlated)
    if x.ndim == 2: w_in, w_out = w_in[:, None], w_out[:, None]
    seg[:F] = seg[:F] * w_in + x[e:e + F] * w_out
    return seg

def find_loop(m, lo_s, hi_s, F, sr=SR, search_start=None, step=None):
    """Find (s, e) in mono signal m maximising similarity of m[s:s+F] and m[e:e+F]
    with loop length (e-s) in [lo_s, hi_s] seconds.  Returns (s, e, score)."""
    lo, hi = int(lo_s * sr), int(hi_s * sr)
    starts = np.arange(search_start[0] if search_start else 0, (search_start[1] if search_start else len(m) - hi - F), step or max(1, F // 8))
    best = (None, None, -2)
    w = np.hanning(F)
    for s in starts:
        a = m[s:s + F] * w * w
        na = np.linalg.norm(m[s:s + F] * w) + 1e-12
        # candidate ends e in [s+lo, s+hi]
        e0, e1 = s + lo, min(s + hi, len(m) - F)
        if e1 <= e0: continue
        seg = m[e0:e1 + F]
        # normalised cross-correlation via FFT
        c = signal.fftconvolve(seg, (a)[::-1], mode="valid")
        # energy of each window (weighted by w^2)
        en = np.sqrt(signal.fftconvolve(seg ** 2, (w ** 2)[::-1], mode="valid") + 1e-12)
        sc = c / (na * en)
        k = int(np.argmax(sc))
        if sc[k] > best[2]: best = (int(s), int(e0 + k), float(sc[k]))
    return best

def snap_zero(m, i, win=200):
    """nearest upward zero crossing near i"""
    a = max(1, i - win); b = min(len(m) - 1, i + win)
    z = np.where((m[a - 1:b - 1] < 0) & (m[a:b] >= 0))[0]
    if len(z) == 0: return i
    return a + int(z[np.argmin(np.abs(z + a - i))])

def fundamental(x, sr=SR, fmin=20, fmax=600):
    """Dominant periodicity (Hz) of a mono loop from autocorrelation of the (circular) loop."""
    m = to_mono(x); m = m - m.mean()
    ac = np.fft.irfft(np.abs(np.fft.rfft(m, 2 * len(m))) ** 2)[:len(m)]
    ac /= ac[0] + 1e-12
    lo, hi = int(sr / fmax), int(sr / fmin)
    seg = ac[lo:hi]
    k = int(np.argmax(seg)) + lo
    return sr / k, float(ac[k])

def spectral_peak(x, sr=SR, fmin=40, fmax=2000):
    m = to_mono(x) * np.hanning(len(x))
    sp = np.abs(np.fft.rfft(m, 1 << 18)); f = np.fft.rfftfreq(1 << 18, 1 / sr)
    k = (f >= fmin) & (f <= fmax)
    return float(f[k][np.argmax(sp[k])])
