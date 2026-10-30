// Cut the "Loser" trend edit from tools/loserclip.mjs's shots to the song's beat grid: doomer grade and long cuts
// first, then the turn, then hopecore grade with a cut every other beat, lowercase captions, the game's end card.
// Each shot's key moment (the camera flash, a tap, the stars) lands on a beat. Renders the silent master to post (the
// song is added in the app — TikTok / Reels sound, from the start time printed here) and a preview with the song for
// checking the cut. The preview is for checking only, never for posting: the song isn't ours to publish.
//   node tools/losercut.mjs [song] [out-dir]
//   env: CUT=chorus|bridge (which part of the song, see TURNS) · TURN=<s> (or: where in the song the turn lands,
//        snapped to a downbeat) · BPM=100 (no song: a plain grid, for a draft) · FONTS=<dir> (CourierPrime-Regular.ttf)
//        PYTHONPATH (where librosa is, for tools/beats.py)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [SONG, OUT = '/var/www/vhosts/mithatck.com/fds-trailer'] = process.argv.slice(2);
const FPS = 30, W = 1080, H = 1920;
const FONT = resolve(process.env.FONTS || OUT + '/fonts', 'CourierPrime-Regular.ttf');
if (!existsSync(FONT)) throw new Error(`no caption font at ${FONT}`);

// ---- the cut, in beats. mark + hit: the shot's marked moment lands `hit` beats into the clip; from: start that many
// seconds into the shot. rate: play the shot faster. cap: captions, at / until in beats from the clip's start, lines
// stacked (stagger: beats between them). flash: the clip comes in from white ----
const EDL = [
  { shot: 'd-night', beats: 8, from: 0.4, grade: 'doom', cap: [{ at: 1, lines: ['23:47.', 'still on shift.'], stagger: 2 }] },
  { shot: 'd-stall', beats: 6, mark: 'stall', hit: 0.25, grade: 'doom', cap: [{ at: 2, lines: ['rust bucket.', '32 km/h.'], stagger: 1 }] },
  { shot: 'd-red', beats: 7, mark: 'flash', hit: 5, grade: 'doom', cap: [{ at: 5.25, lines: ['another fine.'] }] },
  { shot: 'd-door', beats: 5, mark: 'rated', hit: 2, grade: 'doom', cap: [{ at: 2.75, lines: ['day one.'] }] },
  { shot: 'h-granny', beats: 4, mark: 'tap', hit: 2, grade: 'turn', flash: 0.35, cap: [{ at: 0, until: 2.5, lines: ['but then.'] }] },
  { shot: 'h-perfect', beats: 2, mark: 'perfect', hit: 0.5, grade: 'hope' },
  { shot: 'h-ketchup', beats: 2, mark: 'tap', hit: 0.5, grade: 'hope' },
  { shot: 'h-ride', beats: 4, from: 0.5, grade: 'hope', flash: 0.12, cap: [{ at: 0.5, lines: ['new wheels.'] }] },
  { shot: 'h-fan', beats: 2, mark: 'tap', hit: 0.5, grade: 'hope' },
  { shot: 'h-door', beats: 4, mark: 'rated', hit: 1, grade: 'hope', flash: 0.12 },
  { shot: 'h-fleet', beats: 14, from: 0.2, rate: 1.35, grade: 'hope', flash: 0.12,
    cap: [{ at: 0.5, until: 9, lines: ['someone rides', 'my old bike now.'], stagger: 1 }, { at: 10, lines: ['life is good.'], big: true }] },
  { shot: 'end', beats: 4, from: 0.04, grade: 'hope', flash: 0.12 },
];
const TURN = EDL.slice(0, EDL.findIndex((c) => c.grade !== 'doom')).reduce((a, c) => a + c.beats, 0); // the beat the hopecore half starts on
// where in the song the turn lands (seconds into the album version, snapped to the nearest downbeat). Both put the
// end card on the ninth bar after the turn, where the song drops out. chorus: the doomer half over the pre-chorus
// ("man, it's a crisis… that's how my life is"), the turn on "I'm a loser, babe", the end card on the breakdown after the
// chorus. bridge: the doomer half over "dark streets, I roam in… the stars, I believe in", the turn where the groove
// changes, the end card on the break after "you're badly needed"
const TURNS = { chorus: 59.5, bridge: 166.5 };
const CUT = process.env.CUT || 'chorus', LABEL = !SONG ? 'draft' : process.env.TURN ? `t${process.env.TURN}` : CUT;
if (SONG && !process.env.TURN && !(CUT in TURNS)) throw new Error(`CUT is one of ${Object.keys(TURNS).join(', ')}`);

