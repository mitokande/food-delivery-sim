// Ferdi's (idle4.html): the floor plan of the building. Pure numbers, no three.js: the rules (sim.js) time every walk
// on these routes and the view (world.js) walks the characters along the same ones, so a waiter reaches a table on
// screen exactly when the sim says the food is there.
// Metres; x to the right along the street, z towards the street. The street side is the front.
//
//          x 0      7              21      28
//   z 0    | office | kitchen      | bay*  |
//   z 8    | cashier|=dining hall==| staff*|     (=: the pass, an open kitchen behind a counter)
//   z 17   | entrance     | terrace        |
//   z 23   ----------- sidewalk ------------
//                          street
//   (* the courier bay: its motors ride out through a garage door into the side alley)

export const ROOMS = {
  office: { x0: 0, x1: 7, z0: 0, z1: 8 },
  kitchen: { x0: 7, x1: 21, z0: 0, z1: 8 },
  bay: { x0: 21, x1: 28, z0: 0, z1: 8 },
  cashier: { x0: 0, x1: 7, z0: 8, z1: 17 },
  dining: { x0: 7, x1: 21, z0: 8, z1: 17 },
  staff: { x0: 21, x1: 28, z0: 8, z1: 17 },
  entrance: { x0: 0, x1: 11, z0: 17, z1: 23 },
  terrace: { x0: 11, x1: 28, z0: 17, z1: 23, outdoor: true },
  street: { x0: -16, x1: 44, z0: 23, z1: 27, outdoor: true },
};
export const BUILDING = { x0: 0, x1: 28, z0: 0, z1: 23 };
export const SIDEWALK_Z = 24.7;

// doors: the rooms on both sides, where, and which way you pass through ('x': the wall runs along z, you walk along x)
export const DOORS = [
  { a: 'street', b: 'entrance', x: 3, z: 23, axis: 'z', w: 1.6, front: true },
  { a: 'entrance', b: 'cashier', x: 3.5, z: 17, axis: 'z', w: 1.3 },
  { a: 'entrance', b: 'dining', x: 9, z: 17, axis: 'z', w: 1.5 },
  { a: 'dining', b: 'cashier', x: 7, z: 15.3, axis: 'x', w: 1.3 },
  { a: 'dining', b: 'kitchen', x: 20.4, z: 8, axis: 'z', w: 1.0 },
  { a: 'dining', b: 'terrace', x: 16, z: 17, axis: 'z', w: 1.5 },
  { a: 'kitchen', b: 'office', x: 7, z: 5, axis: 'x', w: 1.2 },
  { a: 'office', b: 'cashier', x: 3.5, z: 8, axis: 'z', w: 1.2 },
  { a: 'kitchen', b: 'bay', x: 21, z: 4, axis: 'x', w: 1.2 },
  { a: 'bay', b: 'street', x: 28, z: 4.4, axis: 'x', w: 2.4, shut: true, garage: true }, // (motors only: see RIDE)
  { a: 'bay', b: 'staff', x: 24.5, z: 8, axis: 'z', w: 1.2, shut: true },
  { a: 'dining', b: 'staff', x: 21, z: 11, axis: 'x', w: 1.2 },
];
// the pass: the kitchen's front wall is a counter (an open kitchen): the stations stand right behind it, the cooks put
// the plates down on it and the waiters take them on the dining hall side
export const PASS = { x0: 7.0, x1: 19.9, z: 8 };

// ---------------------------------------------------------------- spots: where people stand, sit and work
// { x, z, room, ry (facing), sit, via: [[x, z]…] (the way in from the open room, in walking order) }
export const SPOTS = {};
const spot = (id, room, x, z, o = {}) => { SPOTS[id] = { id, room, x, z, ry: 0, ...o }; return SPOTS[id]; };
const FACE = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }; // (n: facing -z, the back wall)

// the street: from the left or the right to the front door and away again
spot('spawnL', 'street', -9, SIDEWALK_Z, { ry: FACE.e });
spot('spawnR', 'street', 36, SIDEWALK_Z, { ry: FACE.w });
spot('front', 'street', 3, SIDEWALK_Z, { ry: FACE.n });
spot('van', 'street', 12.5, SIDEWALK_Z, { ry: FACE.w }); // (where a tour van lets its passengers out)

