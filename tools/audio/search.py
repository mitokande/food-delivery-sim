#!/usr/bin/env python3
"""Source-hunting helper (research only, not needed to rebuild).

  python3 -I search.py fs  "moped idle"  [page]   # Freesound, CC0 filter, prints id/user/dur/title
  python3 -I search.py oga "ukulele"     [page]   # OpenGameArt audio, CC0 filter

Output is just text for a human/agent to pick from; the licence is re-verified on the
sound's own page by fetch.py before anything is downloaded.
"""
import re, sys, time, html, urllib.request, urllib.error, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_last = [0.0]
def get(url, gap=4.0):
    """GET with a polite minimum gap between requests and backoff on HTTP 429."""
    for attempt in range(6):
        wait = gap - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("rate limited: " + url)

def fs(q, page=1):
    url = "https://freesound.org/search/?" + urllib.parse.urlencode({
        "q": q, "f": 'license:"Creative Commons 0"', "s": "score desc", "advanced": 0, "g": 1, "page": page})
    h = get(url)
    # each result player block carries data-* attributes
    for m in re.finditer(r'data-sound-id="(\d+)"\s+data-username="([^"]*)".*?data-title="([^"]*)"\s+data-duration="([^"]*)"'
                         r'.*?data-num-downloads="(\d+)"', h, re.S):
        sid, user, title, dur, dl = m.groups()
        print(f"{sid:>8}  {float(dur):7.1f}s  dl={dl:>6}  {user:<20} {html.unescape(title)[:90]}")

def oga(q, page=0):
    url = "https://opengameart.org/art-search-advanced?" + urllib.parse.urlencode(
        [("keys", q), ("field_art_type_tid[]", 12), ("field_art_type_tid[]", 13),
         ("field_art_licenses_tid[]", 4), ("sort_by", "count"), ("sort_order", "DESC"), ("page", page)])
    h = get(url)
    seen = set()
    for m in re.finditer(r'<a href="(/content/[^"]+)">([^<]+)</a>', h):
        if m.group(1) in seen: continue
        seen.add(m.group(1))
        print(f"{m.group(1):<60} {html.unescape(m.group(2))[:70]}")

if __name__ == "__main__":
    # search.py fs|oga "query one" "query two" ...   (page 1 of each)
    kind = sys.argv[1]
    for q in sys.argv[2:]:
        print(f"### {kind}: {q}", flush=True)
        try:
            (fs if kind == "fs" else oga)(q, 1 if kind == "fs" else 0)
        except Exception as e:
            print("  ERR", e)
