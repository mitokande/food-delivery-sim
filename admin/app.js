// Analytics admin panel: hash-routed views over api.php, charts drawn as inline SVG. No build step, no libraries.
// Display names (vehicles, districts, restaurants, ride events) come straight from the game's own data tables.
import { VEHICLE, DISTRICT, RESTAURANT, ORDER_TYPES, SKILLS, ACHIEVEMENTS, PREMIUM } from '../js/data.js';
import { EVENT } from '../js/ride/events.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- formatting (Turkish)
const LOC = 'tr-TR';
const NF = new Intl.NumberFormat(LOC), NF1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1 });
const NFC = new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 });
const NFP = new Intl.NumberFormat(LOC, { style: 'percent', maximumFractionDigits: 1 });
const bad = (v) => v == null || v === '' || Number.isNaN(+v);
const num = (v) => (bad(v) ? '–' : NF.format(Math.round(+v)));
const num1 = (v) => (bad(v) ? '–' : NF1.format(+v));
const cmp = (v) => (bad(v) ? '–' : Math.abs(v) >= 10000 ? NFC.format(v) : num(v));
const pct = (v) => (bad(v) ? '–' : NFP.format(+v));
const money = (v) => (bad(v) ? '–' : (v < 0 ? '−$' : '$') + cmp(Math.abs(v)));
function dur(ms) {
  if (bad(ms)) return '–';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk${s % 60 && m < 10 ? ` ${s % 60} sn` : ''}`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}` : `${num(h / 24)} gün`;
}
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const clock = (ms) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const when = (ms) => (ms ? new Date(+ms).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
function ago(ms, now = Date.now()) {
  const s = (now - ms) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} gün önce`;
}
const ONLINE_MS = 75000;
const isOnline = (s, now) => now - s.last_seen < ONLINE_MS && +s.visible === 1;
const who = (name, id) => `<a href="#/player/${encodeURIComponent(id)}">${name ? esc(name) : `<span class="mono">#${esc(String(id).slice(1, 7))}</span>`}</a>`;
// "Samsung SM-S711B · Android 16 · Instagram 453": model (or device type), OS and browser with their versions
const DEVICE_TR = { mobile: 'Telefon', tablet: 'Tablet', desktop: 'Masaüstü' };
const devLine = (s) => [s.model || DEVICE_TR[s.device] || s.device, s.os && s.os + (s.os_ver ? ' ' + s.os_ver : ''), s.browser && s.browser + (s.browser_ver ? ' ' + s.browser_ver : '')].filter(Boolean).join(' · ');
const ipCell = (ip) => (ip ? `<span class="mono small">${esc(ip)}</span>` : '<span class="muted">–</span>');
const ipLink = (ip) => (ip ? `<span class="mono">${esc(ip)}</span> <a href="https://ipinfo.io/${encodeURIComponent(ip)}" target="_blank" rel="noopener noreferrer">konum ↗</a>` : '<span class="muted">kaydedilmemiş</span>');
// crawler sessions (api/lib.php bot_reason): a badge that says why
const BOT_TR = { ua: 'bot / tarayıcı otomasyonu (user agent)', 'meta-ip': 'Meta’nın IP aralığı (Facebook/Instagram tarayıcısı)', screen: 'sahte 2000×2000 ekran (cihaz taklidi)',
  nogpu: '1× ekranlı “telefon”, WebGL yok (cihaz taklidi)', softgpu: 'yazılım GPU (headless tarayıcı)' };
const botBadge = (x) => (+x.bot ? `<span class="badge bad" title="${esc(BOT_TR[x.bot_why] || x.bot_why || '')}">bot</span>` : '');
const stars = (n) => `<span class="stars" title="${n} yıldız">${'★'.repeat(n)}<i>${'★'.repeat(Math.max(0, 5 - n))}</i></span>`;

// ---------------------------------------------------------------- game vocabulary
const vehName = (id) => VEHICLE[id]?.name || id || '–';
// how a ride was controlled (job_start / crash 'ctl'): the courier run is the phone's way of riding since 2026-10-30
// (the brake 2026-10-28 to -30)
const ctlName = (c) => (c === 'b' ? 'fren' : c === 'a' ? 'prototip A' : c === 'run' ? 'kurye koşusu' : esc(String(c)));
const distName = (id) => DISTRICT[id]?.name || id || '–';
const restName = (id) => RESTAURANT[id]?.name || id || '–';
const typeName = (id) => ORDER_TYPES[id]?.name || id || '–';
const evName = (id) => EVENT[id]?.title || id || '–';
const skillName = (id) => SKILLS.find((s) => s.id === id)?.name || id;
const achName = (id) => ACHIEVEMENTS.find((a) => a.id === id)?.name || id;
const PART_TR = { engine: 'Motor', suspension: 'Süspansiyon', box: 'Kutu', tires: 'Lastik' };
const TAB_TR = { city: 'Şehir', garage: 'Garaj', courier: 'Kurye', jobs: 'İşler', fleet: 'Filo' };
const WHERE_TR = {
  boot: 'Yükleniyor', intro: 'Tanıtım / kurye seçimi', tween: 'Kamera geçişi', 'ride:ride': 'Sürüşte', 'ride:scene': 'Teslim al / teslim et', 'ride:done': 'Sürüş sonu',
  'modal:receipt': 'Fiş ekranı', 'modal:rated': 'Puan kartı', 'modal:scene': 'Al / teslim kartı', 'modal:settings': 'Ayarlar', 'modal:tip': 'İpucu', 'modal:pop': 'Bildirim penceresi',
  'modal:reset': 'Sıfırlama onayı', 'modal:codebox': 'Kayıt kodu',
};
function whereName(w) {
  if (!w) return '–';
  if (WHERE_TR[w]) return WHERE_TR[w];
  const [a, b] = w.split(':');
  return a === 'hub' ? TAB_TR[b] || b : w;
}
const PAUSE_TR = { button: 'buton', key: 'klavye (Esc / P)', back: 'Android geri tuşu', hidden: 'sayfa gizlendi' };
const STEP_TR = { 0: 'Başlangıç', 1: 'Sipariş seç', 2: 'Start', 3: 'Yemeği al', 4: 'Teslim et', 5: 'Fiş', 6: 'Garaja git', 7: 'Motor yükselt', 8: 'Şehre dön', 99: 'Bitti' };
const BUY_TR = { vehicle: 'Araç', part: 'Parça', paint: 'Boya', skill: 'Beceri', district: 'Bölge başvurusu', premium: 'Premium boya', office: 'Ofis', office_up: 'Ofis yükseltme',
  hire: 'Kurye işe alma', train: 'Kurye eğitimi', reroll: 'Aday yenileme', fleet_crash: 'Kurye kaza tamiri', fleet_star: 'Yıldız kurye kursu',
  coffee: 'Kahve (+enerji)' };
const CLAIM_TR = { goal: 'Günlük hedef', contract: 'Haftalık sözleşme', week: 'Sözleşme bonusu', fleet: 'Filo kasası' };
const FLEET_EV_TR = { crash: 'kaza', raise: 'zam isteği', catering: 'catering işi', star: 'yıldız kurye' };
function buyWhat(p) {
  switch (p.k) {
    case 'vehicle': return vehName(p.id);
    case 'part': return `${vehName(p.id)} · ${PART_TR[p.part] || p.part} → ${p.to}`;
    case 'paint': return `${vehName(p.id)} · ${p.which === 'box' ? 'kutu' : 'gövde'}`;
    case 'skill': return `${skillName(p.id)} → ${p.to}`;
    case 'district': return distName(p.id);
    case 'premium': return PREMIUM.find((x) => x.id === p.id)?.name || p.id;
    case 'office_up': return `seviye ${p.to}`;
    case 'hire': return `beceri ${p.skill} · ${p.couriers}. kurye`;
    case 'train': return `beceri → ${p.to}`;
    default: return '';
  }
}

// what a purchase was for, by kind + id alone (the gameplay table groups by these two)
function itemName(k, id) {
  if (id == null) return '';
  if (k === 'vehicle' || k === 'part' || k === 'paint') return vehName(id);
  if (k === 'skill') return skillName(id);
  if (k === 'district') return distName(id);
  if (k === 'premium') return PREMIUM.find((x) => x.id === id)?.name || id;
  return String(id);
}

// one line per event in a session timeline: category (dot color) + text
function fmtEvent(e) {
  const p = e.props || {};
  switch (e.name) {
    case 'session_start': return { c: 'sys', t: p.why === 'resume' ? `Oturum başladı <small>arka plandan ${num(p.away)} dk sonra döndü</small>` : p.why === 'optin' ? 'Oturum başladı <small>veri paylaşımını yeniden açtı</small>' : `Oturum başladı <small>${p.saved ? 'kayıtlı oyunu var' : 'ilk açılış (kayıt yok)'}</small>` };
    case 'boot': return { c: 'sys', t: `Oyun yüklendi <small>${num1(p.ms / 1000)} sn · seviye ${num(p.lvl)} · ${num(p.del)} teslimat</small>` };
    case 'boot_fail': return { c: 'bad', t: `Oyun açılamadı: ${esc(p.msg)}` };
    case 'error': return { c: 'bad', t: `Hata: ${esc(p.msg)} <small>${esc(p.src || '')}${p.line ? ':' + esc(p.line) : ''} · ${esc(whereName(p.where))}</small>` };
    case 'intro_done': return { c: 'prog', t: `Kurye seçildi <small>${esc(p.char)} · ${p.named ? 'isim girdi' : 'isimsiz'}${p.skipped ? ' · tanıtımı atladı' : ''}</small>` };
    case 'onboard_step': return { c: 'prog', t: `Tutorial: ${esc(STEP_TR[p.step] ?? p.step)} <small>adım ${esc(p.step)}</small>` };
    case 'onboard_done': return { c: 'prog', t: p.skipped ? `Tutorial atlandı <small>${esc(STEP_TR[p.at] ?? p.at)} adımında</small>` : 'Tutorial tamamlandı' };
    case 'tab': return { c: 'sys', dim: 1, t: `Sekme: ${esc(TAB_TR[p.tab] || p.tab)}` };
    case 'job_start': return { c: 'ride', t: `<b>Sürüş başladı</b> <small>${p.chain ? 'kapıdan devam · ' : ''}${num(p.n)} sipariş${p.energy != null ? ` · kalan enerji ${num(p.energy)}` : ''} · ${esc(vehName(p.veh))}${p.manual ? ' · elle sürüş (klavye)' : ''}${p.ctl ? ` · ${ctlName(p.ctl)}` : ''}${p.rain > 0.35 ? ' · yağmur' : ''}${p.rush > 1 ? ' · yoğun saat' : ''}</small>
      <div class="orders">${(p.orders || []).map((o) => `<span>${esc(restName(o.rest))} · ${esc(distName(o.d))} · ${esc(typeName(o.type))} · ${num(o.m)} m · süre ${num(o.eta)} sn · ${money(o.pay)}</span>`).join('')}</div>` };
    case 'job_end': {
      const s = p.stats || {};
      return { c: 'ride', t: `<b>Teslimat bitti · ${money(p.total)}</b> <small>${num(p.secs)} sn · ${num(p.m)} m · +${num(p.xp)} XP${p.fines ? ` · ceza ${money(p.fines)}` : ''}${p.levels ? ' · seviye atladı' : ''}</small>
        <div class="orders">${(p.orders || []).map((o) => `<span>${stars(o.stars)} ${esc(restName(o.rest))} · ${esc(typeName(o.type))} · ${money(o.pay + o.bonus)} + ${money(o.tip)} bahşiş · ${o.early ? 'erken' : o.late ? 'geç' : 'zamanında'} (süre ×${num1(o.ratio)}) · kondisyon %${num(o.cond)}</span>`).join('')}</div>
        <div class="chips"><span>sollama ${num(s.overtakes)}</span><span>zıplama ${num(s.hops)} (mükemmel ${num(s.perfect)})</span><span>kestirme ${num(s.shortcuts)}</span><span>kaza ${num(s.crashes)}</span><span>turbo ${num1(s.boostT)} sn</span><span>durma ${num1(s.stopT)} sn</span><span>kıl payı ${num(s.nearMisses)}</span><span>flow ×${num1(s.bestFlow)}</span>${p.manual ? `<span>virajda kayma ${num(s.skids)}</span><span>rota değiştirdi ${num(s.reroutes)}</span>` : ''}${!p.manual && !p.ctl && s.halts != null ? `<span>STOP ${num(s.halts)} (kusursuz ${num(s.stops)})</span><span>kırmızıda geçti ${num(s.reds)}</span>${s.tickets != null ? `<span>kamera cezası ${num(s.tickets)}</span>` : ''}<span>kapıyı geçti ${num(s.overshoots)}</span><span>yaya ürküttü ${num(s.pedHits)}</span>` : ''}${p.ctl ? `<span>fren ${num1(s.brakeT)} sn</span><span>şerit ${num(s.lanes)}</span><span>dönüş ${num(s.turns)}</span><span>yeşil dalga ${num(s.waves)}</span><span>kırmızıda geçti ${num(s.reds)}</span>${p.ctl === 'a' || p.ctl === 'run' ? `<span>sapan ${num(s.slings)}</span><span>kaldırımda ${num(s.walkM)} m</span>${p.ctl === 'run' ? `<span>para ${num(s.coins)}</span><span>kamera cezası ${num(s.tickets)}</span><span>yaya ürküttü ${num(s.pedHits)}</span><span>bozulan sipariş ${num(s.ruined)}</span>` : ''}` : `<span>kusursuz viraj ${num(s.corners)}</span><span>dışa kaydı ${num(s.wide)}</span><span>kusursuz duruş ${num(s.stops)}</span><span>kapıyı geçti ${num(s.overshoots)}</span><span>vites ${num(s.gearMax)}</span>${s.tickets != null ? `<span>kamera cezası ${num(s.tickets)}</span><span>yaya ürküttü ${num(s.pedHits)}</span><span>yumuşak geçiş ${num(s.smooth)}</span>` : ''}`}` : ''}</div>` };
    }
    case 'ride_event': {
      const opt = p.opt != null ? EVENT[p.id]?.options?.[p.opt]?.label : null;
      const bits = [opt && `seçim: ${esc(opt)}`, p.good === 1 ? 'başarılı' : p.good === 0 ? 'başarısız' : '', p.auto ? 'süre doldu, otomatik seçildi' : ''].filter(Boolean);
      return { c: p.good === 0 ? 'bad' : 'ride', t: `Olay: ${esc(evName(p.id))} <small>${bits.join(' · ')}</small>` };
    }
    case 'crash': return { c: 'bad', t: `Kaza: ${esc(p.why)} <small>${esc(distName(p.d))}${p.ot ? ' · sollarken' : ''}${p.manual ? ' · elle sürüş' : ''}${p.ctl ? ` · ${ctlName(p.ctl)}` : ''}</small>` };
    case 'level_up': return { c: 'prog', t: `<b>Seviye ${num(p.lvl)}</b> <small>${num1(p.pm)} dk oyunda · ${num(p.del)} teslimat</small>` };
    case 'buy': { const w = buyWhat(p); return { c: 'money', t: `Satın aldı: ${esc(BUY_TR[p.k] || p.k)}${w ? ` · ${esc(w)}` : ''} <small>${money(p.cost)} · kalan ${money(p.cash)}</small>` }; }
    case 'claim': return { c: 'money', t: `Ödül aldı: ${esc(CLAIM_TR[p.k] || p.k)} <small>${money(p.reward)}</small>` };
    case 'next_offer': return { c: p.take ? 'ride' : '', t: `Fişte yakın sipariş: ${p.take ? '<b>sürmeye devam</b>' : 'hub\'a döndü'} <small>alış ${num(p.pick)} m · ${money(p.pay)} · kalan enerji ${num(p.energy)}</small>` };
    case 'pause': return { c: 'sys', t: `Duraklattı <small>${esc(PAUSE_TR[p.why] || p.why)} · sürüşün ${num(p.secs)}. sn'si · ayak ${num(p.leg + 1)}/${num(p.legs)}</small>` };
    case 'ride_cancel': return { c: 'bad', t: `<b>Siparişi iptal etti</b> <small>${num(p.n)} sipariş${p.done ? ` · ${num(p.done)} tanesi teslim edilmişti` : ''}${p.picked ? ` · ${num(p.picked)} tanesi alınmıştı` : ''} · ${num(p.secs)} sn · ${num(p.m)} m · ${num(p.energy)} enerji geri</small>` };
    case 'energy_out': return { c: 'bad', t: `Enerji yetmedi <small>${num(p.need)} gerekli · ${num(p.have)} vardı · ${money(p.cash)} nakit · ${num(p.coffee)} kahve hakkı</small>` };
    case 'equip': return { c: 'money', t: `Araç değiştirdi: ${esc(vehName(p.id))}` };
    case 'fleet': {
      const what = p.k === 'decision' ? `${FLEET_EV_TR[p.kind] || p.kind} → ${p.choice === 'a' ? 'kabul' : 'ret'}` : p.k === 'fire' ? 'kurye ayrıldı' : p.k === 'assign' ? `atama: ${p.district ? distName(p.district) : vehName(p.veh)}` : p.k;
      return { c: 'money', t: `Filo: ${esc(what)}` };
    }
    case 'fleet_event': return { c: 'money', dim: 1, t: `Filo kararı bekliyor: ${esc(FLEET_EV_TR[p.kind] || p.kind)}` };
    case 'goal_done': return { c: 'prog', t: `Günlük hedef tamam <small>${esc(p.id)} · ${num(p.n)}</small>` };
    case 'contract_done': return { c: 'prog', t: `Sözleşme hedefi tamam <small>${esc(p.id)}</small>` };
    case 'achievement': return { c: 'prog', t: `Başarım: ${esc(achName(p.id))}` };
    case 'day_end': return { c: 'prog', t: `<b>Gün ${num(p.day)} bitti</b> <small>${money(p.earned)} kazanç · ${num(p.deliveries)} teslimat · ${money(p.tips)} bahşiş${p.wages ? ` · maaş ${money(p.wages)}` : ''}${p.quit ? ` · ${esc(p.quit)} ayrıldı` : ''}</small>` };
    case 'offline_earn': return { c: 'money', t: `Çevrimdışı filo geliri ${money(p.gain)} <small>${dur(p.away * 60000)} uzaktaydı${p.capped ? ' · tavan doldu' : ''}</small>` };
    case 'app_hide': return { c: 'sys', dim: 1, t: `${p.unload ? 'Sayfayı kapattı / yeniledi' : 'Arka plana aldı'} <small>${esc(whereName(p.where))}</small>` };
    case 'app_show': return { c: 'sys', dim: 1, t: `Geri döndü <small>${dur(p.away * 1000)} sonra</small>` };
    case 'setting': return { c: 'sys', dim: 1, t: `Ayar: ${esc(p.k)} = ${esc(p.v)}` };
    case 'quality_step': return { c: 'bad', t: `Grafik kalitesi otomatik düştü (adım ${num(p.step)}) <small>${num1(p.ms)} ms/kare</small>` };
    case 'save_export': return { c: 'sys', t: 'Kayıt kodunu açtı' };
    case 'save_import': return { c: 'sys', t: 'Kayıt kodu yükledi' };
    case 'save_reset': return { c: 'bad', t: 'İlerlemeyi sıfırladı' };
    default: return { c: 'sys', t: esc(e.name) };
  }
}