// the entrance: waiting benches along the left wall and the back wall
export const BENCH_SEATS = [];
for (let i = 0; i < 6; i++) BENCH_SEATS.push(spot(`b:${i}`, 'entrance', 0.55, 18.25 + i * 0.8, { ry: FACE.e, sit: true, via: [[1.6, 18.25 + i * 0.8]] }));
for (let i = 0; i < 4; i++) BENCH_SEATS.push(spot(`b:${6 + i}`, 'entrance', 5.2 + i * 0.8, 17.55, { ry: FACE.s, sit: true, via: [[5.2 + i * 0.8, 18.6]] }));
spot('host', 'entrance', 6.4, 20.6, { ry: FACE.s });

// tables: two chairs each (left and right of the table); a waiter comes to the aisle beside the chair
// dining hall: three rows, none in the way of the doors; terrace: two rows either side of its aisle
export const TABLES = { dining: [], terrace: [] };
const DT = [[12.4, 10.9], [15.2, 10.9], [12.4, 13.2], [15.2, 13.2], [9.6, 10.9], [18.0, 10.9], [9.6, 13.2], [18.0, 13.2], [12.4, 15.5], [18.0, 15.5]];
const TT = [[13.4, 19.0], [19.8, 19.0], [13.4, 21.5], [16.6, 21.5], [19.8, 21.5], [23.0, 19.0], [23.0, 21.5], [26.2, 19.0], [26.2, 21.5]];
for (const [room, list, aisle] of [['dining', DT, (z) => z - 1.15], ['terrace', TT, () => 20.25]]) {
  list.forEach(([x, z], i) => {
    const pre = room === 'dining' ? 'd' : 't', az = aisle(z);
    const seats = [-1, 1].map((s, k) => spot(`${pre}:${i}:${k}`, room, x + s * 0.72, z, { ry: s < 0 ? FACE.e : FACE.w, sit: true, via: [[x + s * 0.72, az]] }));
    for (const [k, s] of [-1, 1].entries()) spot(`a${pre}:${i}:${k}`, room, x + s * 0.72, az, { ry: az < z ? FACE.s : FACE.n }); // (the waiter)
    TABLES[room].push({ i, x, z, seats: seats.map((s) => s.id) });
  });
}
export const aisleOf = (seat) => 'a' + seat;

// the kitchen: a station per dish along the pass (in the menu's order from the right, by the door to the dining hall),
// the cook behind it facing the room; a waiter picks the plate up across the counter
export const STATION_X = (i) => 19.0 - i * 1.55;
export const STATION_Z = 7.0;
export function stationSpots(dishes) {
  dishes.forEach((id, i) => {
    spot(`st:${id}`, 'kitchen', STATION_X(i), 5.95, { ry: FACE.s });
    spot(`pass:${id}`, 'dining', STATION_X(i), 8.85, { ry: FACE.n });
  });
}
for (let k = 0; k < 8; k++) spot(`kidle:${k}`, 'kitchen', 18.2 - (k % 4) * 1.5, 3.3 + Math.floor(k / 4) * 1.1, { ry: FACE.s });
for (let k = 0; k < 6; k++) spot(`widle:${k}`, 'dining', 19.4 - k * 0.8, 9.5, { ry: FACE.s });

// the cashier: registers along the left wall, the line from the dining hall door
export const REGISTERS = [10.0, 11.8, 13.6];
REGISTERS.forEach((z, r) => {
  spot(`creg:${r}`, 'cashier', 0.75, z, { ry: FACE.e });
  spot(`reg:${r}`, 'cashier', 2.45, z, { ry: FACE.w, via: [[3.6, z]] });
});
export const QUEUE = [[4.3, 11.0], [4.3, 11.8], [4.3, 12.6], [4.3, 13.4], [4.3, 14.2], [4.3, 15.0], [5.1, 15.7], [5.9, 15.7]];
QUEUE.forEach(([x, z], k) => spot(`q:${k}`, 'cashier', x, z, { ry: FACE.n }));

// the office: the desk
spot('office', 'office', 3.2, 2.15, { ry: FACE.s, sit: true, via: [[4.6, 2.4]] });
spot('desk', 'office', 3.2, 3.2);
spot('inspect', 'kitchen', 12.6, 4.4, { ry: FACE.s, via: [[16.0, 4.4]] }); // (the health inspector, looking round)

// the staff room: lockers along its left wall (then along the back), where a new hire changes before going to work
export const LOCKER_SLOTS = [];
for (let k = 0; k < 9; k++) LOCKER_SLOTS.push({ x: 21.55, z: 12.25 + k * 0.52, ry: FACE.e });
for (let k = 0; k < 5; k++) LOCKER_SLOTS.push({ x: 23.55 - k * 0.52, z: 8.55, ry: FACE.s });
export const LOCKERS = 6; // (spots in front of the first lockers)
for (let k = 0; k < LOCKERS; k++) spot(`locker:${k}`, 'staff', 22.25, 12.25 + k * 0.52, { ry: FACE.w, via: [[23.2, 11.0]] });

