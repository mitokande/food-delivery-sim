#!/usr/bin/env python3
"""Rebuild assets/audio from the downloaded sources + synthesis.

  python3 -I fetch.py get                                 # 1) download + licence-check every source in sources.json
  AUDIO_DL=/tmp/fds-audio-dl python3 -I build.py          # 2) everything -> assets/audio (mp3s, manifest.json, CREDITS-audio.md)
  AUDIO_DL=... python3 -I build.py engine-moped boost     #    or just some files (manifest/credits are updated for those)
  AUDIO_OUT=/tmp/out ...                                  #    write somewhere else for experiments

Everything is deterministic (fixed RNG seed), so a rebuild reproduces the same files.
"""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core
import recipes                                  # registers every recipe
from core import REG, render, OUT, DL, HERE

META_CACHE = os.path.join(HERE, "sources-meta.json")
SRC_ID = {"fs": lambda s: f"freesound:{s[1]}", "kenney": lambda s: f"kenney:{s[1]}", "oga": lambda s: f"opengameart:{s[1]}", "synth": lambda s: "synth"}

def source_meta(kind, ident):
    """title/author/page/licence of one source (from the fetch.py download folder, else the committed cache)."""
    folder = {"fs": "fs", "kenney": "kenney", "oga": "oga"}[kind]
    p = os.path.join(DL, f"{folder}_{ident}", "meta.json")
    if os.path.exists(p): return json.load(open(p))
    cache = json.load(open(META_CACHE)) if os.path.exists(META_CACHE) else {}
    return cache.get(f"{kind}:{ident}")

def write_credits(names, manifest):
    used, rows = {}, []
    for n in names:
        r = REG[n]
        srcs, authors, lic, parts = [], [], set(), []
        for s in r["src"]:
            kind, ident, detail = s
            if kind == "synth":
                parts.append(f"synthesised ({ident}{', ' + detail if detail else ''})")
                authors.append("generated in this repo"); lic.add("own work, released CC0")
                continue
            m = source_meta(kind, ident)
            used[f"{kind}:{ident}"] = m
            label = {"fs": f"Freesound #{ident}", "kenney": "Kenney", "oga": "OpenGameArt"}[kind]
            parts.append(f"[{m['title']}]({m['page']}) ({label}; {detail})")
            authors.append(m["author"]); lic.add("CC0 1.0")
        rows.append((n, "<br>".join(parts), ", ".join(dict.fromkeys(authors)), " / ".join(sorted(lic)), r["edit"]))
    out = ["# Audio credits - Food Delivery Simulator", "",
           "Everything in `assets/audio/` is either **CC0 1.0 (public domain dedication)** material from the sources below, or sounds",
           "**synthesised in this repository** (`tools/audio/synth.py`, `tools/audio/recipes.py`, released CC0 as well).",
           "No attribution is required; credit is given here anyway. The CC0 licence of every downloaded sound was verified on its own",
           f"source page by `tools/audio/fetch.py` (build of {datetime.date.today().isoformat()}). Freesound items are the site's HQ preview",
           "(128 kbps MP3 decoded and re-encoded) because original downloads need a login; Kenney packs and OpenGameArt files are the originals.", "",
           "Output format: MP3 (LAME via ffmpeg, 44.1 kHz, gapless header). One-shots are mono 96 kbps, engines mono 96 kbps, ambience and music stereo 128 kbps.",
           "Loops are encoded with 2048 extra samples of their own wrap-around material before/after the loop and a LAME tag that tells gapless decoders to skip them,",
           "so the decoded buffer is exactly the loop (`dur` in manifest.json) and the MP3 codec's start/end artefacts never reach the seam.",
           "In manifest.json, `hz` of an engine loop is the pulse (firing) frequency of the loop in Hz (for `engine-electric`: the 110 Hz motor hum), `gain` is a suggested mix gain.",
           "Loudness (ITU-R BS.1770 integrated): one-shots about -16 LUFS, engines -20, ambience -26, music -18; sample peaks <= -1.5 dBFS before encoding, true peak <= -1 dBFS after.", "",
           "## Files", "", "| File | Source(s) | Author | Licence | What was changed |", "|---|---|---|---|---|"]
    for n, s, a, l, e in rows:
        out.append(f"| `{n}.mp3` | {s} | {a} | {l} | {e} |")
    out += ["", "## Source pages", ""]
    for k, m in sorted(used.items()):
        kind, ident = k.split(":", 1)
        label = {"fs": f"Freesound #{ident}", "kenney": "Kenney pack", "oga": "OpenGameArt"}[kind]
        out.append(f"- **{m['title']}** - {m['author']} - <{m['page']}> - licence <{m['license_url']}> ({label})")
    out += ["", "## Courtesy notes (not required by CC0)", "",
            "- `music-hub` - the author of *happy lofi day* (Tarush Singhal) writes on the OpenGameArt page \"let me know if you use this!\".",
            "- `music-ride` - *Wednesday Night [Funk Fusion]* is by Zane Little Music, who supports his free releases via Ko-Fi.",
            "- Kenney (kenney.nl) asks for no credit but welcomes support at <https://kenney.nl/support>."]
    open(os.path.join(OUT, "CREDITS-audio.md"), "w").write("\n".join(out) + "\n")
    # keep a small committed cache so credits can be regenerated without re-downloading
    cache = json.load(open(META_CACHE)) if os.path.exists(META_CACHE) else {}
    for k, m in used.items():
        cache[k] = {x: m.get(x) for x in ("source", "id", "title", "author", "page", "license_url")}
    json.dump(cache, open(META_CACHE, "w"), indent=1, sort_keys=True)

def main(names):
    names = names or list(REG)
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for n in names:
        info = render(n)
        r = REG[n]
        manifest[n] = {"file": info["file"], "loop": info["loop"], "gain": r["gain"], "dur": info["dur"],
                       **({"hz": info["hz"]} if "hz" in info else {}),
                       "src": "+".join(dict.fromkeys(SRC_ID[s[0]](s) for s in r["src"])),
                       "lufs": info["lufs"], "peak": info["peak"], "ch": info["ch"], "kb": round(info["bytes"] / 1024, 1)}
    ordered = {k: manifest[k] for k in REG if k in manifest}
    json.dump(ordered, open(mpath, "w"), indent=1)
    write_credits([k for k in REG if k in ordered], ordered)
    if len(names) == len(REG):                                        # full build: keep sources.json = exactly what is used
        used = {"kenney": set(), "freesound": set(), "oga": set()}
        for r in REG.values():
            for kind, ident, _ in r["src"]:
                if kind == "kenney": used["kenney"].add(ident)
                elif kind == "fs": used["freesound"].add(int(ident))
                elif kind == "oga": used["oga"].add(ident)
        json.dump({k: sorted(v) for k, v in used.items()}, open(os.path.join(HERE, "sources.json"), "w"), indent=1)
    tot = sum(os.path.getsize(os.path.join(OUT, v["file"])) for v in ordered.values())
    print(f"\n{len(ordered)} files, {tot/1024/1024:.2f} MB total -> {OUT}")

if __name__ == "__main__":
    main(sys.argv[1:])
