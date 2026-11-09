# Small webp copies of tools/genart.mjs's raw PNGs for the page: python3 tools/genart-webp.py <rawdir>
# Story panels → assets/story/<name>.webp at 768×512; the smash button icon → 256×256 with its transparency.
import sys, os
from PIL import Image
raw, out = sys.argv[1], os.path.join(os.path.dirname(__file__), '..', 'assets', 'story')
os.makedirs(out, exist_ok=True)
for n in ['letter', 'diner', 'scooter', 'smash', 'cook-btn', 'stage2', 'stage3', 'stage4', 'stage5']:
    p = os.path.join(raw, n + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p)
    if n.endswith('-btn'): im = im.convert('RGBA').resize((256, 256), Image.LANCZOS); im.save(os.path.join(out, n + '.webp'), quality=82, method=6)
    else: im = im.convert('RGB'); im.thumbnail((768, 512), Image.LANCZOS); im.save(os.path.join(out, n + '.webp'), quality=78, method=6)
    print(n, os.path.getsize(os.path.join(out, n + '.webp')) // 1024, 'KB')
