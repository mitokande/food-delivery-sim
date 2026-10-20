#!/usr/bin/env python3
"""Download every source listed in sources.json into $AUDIO_DL (default /tmp/fds-audio-dl).

  python3 -I fetch.py info fs:127592 oga:bossa-nova kenney:ui-audio   # show title/author/licence only
  python3 -I fetch.py get [kenney] [freesound] [oga]                   # download everything in sources.json (or one host)

Rules enforced here:
  * Freesound / OpenGameArt: the sound's own page must carry the CC0 / public-domain licence link,
    otherwise the item is refused (nothing downloaded).  Freesound items use the HQ preview mp3
    (128 kbps) because the original file needs a login.
  * Kenney: packs are CC0 (License.txt is saved next to the files).
  * Each source goes to its own folder with a meta.json (title, author, page url, licence url).
Downloaded files are data only -- nothing in them is ever executed.
"""
import json, os, re, sys, time, html, zipfile, urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.environ.get("AUDIO_DL", "/tmp/fds-audio-dl")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CC0_MARKS = ("creativecommons.org/publicdomain/zero", "licenses/publicdomain")
_last = [0.0]

_final = [None]
def http(url, binary=False, gap=3.0):
    for attempt in range(6):
        wait = gap - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            r = urllib.request.urlopen(req, timeout=120)
            _final[0] = r.geturl()
            data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("rate limited: " + url)

def strip(s): return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()

def fs_info(sid):
    # the canonical page URL needs the username; /s/<id>/ redirects to it
    h = http(f"https://freesound.org/s/{sid}/")
    page = _final[0] or f"https://freesound.org/s/{sid}/"
    t = strip(re.search(r"<title>(.*?)</title>", h, re.S).group(1))          # "Freesound - <title> by <user>"
    user = re.search(r"/people/([^/]+)/sounds/", page).group(1)
    title = re.sub(r"^Freesound - ", "", t)
    title = title[: -len(" by " + user)] if title.endswith(" by " + user) else title
    mp3 = re.search(r'data-mp3="([^"]+)"', h)
    lic = [u for u in re.findall(r'href="(https?://creativecommons.org/[^"]+)"', h)]
    ok = any(any(k in u for k in CC0_MARKS) for u in lic)
    dur = re.search(r'data-duration="([^"]+)"', h)
    return dict(source="freesound", id=str(sid), title=title, author=user, page=page,
                license_url=lic[0] if lic else None, cc0=ok,
                preview=(mp3.group(1).replace("-lq.", "-hq.") if mp3 else None),
                duration=float(dur.group(1)) if dur else None)

def oga_info(slug):
    page = f"https://opengameart.org/content/{slug}"
    h = http(page)
    title = strip(re.search(r"<title>(.*?)</title>", h, re.S).group(1)).replace(" | OpenGameArt.org", "")
    au = re.search(r'<a href="/users/([^"]+)"[^>]*>([^<]*)</a>', h)
    lic = re.findall(r"href='(https?://creativecommons.org/[^']+)'", h) + re.findall(r'href="(https?://creativecommons.org/[^"]+)"', h)
    ok = any(any(k in u for k in CC0_MARKS) for u in lic) and len(set(lic)) == 1
    files = [u for u in re.findall(r'<a href="(https://opengameart.org/sites/default/files/[^"]+)"[^>]*download', h)]
    return dict(source="opengameart", id=slug, title=title, author=strip(au.group(2)) if au else "?", page=page,
                license_url=lic[0] if lic else None, cc0=ok, files=files)

def kenney_info(slug):
    page = f"https://kenney.nl/assets/{slug}"
    h = http(page)
    z = re.findall(r'https://kenney.nl/media/pages/assets/[^"]+\.zip', h)
    title = strip(re.search(r"<title>(.*?)</title>", h, re.S).group(1))
    return dict(source="kenney", id=slug, title=title, author="Kenney (kenney.nl)", page=page,
                license_url="https://creativecommons.org/publicdomain/zero/1.0/", cc0=bool(re.search(r"CC0", h)),
                files=sorted(set(z)))

def info(key):
    kind, ident = key.split(":", 1)
    return {"fs": fs_info, "oga": oga_info, "kenney": kenney_info}[kind](ident)

def get(key):
    kind, ident = key.split(":", 1)
    out = os.path.join(DL, f"{kind}_{re.sub(r'[^A-Za-z0-9_.-]', '_', ident)}")
    if os.path.exists(os.path.join(out, "meta.json")):
        return out
    m = info(key)
    if not m["cc0"]:
        raise SystemExit(f"REFUSED {key}: CC0 licence not confirmed on {m['page']} ({m['license_url']})")
    os.makedirs(out, exist_ok=True)
    if kind == "fs":
        if not m["preview"]: raise SystemExit(f"no preview for {key}")
        data = http(m["preview"], binary=True, gap=1.0)
        open(os.path.join(out, "hq.mp3"), "wb").write(data)
    else:
        for u in m["files"]:
            data = http(u, binary=True, gap=1.0)
            name = os.path.basename(urllib.parse.unquote(u))
            p = os.path.join(out, name)
            open(p, "wb").write(data)
            if name.lower().endswith(".zip"):
                with zipfile.ZipFile(p) as z:
                    root = os.path.realpath(out)
                    for n in z.namelist():           # zip-slip guard
                        if not os.path.realpath(os.path.join(root, n)).startswith(root + os.sep): continue
                        z.extract(n, out)
                os.remove(p)
    json.dump(m, open(os.path.join(out, "meta.json"), "w"), indent=1)
    print("ok", key, "->", out, "|", m["title"], "|", m["author"])
    return out

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "info":
        for k in sys.argv[2:]:
            try:
                m = info(k)
                print(f"{k:<40} cc0={m['cc0']!s:<5} {m['author']:<22} {m['title'][:70]}  files={len(m.get('files', []))} dur={m.get('duration')}")
            except Exception as e:
                print(k, "ERR", e)
    else:
        src = json.load(open(os.path.join(HERE, "sources.json")))
        only = set(sys.argv[2:])        # optional: "get oga" / "get freesound" to restrict (lets hosts run in parallel)
        keys = (["kenney:" + s for s in src.get("kenney", [])] if not only or "kenney" in only else []) \
             + (["fs:" + str(s) for s in src.get("freesound", [])] if not only or "freesound" in only else []) \
             + (["oga:" + s for s in src.get("oga", [])] if not only or "oga" in only else [])
        for k in keys:
            try: get(k)
            except SystemExit as e: print(e)
            except Exception as e: print("ERR", k, e)