const GRADE = {
  doom: 'eq=saturation=0.5:contrast=1.06:brightness=0.02:gamma=1.12,colorbalance=rs=-0.03:bs=0.06:rh=0.08:gh=0.02:bh=-0.05,noise=alls=10:allf=t+u,vignette=angle=PI/5',
  // the turn: the doomer look warming into the hopecore one over a second and a half
  turn: "eq=eval=frame:saturation='0.55+0.75*min(t/1.5,1)':contrast=1.06:brightness='-0.03+0.055*min(t/1.5,1)',colorbalance=rm=0.03:bm=-0.03:rh=0.05:gh=0.02:bh=-0.05,noise=alls=5:allf=t",
  hope: 'eq=saturation=1.3:contrast=1.04:brightness=0.025,colorbalance=rm=0.03:bm=-0.03:rh=0.05:gh=0.02:bh=-0.05,noise=alls=3:allf=t',
};
const BLOOM = { doom: 0, turn: 0.18, hope: 0.22 };

// ---- the beat grid ----
let grid, start = 0;
if (SONG) {
  const bj = OUT + '/beats.json';
  console.log(execFileSync('python3', [resolve(HERE, 'beats.py'), SONG, bj], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: process.env.PYTHONPATH || OUT + '/pylib' } }).split('\n').slice(0, 1).join('\n'));
  const B = JSON.parse(readFileSync(bj, 'utf8'));
  const want = process.env.TURN ? +process.env.TURN : TURNS[CUT];
  const turnAt = B.downbeats.reduce((a, t) => (Math.abs(t - want) < Math.abs(a - want) ? t : a));
  // the doomer half on the beats before the turn
  const i0 = B.beats.findIndex((t) => t >= turnAt - 1e-3) - TURN;
  if (i0 < 0) throw new Error(`the turn at ${turnAt} s leaves no room for the doomer half`);
  const beats = B.beats.slice(i0), spb = 60 / B.tempo;
  start = beats[0];
  grid = (k) => {
    const i = Math.floor(k), f = k - i;
    const at = (j) => (j < beats.length ? beats[j] : beats[beats.length - 1] + (j - beats.length + 1) * spb) - start;
    return at(i) + (at(i + 1) - at(i)) * f;
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  console.log(`cut from ${start.toFixed(2)} s into the song (${mmss(start)}) · the turn at ${mmss(turnAt)} · ${B.tempo.toFixed(1)} BPM`);
} else {
  const spb = 60 / +(process.env.BPM || 100);
  grid = (k) => k * spb;
  console.log(`no song: a plain ${process.env.BPM || 100} BPM grid (a draft)`);
}