// the courier bay: a shelf where the cooks leave the bagged orders, the couriers' motors facing the garage door, where
// they wait
spot('bagshelf', 'bay', 22.7, 1.75, { ry: FACE.n, via: [[22.3, 4.0]] });
export const MOTORS = 5;
export const MOTOR_AT = (k) => ({ x: 26.3, z: 1.5 + k * 1.45 });
for (let k = 0; k < MOTORS; k++) spot(`motor:${k}`, 'bay', 25.35, MOTOR_AT(k).z, { ry: FACE.e });
for (let k = 0; k < MOTORS; k++) spot(`cidle:${k}`, 'bay', 23.4, 3.2 + k * 0.95, { ry: FACE.e });
// a ride out (the view only: the sim times the whole trip): from the motor out of the garage door, down the side alley
// to the street and off to the right
export const RIDE = [[27.5, 4.4], [29.2, 4.6], [30.3, 6.0], [30.3, 24.2], [31.5, 25.6], [48, 25.6]];
// where the room managers stand
export const MGR_SPOT = {
  entrance: { x: 8.4, z: 21.7, ry: FACE.s }, dining: { x: 20.3, z: 16.3, ry: FACE.w }, kitchen: { x: 20.3, z: 2.9, ry: FACE.w },
  cashier: { x: 6.4, z: 9.8, ry: FACE.w }, terrace: { x: 27.2, z: 17.9, ry: FACE.w }, staff: { x: 27.3, z: 11.0, ry: FACE.w }, bay: { x: 22.4, z: 6.9, ry: FACE.e },
};

// ---------------------------------------------------------------- routes
// rooms → doors (breadth first; a handful of rooms, so no weights)
const ADJ = {};
for (const d of DOORS) { if (d.shut) continue; (ADJ[d.a] ||= []).push([d.b, d]); (ADJ[d.b] ||= []).push([d.a, d]); }
function roomPath(a, b) {
  if (a === b) return [];
  const prev = { [a]: null }, q = [a];
  while (q.length) {
    const r = q.shift();
    for (const [n, d] of ADJ[r] || []) {
      if (n in prev) continue;
      prev[n] = [r, d];
      if (n === b) { const out = []; let k = b; while (prev[k]) { out.unshift({ from: prev[k][0], to: k, d: prev[k][1] }); k = prev[k][0]; } return out; }
      q.push(n);
    }
  }
  return [];
}
// the two points either side of a door, from room `from` to the other
function through(d, from) {
  const R = ROOMS[from], k = 0.55;
  if (d.axis === 'z') { const s = d.z > (R.z0 + R.z1) / 2 ? 1 : -1; return [[d.x, d.z - s * k], [d.x, d.z + s * k]]; }
  const s = d.x > (R.x0 + R.x1) / 2 ? 1 : -1; return [[d.x - s * k, d.z], [d.x + s * k, d.z]];
}
const routes = new Map();
// a polyline from spot a to spot b: out of a the way it came in, through the doors, into b its way in
export function route(a, b) {
  const key = a + '>' + b;
  let r = routes.get(key);
  if (r) return r;
  const A = SPOTS[a], B = SPOTS[b];
  if (!A || !B) throw new Error(`no spot ${!A ? a : b}`);
  const pts = [[A.x, A.z], ...(A.via || []).slice().reverse()];
  for (const st of roomPath(A.room, B.room)) pts.push(...through(st.d, st.from));
  pts.push(...(B.via || []), [B.x, B.z]);
  // (drop points on top of each other)
  const p = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[p.length - 1][0], pts[i][1] - p[p.length - 1][1]) > 0.05) p.push(pts[i]);
  let len = 0; const cum = [0];
  for (let i = 1; i < p.length; i++) { len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); cum.push(len); }
  r = { pts: p, cum, len };
  routes.set(key, r);
  return r;
}
export const dist = (a, b) => (a === b ? 0 : route(a, b).len);
// the point at distance s along a route: [x, z, heading]
export function along(r, s, out = [0, 0, 0]) {
  const { pts, cum } = r;
  if (pts.length === 1 || s <= 0) { out[0] = pts[0][0]; out[1] = pts[0][1]; out[2] = pts.length > 1 ? Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0; return out; }
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1], f = seg > 0 ? Math.min(1, (s - cum[i - 1]) / seg) : 1;
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return out;
}
