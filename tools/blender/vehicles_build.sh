#!/usr/bin/env bash
# Rebuild the player vehicles + helmet, validate, render icons and contact sheets.
#   tools/blender/vehicles_build.sh [RAW_DIR]        (RAW_DIR default /tmp/fds-veh)
# Outputs: assets/models/vehicles.glb, assets/icons/veh-<id>.png, assets/icons/helmet.png,
#          tools/shots/vehicles-sheet.png, tools/shots/vehicles-rider.png
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW="${1:-/tmp/fds-veh}"
BL=/snap/bin/blender
mkdir -p "$RAW/icons" "$RAW/cells"
quiet() { grep -vE 'EGL Error|DracoEncoder|^$' || true; }

$BL -b --factory-startup -P tools/blender/vehicles.py -- --out assets/models/vehicles.glb --report "$RAW/stats.json" 2>&1 | grep -E 'STAT|WROTE|Error|Traceback' | quiet
python3 tools/blender/vehicles_check.py assets/models/vehicles.glb --json "$RAW/check.json" | grep -E '==|FAIL|ALL OK|PROBLEMS'

# icons (Cycles) and contact-sheet cells (EEVEE), in parallel
$BL -b --factory-startup -P tools/blender/vehicles_render.py -- --glb assets/models/vehicles.glb --mode icons --out "$RAW/icons" > "$RAW/icons.log" 2>&1 &
for g in rustbucket,zippy vespetta,volt mule,viper,helmet; do
  $BL -b --factory-startup -P tools/blender/vehicles_render.py -- --glb assets/models/vehicles.glb --mode cells --out "$RAW/cells" --only "$g" > "$RAW/cells-$g.log" 2>&1 &
done
wait
grep -h -E 'Error|Traceback' "$RAW"/*.log | grep -v EGL || true
python3 tools/blender/vehicles_sheet.py --raw "$RAW"