// ---- clips ----
const tmp = OUT + '/cut'; rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const fade = (t0, t1, k = 0.18) => {
  const n = (x) => x.toFixed(3);
  return `'if(lt(t,${n(t0)}),0,if(lt(t,${n(t0 + k)}),(t-${n(t0)})/${k},if(lt(t,${n(t1 - 0.12)}),1,max(0,(${n(t1)}-t)/0.12))))'`;
};
let beat = 0, frame = 0;
const list = [];
for (const [ci, c] of EDL.entries()) {
  const meta = JSON.parse(readFileSync(`${OUT}/shots/${c.shot}.json`, 'utf8'));
  const t0 = grid(beat), f1 = Math.round(grid(beat + c.beats) * FPS), n = f1 - frame, rate = c.rate || 1;
  const local = (b) => grid(beat + b) - t0; // beats into the clip → seconds into the clip
  let inF;
  if (c.mark) {
    const m = meta.marks.find((x) => x.k === c.mark);
    if (!m) throw new Error(`${c.shot}: no '${c.mark}' mark`);
    inF = m.f - Math.round(local(c.hit) * FPS * rate);
  } else inF = Math.round((c.from || 0) * FPS);
  const need = Math.ceil(n * rate);
  if (inF + need > meta.frames - 1) {
    if (c.mark) console.log(`  ${c.shot}: the shot ends too soon after '${c.mark}', which lands ${((inF + need - meta.frames + 1) / rate / FPS).toFixed(2)} s late`);
    inF = meta.frames - 1 - need;
  }
  if (inF < 1) { console.log(`  ${c.shot}: ${1 - inF} frames short at the start, held`); inF = 1; }
  // captions: one drawtext per line, fading in at its beat
  const dur = n / FPS, text = [];
  for (const [gi, g] of (c.cap || []).entries()) {
    const size = Math.round(W * (g.big ? 0.088 : 0.066)), lh = Math.round(size * 1.2);
    g.lines.forEach((line, li) => {
      const file = `${tmp}/c${ci}-${gi}-${li}.txt`; writeFileSync(file, line);
      const a = local(g.at + li * (g.stagger || 0)), b = g.until != null ? local(g.until) : dur;
      const y = Math.round(H * 0.5 + (li - (g.lines.length - 1) / 2) * lh); // mid-screen: clear of the order card and the rating up top, the buttons below
      text.push(`drawtext=fontfile=${FONT}:textfile=${file}:fontsize=${size}:fontcolor=white:borderw=4:bordercolor=black@0.75:shadowcolor=black@0.4:shadowx=3:shadowy=4:x=(w-text_w)/2:y=${y}:alpha=${fade(a, b)}`);
    });
  }
  const g = GRADE[c.grade], bloom = BLOOM[c.grade];
  const chain = [`[0:v]fps=${FPS},scale=${W}:${H},tpad=stop_mode=clone:stop=90,${g}[g0]`,
    bloom ? `[g0]split[a][b];[b]gblur=sigma=26[gb];[a][gb]blend=all_mode=screen:all_opacity=${bloom}[g1]` : '[g0]null[g1]',
    `[g1]${[...text, c.flash ? `fade=t=in:st=0:d=${c.flash}:color=white` : null].filter(Boolean).join(',') || 'null'}[v]`];
  const out = `${tmp}/${String(ci).padStart(2, '0')}-${c.shot}.mp4`;
  ffmpeg(['-framerate', String(FPS * rate), '-start_number', String(inF), '-i', `${OUT}/shots/${c.shot}/%04d.jpg`,
    '-filter_complex', chain.join(';'), '-map', '[v]', '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), out]);
  console.log(`  ${String(beat).padStart(3)} beats ${t0.toFixed(2).padStart(6)} s  ${c.shot.padEnd(9)} ${n} frames from ${inF}${rate !== 1 ? ` at ×${rate}` : ''}`);
  list.push(`file '${out}'`);
  beat += c.beats; frame = f1;
}

// ---- the master (silent) and the preview (with the song) ----
writeFileSync(`${tmp}/list.txt`, list.join('\n'));
const master = `${OUT}/loser-edit-${LABEL}.mp4`, len = frame / FPS;
ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${tmp}/list.txt`, '-c', 'copy', '-movflags', '+faststart', master]);
console.log(`master ${master} · ${len.toFixed(2)} s, silent: add the song in the app${SONG ? ` from ${start.toFixed(2)} s` : ''}`);
if (SONG) {
  const preview = `${OUT}/loser-preview-${LABEL}.mp4`;
  ffmpeg(['-i', master, '-ss', String(start), '-t', len.toFixed(3), '-i', SONG, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-af', `afade=t=out:st=${(len - 1.2).toFixed(3)}:d=1.2`, '-shortest', preview]);
  console.log(`preview ${preview} (for checking the cut only, not for posting)`);
}
