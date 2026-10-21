#!/usr/bin/env bash
# Rebuild the toy traffic cars + extras, validate, render the contact sheet.
#   tools/blender/cars_build.sh [RAW_DIR]        (RAW_DIR default /tmp/fds-cars)
# Outputs: assets/models/cars.glb, tools/shots/cars-sheet.png
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW="${1:-/tmp/fds-cars}"
BL=/snap/bin/blender
mkdir -p "$RAW"

$BL -b --factory-startup -P tools/blender/cars.py -- --out assets/models/cars.glb --report "$RAW/stats.json" 2>&1 \
  | grep -E 'STAT|WROTE|Error|Traceback' || true
$BL -b --factory-startup -P tools/blender/cars_check.py -- --glb assets/models/cars.glb 2>&1 | grep -vE 'EGL|^Blender|INFO|Info:|^$|Draco|MeshOptimizer' || true

# contact-sheet cells (EEVEE), a few Blender processes in parallel
G1=sedan,taxi,police,hatchback-sports,compact
G2=suv,suv-luxury,sedan-sports,van,ambulance
G3=delivery,truck,garbage-truck,sailboat,boat_small
G4=train_head,train_mid
for g in $G1 $G2 $G3 $G4; do
  $BL -b --factory-startup -P tools/blender/cars_render.py -- --glb assets/models/cars.glb --mode cells --out "$RAW" \
      --only "$g" --samples 32 > "$RAW/render-${g%%,*}.log" 2>&1 &
done
wait
grep -h -E 'Error|Traceback' "$RAW"/render-*.log | grep -v EGL || true
python3 tools/blender/cars_sheet.py --raw "$RAW" --out tools/shots/cars-sheet.png
