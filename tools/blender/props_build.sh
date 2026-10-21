#!/usr/bin/env bash
# Rebuild the street-props kit and its contact sheet.
#   tools/blender/props_build.sh [RAW_DIR]        (RAW_DIR default /tmp/fds-props)
# Outputs: assets/models/props.glb, tools/shots/props-sheet.png
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW="${1:-/tmp/fds-props}"
BL=/snap/bin/blender
mkdir -p "$RAW/cells"
$BL -b --factory-startup -P tools/blender/props.py -- --out assets/models/props.glb --report "$RAW/stats.json" 2>&1 \
  | grep -E 'STAT|EXTRA|WROTE|Error|Traceback' || true
node tools/props-check.mjs assets/models/props.glb || true
SETS=(tree_round_a,tree_round_b,tree_round_c,palm_a,palm_b,bush_a
        flower_pot,street_lamp,street_lamp_double,traffic_light,sign_post,bollard
        hydrant,trash_bin,cafe_set_a,cafe_set_b,planter,bench
        chalkboard,railing,bus_stop,clock_tower,lighthouse
        ferris_wheel,hill_house_a,hill_house_b,hill_house_c)
for g in "${SETS[@]}"; do
  $BL -b --factory-startup -P tools/blender/props_render.py -- --glb assets/models/props.glb --out "$RAW/cells" --only "$g" \
    > "$RAW/render-${g%%,*}.log" 2>&1 &
done
$BL -b --factory-startup -P tools/blender/props_render.py -- --glb assets/models/props.glb --out "$RAW/cells" --scene \
  > "$RAW/render-scene.log" 2>&1 &
wait
grep -h -E 'Error|Traceback' "$RAW"/render-*.log | grep -v EGL || true
python3 tools/blender/props_sheet.py --raw "$RAW/cells" --stats "$RAW/stats.json"