// ---------------------------------------------------------------- filters, api, routing
const F = (() => { try { return { range: '7d', dev: false, bots: false, metric: 'players', ...JSON.parse(localStorage.getItem('fds_admin') || '{}') }; } catch { return { range: '7d', dev: false, bots: false, metric: 'players' }; } })();
const saveF = () => { try { localStorage.setItem('fds_admin', JSON.stringify(F)); } catch { /* fine */ } };
const RANGE_TR = { today: 'bugün', '7d': 'son 7 gün', '30d': 'son 30 gün', '90d': 'son 90 gün', all: 'tüm zamanlar' };
function span() {
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[F.range];
  if (!days) return 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}
async function api(q, params = {}) {
  const u = new URLSearchParams({ q, from: span(), tz: -new Date().getTimezoneOffset(), dev: F.dev ? 1 : 0, bots: F.bots ? 1 : 0 });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.set(k, v);
  const r = await fetch('api.php?' + u, { credentials: 'same-origin' });
  if (r.status === 401) { location.reload(); throw new Error('oturum kapandı'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
  return r.json();
}
function route() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  return { name: VIEWS[name] ? name : 'overview', id: id ? decodeURIComponent(id) : null, params: new URLSearchParams(qs || '') };
}
function setParams(patch) {
  const r = route();
  for (const [k, v] of Object.entries(patch)) { if (v === '' || v == null) r.params.delete(k); else r.params.set(k, v); }
  const qs = r.params.toString();
  location.hash = `#/${r.name}${r.id ? '/' + encodeURIComponent(r.id) : ''}${qs ? '?' + qs : ''}`;
}

const view = $('#view');
let refresh = 0, gen = 0;
async function render(quiet = false) {
  clearTimeout(refresh);
  const r = route(), my = ++gen;
  for (const a of $$('#nav a')) a.classList.toggle('on', a.dataset.v.split(' ').includes(r.name));
  for (const b of $$('#range button')) b.classList.toggle('on', b.dataset.r === F.range);
  $('#dev').checked = F.dev; $('#bots').checked = F.bots;
  if (!quiet) view.classList.add('loading');
  try {
    const v = await VIEWS[r.name](r);
    if (my !== gen) return;
    const y = scrollY;
    ro.disconnect(); resizers.clear();
    view.innerHTML = v.html;
    v.mount?.(view);
    if (quiet) scrollTo(0, y);
    $('#stamp').textContent = `Güncellendi ${new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    if (v.every) refresh = setTimeout(() => { if (!document.hidden && route().name === r.name) render(true); }, v.every);
  } catch (e) {
    if (my === gen) view.innerHTML = `<div class="card empty err">Yüklenemedi: ${esc(e.message)}</div>`;
  }
  if (my === gen) view.classList.remove('loading');
}

// ---------------------------------------------------------------- building blocks
const empty = (msg = 'Bu aralıkta veri yok.') => `<div class="empty">${esc(msg)}</div>`;
const card = (title, body, { sub = '', right = '', cls = '' } = {}) => `<section class="card ${cls}"><header><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right}</header>${body}</section>`;
// stat tile: value is HTML (callers format/escape), d = the line under it
const tile = (label, value, d = '', hero = false) => {
  const long = String(value).replace(/<[^>]+>/g, '').length > 8; // "3 dk 22 sn", "$25 → $278": smaller, never clipped
  return `<div class="tile${hero ? ' hero' : ''}"><div class="l">${esc(label)}</div><div class="v${long ? ' long' : ''}">${value}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
};
function delta(cur, prev, upIsGood = true) {
  if (prev == null || cur == null) return '';
  if (+prev === 0) return +cur ? 'önceki dönemde yoktu' : '';
  const ch = (cur - prev) / prev;
  const good = ch >= 0 === upIsGood;
  return `<span class="${good ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${pct(Math.abs(ch))}</span> önceki döneme göre`;
}
// horizontal bars with the value at the tip (one series → one color)
function bars(rows, { fmt = num, note } = {}) {
  if (!rows.length) return empty();
  const max = Math.max(...rows.map((r) => +r.value || 0)) || 1;
  return `<div class="bars">${rows.map((r) => `<div class="r" title="${esc(r.label)}: ${esc(fmt(r.value))}"><span class="lab">${esc(r.label)}</span>
    <span class="trk"><span class="fill" style="width:${((+r.value || 0) / max * 100).toFixed(1)}%"></span></span>
    <span class="val">${esc(fmt(r.value))}${note ? `<small>${esc(note(r))}</small>` : ''}</span></div>`).join('')}</div>`;
}
const share = (rows) => { const t = rows.reduce((a, r) => a + (+r.value || 0), 0) || 1; return (r) => pct(r.value / t); };
// table: cols [{ label, f(row) → html, n (numeric), sort (server key) }]
function table(cols, rows, { sort, dir, href, emptyMsg } = {}) {
  if (!rows.length) return empty(emptyMsg);
  const head = cols.map((c) => `<th class="${c.n ? 'n' : ''}${c.sort ? ' sort' : ''}${c.sort && c.sort === sort ? ' on' : ''}"${c.sort ? ` data-sort="${c.sort}"` : ''}>${esc(c.label)}${c.sort && c.sort === sort ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('');
  const body = rows.map((r) => {
    const h = href?.(r);
    return `<tr${h ? ` class="link" data-href="${esc(h)}"` : ''}>${cols.map((c) => `<td class="${c.n ? 'n' : ''}${c.wrap ? ' wrap' : ''}">${c.f(r)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="tw"><table class="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function pager(page, total, per = 50) {
  if (total <= per) return `<div class="pager"><span>${num(total)} kayıt</span></div>`;
  return `<div class="pager"><span>${num(page * per + 1)}–${num(Math.min(total, (page + 1) * per))} / ${num(total)}</span>
    <button data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''}>‹ Önceki</button><button data-page="${page + 1}" ${(page + 1) * per >= total ? 'disabled' : ''}>Sonraki ›</button></div>`;
}
// retention cell: one-hue ramp, ink chosen by the fill's lightness
function heat(v) {
  const k = [0.01, 0.05, 0.1, 0.2, 0.3, 0.45].filter((t) => v >= t).length;
  return `background:var(--seq-${k + 1});color:${k >= 3 ? '#fff' : '#0b0b0b'}`;
}
const sessionDot = (s, now) => (isOnline(s, now) ? '<span class="dot on" title="Şu an oynuyor"></span>' : now - s.last_seen < ONLINE_MS ? '<span class="dot bg" title="Arka planda"></span>' : '');

// ---------------------------------------------------------------- charts (SVG, hover tooltip, redraw on resize)
const tipEl = $('#tip');
function showTip(html, x, y) {
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 18;
  tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = top + 'px';
}
const hideTip = () => { tipEl.hidden = true; };
const resizers = new Map();
const ro = new ResizeObserver((es) => { for (const e of es) resizers.get(e.target)?.(); });
function mountChart(el, draw) { resizers.set(el, draw); ro.observe(el); draw(); }
function ticks(max, n = 4, integer = true) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  if (integer) step = Math.max(1, Math.round(step));
  const out = [];
  for (let v = 0; v < max + step; v += step) { out.push(v); if (v >= max) break; }
  return out;
}
// one series over days: area + 2px line, crosshair snaps to the nearest day
function lineChart(el, pts, { fmt = num, label = '', h = 220 } = {}) {
  mountChart(el, () => {
    const W = Math.max(280, el.clientWidth), H = h, L = 46, R = 14, T = 16, B = 26;
    const max = Math.max(0, ...pts.map((p) => +p.y || 0)), tk = ticks(max), top = tk[tk.length - 1] || 1;
    const step = pts.length > 1 ? (W - L - R) / (pts.length - 1) : 0;
    const X = (i) => (pts.length > 1 ? L + i * step : (L + W - R) / 2), Y = (v) => T + (H - T - B) * (1 - v / top);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(label)}">`;
    for (const v of tk) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(cmp(v))}</text>`;
    if (pts.length) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(+p.y || 0).toFixed(1)}`).join('');
      s += `<path class="area" d="${d}L${X(pts.length - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z"/><path class="line" d="${d}"/>`;
      const last = pts[pts.length - 1];
      s += `<circle class="mk" r="4" cx="${X(pts.length - 1)}" cy="${Y(+last.y || 0)}"/><text class="vl" x="${X(pts.length - 1) - 6}" y="${Y(+last.y || 0) - 9}" text-anchor="end">${esc(fmt(last.y))}</text>`;
    }
    s += `<line class="base" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - L - R) / 64))));
    pts.forEach((p, i) => { if (i % every === 0) s += `<text x="${X(i)}" y="${H - 7}" text-anchor="${i === 0 && pts.length > 1 ? 'start' : 'middle'}">${esc(p.t)}</text>`; });
    s += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${Y(0)}" visibility="hidden"/><circle class="mk hov" r="4" visibility="hidden"/><rect class="hit" x="${L - 10}" y="0" width="${W - L - R + 20}" height="${H}"/></svg>`;
    el.innerHTML = s;
    const svg = el.firstChild, cross = svg.querySelector('.cross'), mk = svg.querySelector('.hov');
    svg.addEventListener('pointermove', (e) => {
      if (!pts.length) return;
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width;
      const i = step ? Math.max(0, Math.min(pts.length - 1, Math.round((x - L) / step))) : 0, p = pts[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      mk.setAttribute('cx', X(i)); mk.setAttribute('cy', Y(+p.y || 0)); mk.setAttribute('visibility', 'visible');
      showTip(`<b>${esc(fmt(p.y))}</b><span class="k"></span>${esc(label)} · ${esc(p.t)}`, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); mk.setAttribute('visibility', 'hidden'); hideTip(); });
  });
}
// columns from one baseline: ≤24px, 4px rounded top; each column is its own hover target
function columnChart(el, rows, { fmt = num, label = '', h = 190, tipFn } = {}) {
  mountChart(el, () => {
    const W = Math.max(260, el.clientWidth), H = h, L = 40, R = 8, T = 18, B = 24;
    const max = Math.max(0, ...rows.map((r) => +r.value || 0)), tk = ticks(max), top = tk[tk.length - 1] || 1;
    const band = (W - L - R) / Math.max(1, rows.length), bw = Math.min(24, band * 0.68);
    const Y = (v) => T + (H - T - B) * (1 - v / top);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(label)}">`;
    for (const v of tk) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(cmp(v))}</text>`;
    const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((W - L - R) / 30))));
    rows.forEach((r, i) => {
      const v = +r.value || 0, x = L + band * i + (band - bw) / 2, y = Y(v), hh = Y(0) - y, rr = Math.min(4, bw / 2, hh);
      if (hh > 0.5) s += `<path class="bar" data-i="${i}" d="M${x},${Y(0)}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + bw - rr}Q${x + bw},${y} ${x + bw},${y + rr}V${Y(0)}Z"/>`;
      if (rows.length <= 12 && v > 0) s += `<text class="vl" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${esc(fmt(v))}</text>`;
      if (i % every === 0) s += `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(r.label)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${L + band * i}" y="${T - 10}" width="${band}" height="${H - T - B + 10}"/>`;
    });
    s += `<line class="base" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
    el.innerHTML = s;
    const svg = el.firstChild;
    svg.addEventListener('pointermove', (e) => {
      const i = e.target.dataset?.i; if (i == null) return hideTip();
      for (const b of svg.querySelectorAll('.bar')) b.classList.toggle('hl', b.dataset.i === i);
      const r = rows[i];
      showTip(tipFn ? tipFn(r) : `<b>${esc(fmt(r.value))}</b>${esc(label)} · ${esc(r.label)}`, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { for (const b of svg.querySelectorAll('.bar')) b.classList.remove('hl'); hideTip(); });
  });
}

// ---------------------------------------------------------------- views
const METRICS = [['players', 'Aktif oyuncu', num], ['new_players', 'Yeni oyuncu', num], ['sessions', 'Oturum', num], ['minutes', 'Oynama (dakika)', num], ['deliveries', 'Teslimat', num]];
const FUNNEL = [['opened', 'Oyunu açtı'], ['loaded', 'Oyun yüklendi'], ['intro', 'Kuryesini seçti'], ['rode', 'İlk sürüşe çıktı'], ['delivered', 'İlk teslimat'],
  ['tutorial', 'Tutorial bitti / atlandı'], ['del5', '5 teslimat'], ['lvl3', 'Seviye 3'], ['vehicle', 'İlk araç alımı'], ['downtown', 'Downtown açıldı'], ['returned', '2. oturuma döndü']];

const VIEWS = {
  async overview() {
    const d = await api('overview');
    const k = d.kpis, p = d.prev || {};
    const tiles = [
      tile('Aktif oyuncu', num(k.players), delta(k.players, d.prev && p.players), true),
      tile('Yeni oyuncu', num(k.new_players), delta(k.new_players, d.prev && p.new_players)),
      tile('Oturum', num(k.sessions), delta(k.sessions, d.prev && p.sessions)),
      tile('Medyan oturum', dur(k.median_ms), `ortalama ${dur(k.avg_ms)}`),
      tile('Toplam oynama', dur(k.active_ms), delta(k.active_ms, d.prev && p.active_ms)),
      tile('Teslimat', num(k.deliveries), delta(k.deliveries, d.prev && p.deliveries)),
      tile('Sürüş tamamlama', pct(k.jobs_started ? k.jobs / k.jobs_started : null), `${num(k.jobs)} / ${num(k.jobs_started)} sürüş`),
      tile('1. gün dönüş', pct(k.d1), `7. gün ${pct(k.d7)}`),
      tile('Şu an oynayan', `<span class="dot${k.online ? ' on' : ''}"></span> ${num(k.online)}`, '<a href="#/live">Canlı görünüm →</a>'),
      tile('Hata', num(k.errors), delta(k.errors, d.prev && p.errors, false)),
    ].join('');
    const metricBtns = METRICS.map(([m, l]) => `<button data-metric="${m}" class="${F.metric === m ? 'on' : ''}">${esc(l)}</button>`).join('');
    const dailyTable = table([{ label: 'Gün', f: (r) => esc(dayLabel(r.day)) }, ...METRICS.map(([m, l]) => ({ label: l, n: 1, f: (r) => num(r[m]) }))], [...d.daily].reverse());
    const f0 = +d.funnel.opened || 0;
    const funnel = f0 ? `<div class="bars funnel">${FUNNEL.map(([key, label], i) => {
      const v = +d.funnel[key] || 0, prev = i ? +d.funnel[FUNNEL[i - 1][0]] || 0 : v;
      return `<div class="r"><span class="lab">${esc(label)}</span><span class="trk"><span class="fill" style="width:${(v / f0 * 100).toFixed(1)}%"></span></span>
        <span class="val">${num(v)}<small>${pct(v / f0)}</small>${i ? `<div class="conv">adım: ${pct(prev ? v / prev : 0)}</div>` : ''}</span></div>`;
    }).join('')}</div>` : empty('Bu aralıkta ilk kez oynayan (kayıtsız) oyuncu yok.');
    const ret = d.retention.length ? `<div class="tw"><table class="t ret"><thead><tr><th>İlk gün</th><th class="n">Oyuncu</th>${[1, 3, 7, 14, 30].map((n) => `<th class="n">${n}. gün</th>`).join('')}</tr></thead><tbody>
      ${d.retention.map((r) => `<tr><td>${esc(dayLabel(r.d0))}</td><td class="n">${num(r.n)}</td>${[1, 3, 7, 14, 30].map((n) => r.age < n ? '<td class="h na">·</td>'
        : `<td class="h" style="${heat(r['d' + n] / r.n)}" title="${num(r['d' + n])} / ${num(r.n)} oyuncu">${pct(r['d' + n] / r.n)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty();
    const lab = (rows, fn = (x) => x) => rows.map((r) => ({ label: fn(r.k), value: +r.n }));
    const quit = lab(d.quit, whereName), dev = lab(d.devices, (x) => DEVICE_TR[x] || x);
    const models = lab(d.models, (x) => (x === '?' ? 'Bilinmiyor' : x));
    const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0'), value: +(d.hours.find((x) => +x.h === h)?.n || 0) }));
    const FPSB = ['<20', '20–30', '30–45', '45–55', '55+'];
    const fps = FPSB.map((b) => ({ label: b, value: +(d.fps.find((x) => x.k === b)?.n || 0) }));
    const gpus = table([{ label: 'GPU', wrap: 1, f: (r) => esc(r.gpu) }, { label: 'Oturum', n: 1, f: (r) => num(r.n) }, { label: 'Ort. FPS', n: 1, f: (r) => num1(r.fps) }, { label: 'En kötü 5 sn', n: 1, f: (r) => num1(r.worst) }], d.gpus);
    return {
      html: `<div class="pagehead"><h1>Genel bakış</h1><span class="meta">${esc(RANGE_TR[F.range])}${!F.bots && k.bots ? ` · ${num(k.bots)} bot oturumu hariç` : ''}</span></div>
        <div class="tiles">${tiles}</div>
        ${card('Günlük', `<div class="chart" data-chart="daily"></div><div class="daily-table" hidden>${dailyTable}</div>`, { right: `<div class="metric-tabs">${metricBtns}<button data-toggle="daily-table">Tablo</button></div>` })}
        <div class="grid g2" style="margin-top:16px">
          ${card('Yeni oyuncu hunisi', funnel, { sub: 'Bu aralıkta ilk kez açan ve cihazında kayıt olmayan oyuncular; her satır o adıma ulaşanlar.' })}
          ${card('Geri dönüş (retention)', ret, { sub: 'İlk oynadığı güne göre gruplar: N gün sonra tekrar oynayanların oranı.' })}
        </div>
        <div class="grid g2">
          ${card('Günün saatine göre oturumlar', '<div class="chart" data-chart="hours"></div>', { sub: 'Senin saat diliminde, oturum başlangıcı.' })}
          ${card('Oturum nerede bitti', bars(quit, { note: share(quit) }), { sub: 'Oyuncunun ayrıldığı andaki ekran.' })}
        </div>
        <div class="grid g3">
          ${card('Cihaz', bars(dev, { note: share(dev) }))}
          ${card('İşletim sistemi', bars(lab(d.os), { note: share(lab(d.os)) }))}
          ${card('Tarayıcı', bars(lab(d.browsers), { note: share(lab(d.browsers)) }))}
        </div>
        ${card('Cihaz modelleri', bars(models, { note: share(models) }), { sub: 'Telefon modeli: tarayıcının söylediği, iPhone’larda ekran boyutundan tahmin (≈). Android’de Chrome modeli yalnızca yeni oturumlarda gönderiyor.' })}
        <div style="height:16px"></div>
        <div class="grid g2">
          ${card('FPS dağılımı', '<div class="chart" data-chart="fps"></div>', { sub: 'Oturum başına ortalama kare hızı.' })}
          ${card('GPU’ya göre performans', gpus)}
        </div>`,
      mount(root) {
        const draw = () => {
          const [m, l, fmt] = METRICS.find((x) => x[0] === F.metric) || METRICS[0];
          lineChart($('[data-chart=daily]', root), d.daily.map((r) => ({ t: dayLabel(r.day), y: +r[m] || 0 })), { label: l, fmt });
        };
        draw();
        root.querySelector('.metric-tabs').addEventListener('click', (e) => {
          const b = e.target.closest('[data-metric]'); if (!b) return;
          F.metric = b.dataset.metric; saveF();
          for (const x of root.querySelectorAll('[data-metric]')) x.classList.toggle('on', x === b);
          draw();
        });
        columnChart($('[data-chart=hours]', root), hours, { label: 'Oturum' });
        columnChart($('[data-chart=fps]', root), fps, { label: 'Oturum' });
      },
    };
  },

  async live() {
    const d = await api('live');
    const now = d.now;
    const st = (s) => (isOnline(s, now) ? '<span class="dot on"></span> Oynuyor' : now - s.last_seen < ONLINE_MS ? '<span class="dot bg"></span> Arka planda' : `<span class="dot"></span> ${esc(ago(s.last_seen, now))}`);
    const list = table([
      { label: 'Oyuncu', f: (s) => who(s.name, s.player_id) + (+s.is_new ? '<span class="badge new">yeni</span>' : '') + botBadge(s) },
      { label: 'Durum', f: st },
      { label: 'Nerede', f: (s) => esc(whereName(s.last_where)) },
      { label: 'Seviye', n: 1, f: (s) => num(s.lvl_end) },
      { label: 'Para', n: 1, f: (s) => money(s.cash_end) },
      { label: 'Oturum', n: 1, f: (s) => dur(s.active_ms) },
      { label: 'Teslimat', n: 1, f: (s) => num(s.deliveries) },
      { label: 'Cihaz', f: (s) => esc(devLine(s)) },
      { label: 'IP', f: (s) => ipCell(s.ip) },
    ], d.sessions, { href: (s) => `#/session/${encodeURIComponent(s.id)}`, emptyMsg: 'Son 10 dakikada kimse oynamadı.' });
    const feed = d.feed.length ? `<div class="tl feed">${d.feed.map((e) => {
      const f = fmtEvent({ name: e.ev, props: e.props });
      return `<div class="ev c-${f.c}${f.dim ? ' dim' : ''}"><span class="tm">${clock(e.ts)}</span><span class="off"><a href="#/session/${encodeURIComponent(e.session_id)}">${e.name ? esc(e.name) : '#' + esc(e.player_id.slice(1, 5))}</a></span><span class="c"></span><div class="tx">${f.t}</div></div>`;
    }).join('')}</div>` : empty('Son 30 dakikada olay yok.');
    const on = d.sessions.filter((s) => isOnline(s, now)).length;
    return {
      every: 10000,
      html: `<div class="pagehead"><h1>Canlı</h1><span class="meta"><span class="dot${on ? ' on' : ''}"></span> ${num(on)} kişi şu an oynuyor · her 10 sn yenilenir</span></div>
        ${card('Son 10 dakikadaki oturumlar', list)}
        <div style="height:16px"></div>
        ${card('Olay akışı', feed, { sub: 'Son 30 dakika, en yeni üstte.' })}`,
    };
  },

  async sessions(r) {
    const P = r.params;
    const d = await api('sessions', { page: P.get('page'), sort: P.get('sort'), dir: P.get('dir'), search: P.get('search'), new: P.get('new'), err: P.get('err'), min: P.get('min') });
    const now = d.now;
    const cols = [
      { label: 'Başladı', sort: 'started', f: (s) => `${sessionDot(s, now)} ${esc(when(s.started_at))}` },
      { label: 'Oyuncu', f: (s) => who(s.name, s.player_id) + (+s.is_new ? '<span class="badge new">yeni</span>' : '') + (+s.dev ? '<span class="badge">dev</span>' : '') + botBadge(s) },
      { label: 'Süre', n: 1, sort: 'active', f: (s) => dur(s.active_ms) },
      { label: 'Teslimat', n: 1, sort: 'deliveries', f: (s) => num(s.deliveries) + (+s.jobs_started > +s.jobs ? ` <span class="muted small" title="yarım kalan sürüş">+${s.jobs_started - s.jobs}</span>` : '') },
      { label: 'Kazanç', n: 1, sort: 'earned', f: (s) => money(s.earned) },
      { label: 'Seviye', n: 1, sort: 'lvl', f: (s) => (s.lvl_start != null && s.lvl_start !== s.lvl_end ? `${num(s.lvl_start)} → ${num(s.lvl_end)}` : num(s.lvl_end)) },
      { label: 'Harcama', n: 1, f: (s) => (+s.buys ? `${money(s.spent)} <span class="muted small">${num(s.buys)}×</span>` : '–') },
      { label: 'Kaza', n: 1, f: (s) => num(s.crashes) },
      { label: 'Hata', n: 1, sort: 'errors', f: (s) => (+s.errors ? `<span class="badge bad">${num(s.errors)}</span>` : '–') },
      { label: 'FPS', n: 1, f: (s) => num(s.fps) },
      { label: 'Cihaz', f: (s) => esc(devLine(s)) },
      { label: 'IP', f: (s) => ipCell(s.ip) },
      { label: 'Son ekran', f: (s) => esc(whereName(s.last_where)) },
    ];
    const mins = [['', 'Her süre'], ['1', '≥ 1 dk'], ['5', '≥ 5 dk'], ['15', '≥ 15 dk'], ['30', '≥ 30 dk']];
    return {
      html: `<div class="pagehead"><h1>Oturumlar</h1><span class="meta">${esc(RANGE_TR[F.range])}</span></div>
        <section class="card">
          <div class="toolbar">
            <input type="search" placeholder="İsim, id, IP veya model ara" value="${esc(P.get('search') || '')}" data-param="search">
            <label class="chk"><input type="checkbox" data-param="new" ${P.get('new') ? 'checked' : ''}> Sadece ilk oturumlar</label>
            <label class="chk"><input type="checkbox" data-param="err" ${P.get('err') ? 'checked' : ''}> Hatalı</label>
            <select data-param="min">${mins.map(([v, l]) => `<option value="${v}" ${(P.get('min') || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </div>
          ${table(cols, d.rows, { sort: P.get('sort') || 'started', dir: P.get('dir') || 'desc', href: (s) => `#/session/${encodeURIComponent(s.id)}`, emptyMsg: 'Bu filtrelerle oturum yok.' })}
          ${pager(d.page, d.total)}
        </section>`,
    };
  },

  async session(r) {
    const d = await api('session', { id: r.id });
    const s = d.session, p = d.player, ev = d.events, now = d.now;
    const t0 = +s.started_at;
    // rides (job_start … job_end, or a ride_cancel with nothing delivered) are grouped; one that never ended is flagged
    let html = '', open = false;
    for (const e of ev) {
      const f = fmtEvent(e);
      if (e.name === 'job_start') { if (open) html += '</div>'; html += '<div class="ride">'; open = true; }
      html += `<div class="ev c-${f.c}${f.dim ? ' dim' : ''}" data-raw><span class="tm">${clock(e.ts)}</span><span class="off">+${mmss(e.ts - t0)}</span><span class="c"></span><div class="tx">${f.t}</div><pre class="raw mono">${esc(e.name)} ${esc(JSON.stringify(e.props, null, 1))}</pre></div>`;
      if ((e.name === 'job_end' || (e.name === 'ride_cancel' && !e.props?.done)) && open) { html += '</div>'; open = false; }
    }
    if (open) html += '<div class="ev c-bad"><span class="tm"></span><span class="off"></span><span class="c"></span><div class="tx">Sürüş yarım kaldı — oturum bitmeden teslimat tamamlanmadı</div></div></div>';
    const total = +s.last_seen - t0;
    const status = isOnline(s, now) ? '<span class="badge good">şu an oynuyor</span>' : now - s.last_seen < ONLINE_MS ? '<span class="badge">arka planda</span>' : '';
    const kv = [
      ...(+s.bot ? [['Bot', `${BOT_TR[s.bot_why] || s.bot_why} — istatistiklere girmiyor`]] : []),
      ['IP', { html: ipLink(s.ip) }], ['Cihaz', devLine(s)],
      ['Model', s.model ? (s.model.startsWith('≈') ? `${s.model} (ekran boyutundan tahmin)` : s.model) : 'bilinmiyor (tarayıcı söylemedi)'], ['Ekran', `${s.screen || '?'} · pencere ${s.viewport || '?'} · DPR ${s.dpr ?? '?'}`], ['GPU', s.gpu],
      ['Donanım', s.mem || s.cores ? `${s.mem ? s.mem + ' GB bellek' : ''}${s.mem && s.cores ? ' · ' : ''}${s.cores ? s.cores + ' çekirdek' : ''}` : null],
      ['Dil / saat dilimi', `${s.lang || '?'} · ${s.tz || '?'}`], ['Geldiği yer', s.ref || 'doğrudan'], ['Ana ekrandan (PWA)', +s.pwa ? 'evet' : 'hayır'],
      ['Başlangıç', `${s.why === 'resume' ? 'arka plandan döndü' : s.why === 'optin' ? 'veri paylaşımını yeniden açtı' : 'sayfa açıldı'}${+s.fresh ? ' · cihazda kayıt yoktu' : ''}`], ['Son ekran', whereName(s.last_where)], ['User agent', s.ua],
    ].filter(([, v]) => v);
    return {
      html: `<div class="pagehead"><h1>${who(p.name, p.id)} · ${num(d.nth)}. oturum</h1>${+s.is_new ? '<span class="badge new">ilk oturum</span>' : ''}${+s.dev ? '<span class="badge">dev</span>' : ''}${botBadge(s)}${status}
          <span class="meta">${esc(when(t0))} · <span class="mono small">${esc(s.id)}</span></span>
          <span class="meta">${d.nav.prev ? `<a href="#/session/${encodeURIComponent(d.nav.prev)}">‹ önceki oturum</a>` : ''} ${d.nav.next ? `· <a href="#/session/${encodeURIComponent(d.nav.next)}">sonraki ›</a>` : ''}</span></div>
        <div class="tiles">
          ${tile('Aktif süre', dur(s.active_ms), `açık kaldığı süre ${dur(total)}`, true)}
          ${tile('Teslimat', num(s.deliveries), `${num(s.jobs)} / ${num(s.jobs_started)} sürüş tamamlandı`)}
          ${tile('Kazanç', money(s.earned), `+${num(s.xp)} XP`)}
          ${tile('Seviye', s.lvl_start != null ? `${num(s.lvl_start)} → ${num(s.lvl_end)}` : '–')}
          ${tile('Para', `${money(s.cash_start)} → ${money(s.cash_end)}`)}
          ${tile('Harcama', money(s.spent), `${num(s.buys)} satın alma`)}
          ${tile('Kaza', num(s.crashes))}
          ${tile('FPS', num1(s.fps), s.fps_min != null ? `en kötü 5 sn: ${num1(s.fps_min)}` : '')}
          ${tile('Hata', num(s.errors))}
        </div>
        <div class="grid g21">
          ${card(`Zaman çizelgesi <span class="muted small">${num(ev.length)} olay</span>`, ev.length ? `<div class="tl">${html}</div>` : empty('Olay yok.'), { sub: 'Bir satıra tıklayınca ham veriyi gösterir.' })}
          ${card('Cihaz ve oturum', `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.html ?? esc(v)}</dd>`).join('')}</dl>`)}
        </div>`,
    };
  },

  async players(r) {
    const P = r.params;
    const d = await api('players', { page: P.get('page'), sort: P.get('sort'), dir: P.get('dir'), search: P.get('search'), all: P.get('all') });
    const now = d.now;
    const cols = [
      { label: 'Oyuncu', f: (x) => who(x.name, x.id) + (+x.dev ? '<span class="badge">dev</span>' : '') + (+x.bot ? '<span class="badge bad" title="Bütün oturumları bot">bot</span>' : '') },
      { label: 'İlk görülme', sort: 'first', f: (x) => esc(when(x.first_seen)) },
      { label: 'Son görülme', sort: 'last', f: (x) => `${now - x.last_seen < ONLINE_MS ? '<span class="dot on"></span> ' : ''}${esc(ago(x.last_seen, now))}` },
      { label: 'Oturum', n: 1, sort: 'sessions', f: (x) => num(x.sessions) },
      { label: 'Oynama', n: 1, sort: 'active', f: (x) => dur(x.active_ms) },
      { label: 'Seviye', n: 1, sort: 'lvl', f: (x) => num(x.lvl) },
      { label: 'Teslimat', n: 1, sort: 'deliveries', f: (x) => num(x.deliveries) },
      { label: 'Para', n: 1, sort: 'cash', f: (x) => money(x.cash) },
      { label: 'Puan', n: 1, f: (x) => (x.rating != null ? '★ ' + num1(x.rating) : '–') },
      { label: 'Araç', f: (x) => esc(vehName(x.veh)) },
      { label: 'Bölgeler', f: (x) => esc((x.districts || '').split(',').filter(Boolean).map(distName).join(', ')) },
      { label: 'Tutorial', f: (x) => esc(x.onboard == null ? '–' : +x.onboard >= 99 ? 'bitti' : STEP_TR[x.onboard] || x.onboard) },
      { label: 'Cihaz', f: (x) => esc(devLine(x)) },
      { label: 'Son IP', f: (x) => ipCell(x.ip) },
    ];
    return {
      html: `<div class="pagehead"><h1>Oyuncular</h1><span class="meta">${P.get('all') ? 'tüm zamanlar' : esc(RANGE_TR[F.range]) + ' içinde oynayanlar'}</span></div>
        <section class="card">
          <div class="toolbar">
            <input type="search" placeholder="İsim, id, IP veya model ara" value="${esc(P.get('search') || '')}" data-param="search">
            <label class="chk"><input type="checkbox" data-param="all" ${P.get('all') ? 'checked' : ''}> Tarih aralığını yok say</label>
          </div>
          ${table(cols, d.rows, { sort: P.get('sort') || 'last', dir: P.get('dir') || 'desc', href: (x) => `#/player/${encodeURIComponent(x.id)}`, emptyMsg: 'Oyuncu yok.' })}
          ${pager(d.page, d.total)}
        </section>`,
    };
  },

  async player(r) {
    const d = await api('player', { id: r.id });
    const p = d.player, now = d.now;
    const sess = table([
      { label: 'Başladı', f: (s) => `${sessionDot(s, now)} ${esc(when(s.started_at))}${botBadge(s)}` },
      { label: 'Süre', n: 1, f: (s) => dur(s.active_ms) },
      { label: 'Teslimat', n: 1, f: (s) => num(s.deliveries) },
      { label: 'Kazanç', n: 1, f: (s) => money(s.earned) },
      { label: 'Seviye', n: 1, f: (s) => (s.lvl_start != null && s.lvl_start !== s.lvl_end ? `${num(s.lvl_start)} → ${num(s.lvl_end)}` : num(s.lvl_end)) },
      { label: 'Harcama', n: 1, f: (s) => money(s.spent) },
      { label: 'Hata', n: 1, f: (s) => (+s.errors ? `<span class="badge bad">${num(s.errors)}</span>` : '–') },
      { label: 'Cihaz', f: (s) => esc(devLine(s)) },
      { label: 'IP', f: (s) => ipCell(s.ip) },
      { label: 'Son ekran', f: (s) => esc(whereName(s.last_where)) },
    ], d.sessions, { href: (s) => `#/session/${encodeURIComponent(s.id)}` });
    const buys = d.buys.length ? `<div class="tl">${d.buys.map((e) => { const f = fmtEvent(e); return `<div class="ev c-${f.c}"><span class="tm">${esc(when(e.ts))}</span><span class="off"></span><span class="c"></span><div class="tx">${f.t}</div></div>`; }).join('')}</div>` : empty('Henüz satın alma yok.');
    const levels = d.levels.map((e) => ({ label: String(e.props?.lvl), value: +e.props?.pm || 0, e }));
    const dists = d.districts.map((x) => ({ label: distName(x.d), value: +x.n, stars: x.stars }));
    return {
      html: `<div class="pagehead"><h1>${p.name ? esc(p.name) : 'İsimsiz kurye'}</h1>${+p.dev ? '<span class="badge">dev</span>' : ''}${+p.bot ? '<span class="badge bad" title="Bütün oturumları bot">bot</span>' : ''}${now - p.last_seen < ONLINE_MS ? '<span class="badge good">şu an oynuyor</span>' : ''}
          <span class="meta mono small">${esc(p.id)}</span><span class="meta">ilk: ${esc(when(p.first_seen))} · son: ${esc(ago(p.last_seen, now))} · ${esc(devLine(p))} · ${ipLink(p.ip)}</span></div>
        <div class="tiles">
          ${tile('Seviye', num(p.lvl), `${num(p.xp)} XP`, true)}
          ${tile('Teslimat', num(p.deliveries), d.rides.n ? `ort. ${num1(d.rides.stars)} ★ · erken ${pct(d.rides.early)} · geç ${pct(d.rides.late)}` : '')}
          ${tile('Oturum', num(p.sessions))}
          ${tile('Toplam oynama', dur(p.active_ms))}
          ${tile('Para', money(p.cash), `kariyer kazancı ${money(p.earned)}`)}
          ${tile('Puan', p.rating != null ? '★ ' + num1(p.rating) : '–')}
          ${tile('Oyun günü', num(p.day))}
          ${tile('Filo', num(p.fleet), 'kurye')}
          ${tile('Araç', esc(vehName(p.veh)))}
          ${tile('Tutorial', esc(p.onboard == null ? '–' : +p.onboard >= 99 ? 'bitti' : STEP_TR[p.onboard] || p.onboard))}
        </div>
        <div class="grid g2">
          ${card('Seviyeye ulaştığı oynama süresi', levels.length ? '<div class="chart" data-chart="levels"></div>' : empty('Henüz seviye atlamadı (ya da analitik öncesinde atladı).'), { sub: 'Bu cihazdaki toplam oynama dakikası.' })}
          ${card('Bölgelere göre teslimat', bars(dists, { note: (x) => `${num1(x.stars)} ★` }))}
        </div>
        ${card(`Oturumlar <span class="muted small">${num(d.sessions.length)}</span>`, sess)}
        <div style="height:16px"></div>
        ${card('Satın almalar ve başarımlar', buys)}`,
      mount(root) {
        if (levels.length) columnChart($('[data-chart=levels]', root), levels, { label: 'dakika', fmt: num1, tipFn: (x) => `<b>${num1(x.value)} dk</b>Seviye ${esc(x.label)} · ${esc(when(x.e.ts))} · ${num(x.e.props?.del)} teslimat` });
      },
    };
  },

  async gameplay() {
    const d = await api('gameplay');
    const R = d.rides || {};
    const per = (v) => num1(v);
    const tiles = [
      tile('Tamamlanan sürüş', num(R.n), R.started ? `${pct(R.n / R.started)} tamamlandı (${num(R.started)} başladı)` : '', true),
      tile('Ort. sürüş süresi', dur(R.secs * 1000), `${num(R.m)} m`),
      tile('Ort. sürüş kazancı', money(R.total), `+${num(R.xp)} XP · yakıt ${money(R.fuel)}`),
      tile('Kaza / sürüş', per(R.crashes), `ceza ort. ${money(R.fines)}`),
      tile('Sollama / sürüş', per(R.overtakes)),
      tile('Zıplama / sürüş', per(R.hops), `mükemmel ${per(R.perfect)}`),
      tile('Kestirme / sürüş', per(R.shortcuts)),
      tile('Turbo', `${per(R.boost)} sn`, 'sürüş başına'),
      tile('Durarak geçen', `${per(R.stop)} sn`, 'ışık, trafik, olay'),
      tile('Kıl payı / sürüş', per(R.near)),
      tile('Olay / sürüş', per(R.events)),
      tile('En iyi flow', `×${num1(R.flow)}`, 'ortalama'),
    ].join('');
    const ordCols = (name, nameFn) => [
      { label: name, f: (x) => esc(nameFn(x.k)) }, { label: 'Teslimat', n: 1, f: (x) => num(x.n) }, { label: 'Ort. yıldız', n: 1, f: (x) => num1(x.stars) },
      { label: 'Erken', n: 1, f: (x) => pct(x.early) }, { label: 'Geç', n: 1, f: (x) => pct(x.late) }, { label: 'Süre oranı', n: 1, f: (x) => '×' + num1(x.ratio) },
      { label: 'Ort. kazanç', n: 1, f: (x) => money(x.pay) }, { label: 'Ort. bahşiş', n: 1, f: (x) => money(x.tip) }, { label: 'Kondisyon', n: 1, f: (x) => '%' + num(x.cond) },
    ];
    const starRows = [1, 2, 3, 4, 5].map((n) => ({ label: n + '★', value: +(d.stars.find((x) => +x.k === n)?.n || 0) }));
    const evCols = [
      { label: 'Olay', f: (x) => esc(evName(x.k)) }, { label: 'Görülme', n: 1, f: (x) => num(x.n) },
      { label: 'Başarı', n: 1, f: (x) => (x.good == null ? '–' : pct(x.good)) },
      { label: '1. seçenek', f: (x) => { const o = EVENT[x.k]?.options?.[0]; return o ? `${esc(o.label)} <span class="muted">${pct(x.o0 / x.n)}</span>` : '<span class="muted">QTE</span>'; } },
      { label: '2. seçenek', f: (x) => { const o = EVENT[x.k]?.options?.[1]; return o ? `${esc(o.label)} <span class="muted">${pct(x.o1 / x.n)}</span>` : ''; } },
      { label: 'Süre doldu', n: 1, f: (x) => (EVENT[x.k]?.options ? pct(x.auto) : '–') },
    ];
    const buyCols = [
      { label: 'Tür', f: (x) => esc(BUY_TR[x.kind] || x.kind) }, { label: 'Ne', f: (x) => esc(itemName(x.kind, x.item)) },
      { label: 'Adet', n: 1, f: (x) => num(x.n) }, { label: 'Toplam', n: 1, f: (x) => money(x.spent) }, { label: 'Ort. seviyede', n: 1, f: (x) => num1(x.lvl) },
    ];
    // (k: 0 auto-drive, 1 riding yourself, 'b' the brake — phones 2026-10-28 to -30, a prototype before — 'a' the lane
    // run, 'run' the courier run — phones since 2026-10-30, a prototype before)
    const proto = (x) => x.k === 'a' || x.k === 'b' || x.k === 'run', auto = (x) => !proto(x) && !+x.k;
    const modeCols = [{ label: 'Mod', f: (x) => (x.k === 'a' ? 'Prototip A · şerit' : x.k === 'b' ? 'Fren (B)' : x.k === 'run' ? 'Kurye koşusu' : +x.k ? 'Elle (klavye)' : 'Otomatik (STOP)') }, { label: 'Sürüş', n: 1, f: (x) => num(x.n) }, { label: 'Ort. süre', n: 1, f: (x) => dur(x.secs * 1000) },
      { label: 'Ort. kazanç', n: 1, f: (x) => money(x.total) }, { label: 'Ort. yıldız', n: 1, f: (x) => num1(x.stars) }, { label: 'Geç', n: 1, f: (x) => pct(x.late) },
      { label: 'Kaza', n: 1, f: (x) => num1(x.crashes) }, { label: 'Virajda kayma', n: 1, f: (x) => (+x.k ? num1(x.skids) : '–') },
      { label: 'Rota değişikliği', n: 1, f: (x) => (+x.k ? num1(x.reroutes) : '–') }, { label: 'Sollama', n: 1, f: (x) => num1(x.overtakes) },
      { label: 'Fren (sn)', n: 1, f: (x) => (proto(x) ? num1(x.brake) : '–') }, { label: 'Şerit değişimi', n: 1, f: (x) => (proto(x) ? num1(x.lanes) : '–') },
      { label: 'Kırmızıda geçiş', n: 1, f: (x) => (proto(x) || auto(x) ? num1(x.reds) : '–') },
      { label: 'STOP', n: 1, f: (x) => (auto(x) ? num1(x.halts) : '–') }, { label: 'Kapıyı geçti', n: 1, f: (x) => (auto(x) || x.k === 'b' ? num1(x.overshoots) : '–') },
      { label: 'Yaya ürküttü', n: 1, f: (x) => (auto(x) || x.k === 'b' || x.k === 'run' ? num1(x.pedHits) : '–') }];
    const vehCols = [{ label: 'Araç', f: (x) => esc(vehName(x.k)) }, { label: 'Sürüş', n: 1, f: (x) => num(x.n) }, { label: 'Ort. süre', n: 1, f: (x) => dur(x.secs * 1000) },
      { label: 'Ort. kazanç', n: 1, f: (x) => money(x.total) }, { label: 'Kaza / sürüş', n: 1, f: (x) => num1(x.crashes) }];
    const crashes = d.crashes.map((x) => ({ label: x.k, value: +x.n }));
    const tut = d.tutorial.map((x) => ({ label: `${x.k}. ${STEP_TR[x.k] || ''}`, value: +x.n }));
    const levels = d.levels.map((x) => ({ label: String(x.lvl), value: +x.pm || 0, x }));
    const lvlDist = d.lvlDist.map((x) => ({ label: String(x.k ?? '?'), value: +x.n }));
    const tabs = d.tabs.map((x) => ({ label: TAB_TR[x.k] || x.k, value: +x.n }));
    const ach = d.ach.map((x) => ({ label: achName(x.k), value: +x.n }));
    const claims = d.claims.map((x) => ({ label: CLAIM_TR[x.k] || x.k, value: +x.n, reward: x.reward }));
    return {
      html: `<div class="pagehead"><h1>Oynanış</h1><span class="meta">${esc(RANGE_TR[F.range])} · teslimat verisi tamamlanan sürüşlerden</span></div>
        <div class="tiles">${tiles}</div>
        <div class="grid g2">
          ${card('Bölgeler', table(ordCols('Bölge', distName), d.districts))}
          ${card('Sipariş tipleri', table(ordCols('Tip', typeName), d.types))}
        </div>
        <div class="grid g2">
          ${card('Yıldız dağılımı', '<div class="chart" data-chart="stars"></div>')}
          ${card('Araçlara göre sürüş', table(vehCols, d.vehicles))}
        </div>
        ${card('Sürüş modları', table(modeCols, d.modes || []), { sub: 'Kurye koşusu: 30 Ekim 2026\'dan beri telefonda varsayılan (öncesi ?ctl=run prototipi). Fren (B): 28–30 Ekim telefonda varsayılan, artık ?ctl=b. Otomatik (STOP): 26–28 Ekim telefonda varsayılan, artık ?ctl=stop; daha öncesi eski otopilot. Elle: masaüstünde klavyeyle kendi süren. Prototip A: ?ctl=a. Değerler sürüş başına ortalama.' })}
        <div style="height:16px"></div>
        ${card('Sürüş olayları', table(evCols, d.events), { sub: 'Başarı: QTE ya da riskli seçimin iyi bitme oranı. Süre doldu: oyuncu 7 sn içinde seçmedi.' })}
        <div class="grid g2" style="margin-top:16px">
          ${card('Kaza nedenleri', bars(crashes, { note: share(crashes) }))}
          ${card('Tutorial adımları', bars(tut), { sub: 'Bu adıma ulaşan oyuncu sayısı.' })}
        </div>
        ${card('Satın almalar', table(buyCols, d.buys))}
        <div class="grid g2" style="margin-top:16px">
          ${card('Seviyeye ulaşma süresi', levels.length ? '<div class="chart" data-chart="lvltime"></div>' : empty(), { sub: 'Seviyeye ulaşırken oyuncunun toplam oynama dakikası (medyan).' })}
          ${card('Oyuncuların seviyesi', lvlDist.length ? '<div class="chart" data-chart="lvldist"></div>' : empty(), { sub: 'Bu aralıkta oynayanların şu anki seviyesi.' })}
        </div>
        <div class="grid g3">
          ${card('Sekme açılışları', bars(tabs, { note: share(tabs) }))}
          ${card('Başarımlar', bars(ach))}
          ${card('Toplanan ödüller', bars(claims, { note: (x) => money(x.reward) }))}
        </div>`,
      mount(root) {
        columnChart($('[data-chart=stars]', root), starRows, { label: 'Teslimat' });
        if (levels.length) columnChart($('[data-chart=lvltime]', root), levels, { label: 'dakika', fmt: num1, tipFn: (r) => `<b>${num1(r.value)} dk</b>Seviye ${esc(r.label)} · ${num(r.x.n)} oyuncu · medyan ${num(r.x.del)} teslimat` });
        if (lvlDist.length) columnChart($('[data-chart=lvldist]', root), lvlDist, { label: 'Oyuncu', tipFn: (r) => `<b>${num(r.value)} oyuncu</b>Seviye ${esc(r.label)}` });
      },
    };
  },

  async errors() {
    const d = await api('errors');
    const html = d.groups.length ? d.groups.map((g) => {
      const p = g.props || {};
      return `<section class="card errcard"><h3>${g.kind === 'boot_fail' ? '<span class="badge bad">açılmadı</span> ' : ''}${esc(g.msg)}</h3>
        <div class="chips"><span><b>${num(g.n)}</b> kez</span><span>${num(g.sessions)} oturum</span><span>${num(g.players)} oyuncu</span><span>ilk ${esc(when(g.first))}</span><span>son ${esc(when(g.last))}</span>
          ${g.session ? `<span><a href="#/session/${encodeURIComponent(g.session)}">örnek oturum →</a></span>` : ''}</div>
        <div class="chips">${esc(g.envs || '')}${p.where ? ` · ekran: ${esc(whereName(p.where))}` : ''}${p.src ? ` · ${esc(p.src)}:${esc(p.line)}:${esc(p.col)}` : ''}</div>
        ${p.stack ? `<pre class="stack mono">${esc(p.stack)}</pre>` : ''}</section>`;
    }).join('') : `<div class="card">${empty('Bu aralıkta hata yok.')}</div>`;
    return { html: `<div class="pagehead"><h1>Hatalar</h1><span class="meta">${esc(RANGE_TR[F.range])} · mesaja göre gruplu</span></div>${html}` };
  },
};

// ---------------------------------------------------------------- wiring
view.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (th) { const P = route().params; const same = (P.get('sort') || '') === th.dataset.sort; setParams({ sort: th.dataset.sort, dir: same && P.get('dir') !== 'asc' ? 'asc' : '', page: '' }); return; }
  const pg = e.target.closest('[data-page]');
  if (pg && !pg.disabled) { setParams({ page: +pg.dataset.page || '' }); return; }
  const tg = e.target.closest('[data-toggle]');
  if (tg) { const el = view.querySelector('.' + tg.dataset.toggle); if (el) { el.hidden = !el.hidden; tg.classList.toggle('on', !el.hidden); } return; }
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr[data-href]');
  if (tr) { location.hash = tr.dataset.href; return; }
  const ev = e.target.closest('.ev[data-raw]');
  if (ev && !getSelection().toString()) ev.classList.toggle('open');
});
view.addEventListener('change', (e) => {
  const t = e.target.closest('[data-param]'); if (!t) return;
  setParams({ [t.dataset.param]: t.type === 'checkbox' ? (t.checked ? '1' : '') : t.value.trim(), page: '' });
});
$('#range').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; F.range = b.dataset.r; saveF(); render(); });
$('#dev').addEventListener('change', (e) => { F.dev = e.target.checked; saveF(); render(); });
$('#bots').addEventListener('change', (e) => { F.bots = e.target.checked; saveF(); render(); });
addEventListener('hashchange', () => { hideTip(); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && route().name === 'live') render(true); });
render();
