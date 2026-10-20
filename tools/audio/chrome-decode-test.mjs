// Decode every file of assets/audio in headless Chrome with decodeAudioData (what the game will do) and compare the decoded
// length/channels/sample-rate with manifest.json; for loops also report the sample jump across the wrap-around.
//   node tools/audio/chrome-decode-test.mjs [audio-dir]
import http from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(process.argv[2] || join(HERE, '..', '..', 'assets', 'audio'));
const PAGE = `<!doctype html><meta charset=utf-8><body><script>
window.RUN = async () => {
  const man = await (await fetch('/manifest.json')).json();
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const res = {};
  for (const [name, e] of Object.entries(man)) {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch('/' + e.file)).arrayBuffer());
      const ch0 = buf.getChannelData(0); const n = buf.length;
      let pk = 0; for (let i = 0; i < n; i++) { const a = Math.abs(ch0[i]); if (a > pk) pk = a; }
      let slope = 0; for (let i = 1; i < n; i++) { const d = Math.abs(ch0[i] - ch0[i - 1]); if (d > slope) slope = d; }
      res[name] = { n, dur: +(n / buf.sampleRate).toFixed(4), sr: buf.sampleRate, ch: buf.numberOfChannels, peak: +pk.toFixed(3),
                    wrapJump: +Math.abs(ch0[0] - ch0[n - 1]).toFixed(5), maxSlope: +slope.toFixed(5) };
    } catch (err) { res[name] = { error: String(err) }; }
  }
  return res;
};
<\/script>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/test.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const p = join(DIR, u);
  if (!p.startsWith(DIR) || !existsSync(p)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': u.endsWith('.json') ? 'application/json' : 'audio/mpeg' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/test.html`;
const cache = join(os.homedir(), '.cache/puppeteer/chrome-headless-shell');
const chrome = readdirSync(cache).sort().reverse().map((d) => join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell')).find(existsSync);
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required', url], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = tabs.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
}
if (!wsUrl) { proc.kill(); server.close(); console.error('could not reach chrome'); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
await new Promise((r) => setTimeout(r, 500));
const result = await new Promise((resolveP) => {
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolveP(d.result); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'RUN()', awaitPromise: true, returnByValue: true } }));
});
ws.close(); proc.kill(); server.close();
const res = result.result.value;
const man = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
let bad = 0;
for (const [name, r] of Object.entries(res)) {
  const e = man[name];
  const issues = [];
  if (r.error) issues.push(r.error);
  else {
    if (Math.abs(r.dur - e.dur) > 0.002) issues.push(`dur ${r.dur} vs manifest ${e.dur}`);
    if (r.sr !== 44100) issues.push('sr ' + r.sr);
    if (r.ch !== e.ch) issues.push(`ch ${r.ch} vs ${e.ch}`);
    if (e.loop && r.wrapJump > 1.5 * r.maxSlope) issues.push(`wrap jump ${r.wrapJump} > 1.5x max slope ${r.maxSlope}`);
  }
  if (issues.length) bad++;
  console.log(name.padEnd(16), r.error ? 'ERROR' : `${String(r.dur).padStart(8)}s ${r.ch}ch ${r.sr}Hz peak ${r.peak}` + (e.loop ? ` wrap ${r.wrapJump}/${r.maxSlope}` : ''), issues.join('; '));
}
console.log(bad ? `\n${bad} file(s) with issues` : '\nall files decode in Chrome with the expected length/channels/rate');
process.exit(bad ? 2 : 0);
