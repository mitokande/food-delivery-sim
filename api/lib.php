<?php
// Shared by the collector, the admin panel and the CLI: config, the SQLite database, schema, ingest.
declare(strict_types=1);

function cfg(string $k) {
  static $c = null;
  $c ??= require __DIR__ . '/config.php';
  return $c[$k] ?? null;
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $dir = rtrim((string) cfg('data_dir'), '/');
  if (!is_dir($dir) && !@mkdir($dir, 0770, true)) throw new RuntimeException("analytics data dir missing: $dir");
  $pdo = new PDO("sqlite:$dir/analytics.sqlite", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  $pdo->exec('PRAGMA busy_timeout = 5000');
  $pdo->exec('PRAGMA journal_mode = WAL');
  $pdo->exec('PRAGMA synchronous = NORMAL');
  migrate($pdo);
  return $pdo;
}

// schema steps, applied in order and counted in PRAGMA user_version
function migrate(PDO $pdo): void {
  $steps = [
    1 => <<<SQL
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, dev INTEGER NOT NULL DEFAULT 0,
        name TEXT, lvl INTEGER, xp INTEGER, cash REAL, deliveries INTEGER, earned REAL, day INTEGER, veh TEXT, districts TEXT,
        rating REAL, onboard INTEGER, fleet INTEGER,
        device TEXT, os TEXT, browser TEXT, lang TEXT, tz TEXT
      );
      CREATE INDEX players_seen ON players(last_seen);
      CREATE INDEX players_first ON players(first_seen);
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL,
        started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, active_ms INTEGER NOT NULL DEFAULT 0,
        is_new INTEGER NOT NULL DEFAULT 0, fresh INTEGER NOT NULL DEFAULT 0, dev INTEGER NOT NULL DEFAULT 0, why TEXT,
        events INTEGER NOT NULL DEFAULT 0, jobs_started INTEGER NOT NULL DEFAULT 0, jobs INTEGER NOT NULL DEFAULT 0,
        deliveries INTEGER NOT NULL DEFAULT 0, earned REAL NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
        crashes INTEGER NOT NULL DEFAULT 0, ride_ms INTEGER NOT NULL DEFAULT 0, buys INTEGER NOT NULL DEFAULT 0,
        spent REAL NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
        lvl_start INTEGER, lvl_end INTEGER, cash_start REAL, cash_end REAL, del_start INTEGER, del_end INTEGER,
        visible INTEGER NOT NULL DEFAULT 1, last_where TEXT,
        fps_sum REAL NOT NULL DEFAULT 0, fps_n INTEGER NOT NULL DEFAULT 0, fps_min REAL,
        device TEXT, os TEXT, browser TEXT, screen TEXT, viewport TEXT, dpr REAL, gpu TEXT, mem REAL, cores INTEGER,
        lang TEXT, tz TEXT, ref TEXT, pwa INTEGER, ua TEXT
      );
      CREATE INDEX sessions_started ON sessions(started_at);
      CREATE INDEX sessions_player ON sessions(player_id, started_at);
      CREATE INDEX sessions_seen ON sessions(last_seen);
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL, player_id TEXT NOT NULL,
        i INTEGER NOT NULL, ts INTEGER NOT NULL, name TEXT NOT NULL, props TEXT,
        UNIQUE (session_id, i)
      );
      CREATE INDEX events_name_ts ON events(name, ts);
      CREATE INDEX events_player_name ON events(player_id, name);
      CREATE TABLE logins (ip TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL);
      CREATE INDEX logins_ip ON logins(ip, ts);
    SQL,
    2 => <<<SQL
      ALTER TABLE sessions ADD COLUMN ip TEXT;
      ALTER TABLE sessions ADD COLUMN model TEXT;
      ALTER TABLE sessions ADD COLUMN os_ver TEXT;
      ALTER TABLE sessions ADD COLUMN browser_ver TEXT;
      ALTER TABLE players ADD COLUMN ip TEXT;
      ALTER TABLE players ADD COLUMN model TEXT;
      CREATE INDEX sessions_ip ON sessions(ip);
    SQL,
    3 => function (PDO $pdo): void {
      $up = $pdo->prepare('UPDATE sessions SET device = ?, os = ?, os_ver = ?, browser = ?, browser_ver = ?, model = ? WHERE id = ?');
      foreach ($pdo->query('SELECT id, ua, screen, dpr, device FROM sessions')->fetchAll() as $r) {
        $d = describe_device((string) $r['ua'], ['scr' => $r['screen'], 'dpr' => $r['dpr'], 'touch' => in_array($r['device'], ['mobile', 'tablet'], true)]);
        $up->execute([$d['device'], $d['os'], $d['os_ver'], $d['browser'], $d['browser_ver'], $d['model'], $r['id']]);
      }
      foreach (['device', 'os', 'browser', 'model'] as $col)
        $pdo->exec("UPDATE players SET $col = (SELECT s.$col FROM sessions s WHERE s.player_id = players.id ORDER BY s.started_at DESC LIMIT 1)");
    },
    4 => <<<SQL
      ALTER TABLE sessions ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN bot_why TEXT;
      ALTER TABLE players ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
    SQL,
    5 => function (PDO $pdo): void {
      $up = $pdo->prepare('UPDATE sessions SET bot = ?, bot_why = ? WHERE id = ?');
      foreach ($pdo->query('SELECT id, ua, screen, dpr, gpu, device, ip FROM sessions')->fetchAll() as $r) { $why = bot_reason($r); $up->execute([$why ? 1 : 0, $why, $r['id']]); }
      $pdo->exec('UPDATE players SET bot = NOT EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = players.id AND s.bot = 0)');
    },
  ];
  $v = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
  foreach ($steps as $n => $sql) {
    if ($n <= $v) continue;
    $pdo->exec('BEGIN IMMEDIATE');
    // another request may have migrated while we waited for the lock
    if ((int) $pdo->query('PRAGMA user_version')->fetchColumn() >= $n) { $pdo->exec('COMMIT'); continue; }
    if (is_callable($sql)) $sql($pdo); else $pdo->exec($sql);
    $pdo->exec("PRAGMA user_version = $n");
    $pdo->exec('COMMIT');
  }
}

function now_ms(): int { return (int) floor(microtime(true) * 1000); }
function num($v, float $def = 0): float { return is_numeric($v) ? (float) $v : $def; }
function str_or_null($v, int $max = 120): ?string { return is_scalar($v) && $v !== '' ? mb_substr((string) $v, 0, $max) : null; }

// device type, OS, browser (with versions) and the model when anything gives it away: the page's client hints
// ($c['model'], $c['osv'] from navigator.userAgentData), in-app browser tags, the Android UA, or for iPhones the screen.
const IPHONE_SCREENS = [ // portrait CSS px @ pixel ratio → family (Display Zoom shifts these, so it stays a guess)
  '320x568@2' => 'iPhone SE (1.)/5s', '375x667@2' => 'iPhone 6/7/8/SE', '414x736@3' => 'iPhone 6/7/8 Plus',
  '375x812@3' => 'iPhone X/XS/11 Pro/12 mini/13 mini', '414x896@2' => 'iPhone XR/11', '414x896@3' => 'iPhone XS Max/11 Pro Max',
  '390x844@3' => 'iPhone 12/13/14/16e', '428x926@3' => 'iPhone 12/13 Pro Max/14 Plus', '393x852@3' => 'iPhone 14 Pro/15/15 Pro/16',
  '430x932@3' => 'iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus', '402x874@3' => 'iPhone 16 Pro/17/17 Pro', '420x912@3' => 'iPhone Air',
  '440x956@3' => 'iPhone 16 Pro Max/17 Pro Max',
];
function describe_device(string $ua, array $c = []): array {
  $touch = !empty($c['touch']);
  $wh = array_map('intval', explode('x', (string) ($c['scr'] ?? '')) + [0, 0]);
  $short = min($wh[0], $wh[1] ?? 0);
  $dpr = (int) round((float) ($c['dpr'] ?? 0));
  $hintVer = is_string($c['osv'] ?? null) ? preg_replace('/(\.0)+$/', '', $c['osv']) : '';
  $hintModel = is_string($c['model'] ?? null) ? trim($c['model']) : '';
  $iosScreen = fn() => isset(IPHONE_SCREENS["{$short}x" . max($wh) . "@$dpr"]) ? '≈ ' . IPHONE_SCREENS["{$short}x" . max($wh) . "@$dpr"] : 'iPhone';

  $osv = null; $model = null;
  if (preg_match('/(iPhone|iPad|iPod)[^)]*? OS (\d+)[_.](\d+)/', $ua, $m)) {
    $os = 'iOS'; $osv = "$m[2].$m[3]";
    $device = $m[1] === 'iPad' ? 'tablet' : 'mobile';
    $model = $m[1] === 'iPad' ? 'iPad' : $iosScreen();
  } elseif (str_contains($ua, 'Macintosh') && $touch) {
    // Safari asks for the desktop site on iPads (and on iPhones set to it): the screen says which
    $os = 'iOS'; $osv = preg_match('/Version\/(\d+\.\d+)/', $ua, $m) ? $m[1] : null;
    $device = $short && $short < 600 ? 'mobile' : 'tablet';
    $model = $device === 'mobile' ? $iosScreen() : 'iPad';
  } elseif (preg_match('/Android[ \/]?(\d+(?:\.\d+)?)?/', $ua, $m)) {
    // Chrome's reduced UA always says "Android 10; K": only the client hint has the real version (and model)
    $os = 'Android'; $osv = $hintVer ?: (str_contains($ua, 'Android 10; K)') ? null : ($m[1] ?? null));
    $device = str_contains($ua, 'Mobile') || ($short && $short < 600) ? 'mobile' : 'tablet';
    if (preg_match('/Android \(\d+\/(\d+);(?:[^;]*;){2} ?([^;]+); ([^;]+);/', $ua, $m)) { $model = ucfirst($m[2]) . ' ' . $m[3]; $osv = $hintVer ?: $m[1]; } // Instagram: (API/version; dpi; res; brand; model;
    elseif (preg_match('/Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?(?:; wv)?\)/', $ua, $m) && $m[1] !== 'K') $model = $m[1];
  } elseif (str_contains($ua, 'CrOS')) { $os = 'ChromeOS'; $device = 'desktop';
  } elseif (preg_match('/Windows NT ([\d.]+)/', $ua, $m)) {
    $os = 'Windows'; $device = 'desktop';
    $osv = ['10.0' => $hintVer !== '' ? ((int) $hintVer >= 13 ? '11' : '10') : '10/11', '6.3' => '8.1', '6.2' => '8', '6.1' => '7'][$m[1]] ?? $m[1];
  } elseif (str_contains($ua, 'Macintosh')) { $os = 'macOS'; $device = 'desktop'; $osv = $hintVer ?: null; // the UA is frozen at 10_15_7
  } elseif (str_contains($ua, 'Linux')) { $os = 'Linux'; $device = 'desktop';
  } else { $os = 'Other'; $device = str_contains($ua, 'Mobile') ? 'mobile' : 'desktop'; }
  if ($hintModel !== '') $model = $hintModel;
  if (preg_match('/FBDV\/([^;\]]+)/', $ua, $m) && $m[1] !== '') $model = $m[1]; // Facebook's in-app browser names the hardware (iPhone18,2)
  if ($model !== null) {
    if (preg_match('/^SM-|^GT-/', $model)) $model = "Samsung $model";
    elseif (preg_match('/^(M2\d{3}[A-Z]|2\d{4,}[A-Z])/', $model)) $model = "Xiaomi $model";
    elseif (str_starts_with($model, 'RMX')) $model = "realme $model";
    elseif (preg_match('/^V2\d{3}/', $model)) $model = "vivo $model";
    $model = mb_substr($model, 0, 60);
  }

  [$browser, $bv] = match (true) {
    (bool) preg_match('/FDSApp\/(\d+)/', $ua, $m) => ['App', $m[1]], // the store apps (mobile/capacitor.config.json)
    (bool) preg_match('/Instagram ([\d]+)/', $ua, $m) => ['Instagram', $m[1]],
    (bool) preg_match('/FBAN|FBAV|FB_IAB/', $ua) => ['Facebook', preg_match('/FBAV\/(\d+)/', $ua, $x) ? $x[1] : null],
    (bool) preg_match('/(?:TikTok|musical_ly|BytedanceWebview)[ _\/]?(\d+)?/', $ua, $m) => ['TikTok', $m[1] ?? null],
    (bool) preg_match('/Snapchat\/(\d+)/', $ua, $m) => ['Snapchat', $m[1]],
    (bool) preg_match('/Twitter|TwitterAndroid/', $ua) => ['X', null],
    (bool) preg_match('/Line\/(\d+)/', $ua, $m) => ['LINE', $m[1]],
    (bool) preg_match('/SamsungBrowser\/(\d+)/', $ua, $m) => ['Samsung', $m[1]],
    (bool) preg_match('/Edg(?:e|A|iOS)?\/(\d+)/', $ua, $m) => ['Edge', $m[1]],
    (bool) preg_match('/(?:OPR|Opera)\/(\d+)/', $ua, $m) => ['Opera', $m[1]],
    (bool) preg_match('/YaBrowser\/(\d+)/', $ua, $m) => ['Yandex', $m[1]],
    (bool) preg_match('/(?:Firefox|FxiOS)\/(\d+)/', $ua, $m) => ['Firefox', $m[1]],
    (bool) preg_match('/; wv\)/', $ua) => ['WebView', null],
    (bool) preg_match('/(?:Chrome|CriOS)\/(\d+)/', $ua, $m) => ['Chrome', $m[1]],
    (bool) preg_match('/Version\/(\d+(?:\.\d+)?).*Safari/', $ua, $m) => ['Safari', $m[1]],
    default => ['Other', null],
  };
  return ['device' => $device, 'os' => $os, 'os_ver' => $osv ?: null, 'browser' => $browser, 'browser_ver' => $bv ?: null, 'model' => $model];
}

// ---------------------------------------------------------------- crawlers
// Link previews, ad review, uptime checks and headless test rigs open the game but never play it; their sessions are
// flagged (sessions.bot + a reason code) and left out of the stats. Re-checked on every batch, since the GPU name
// (and so the verdict) can arrive after the first one.
const BOT_UA = '/(?<!cu)bot\b|crawler|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|HeadlessChrome|Lighthouse|PTST|GTmetrix|Pingdom|UptimeRobot|Google-InspectionTool|Mediapartners|python-requests|python-urllib|curl\/|wget|Go-http-client|okhttp|node-fetch|axios/i';
const META_NETS = ['31.13.24.0/21', '31.13.64.0/18', '45.64.40.0/22', '57.141.0.0/16', '57.144.0.0/14', '66.220.144.0/20', '69.63.176.0/20', '69.171.224.0/19',
  '74.119.76.0/22', '102.132.96.0/20', '103.4.96.0/22', '129.134.0.0/16', '157.240.0.0/16', '163.70.128.0/17', '173.252.64.0/18', '179.60.192.0/22',
  '185.60.216.0/22', '185.89.216.0/22', '204.15.20.0/22', '2a03:2880::/29']; // Meta (AS32934): its crawlers, never its users' phones
function ip_in(string $ip, string $cidr): bool {
  [$net, $bits] = explode('/', $cidr);
  $a = @inet_pton($ip); $b = @inet_pton($net);
  if ($a === false || $b === false || strlen($a) !== strlen($b)) return false;
  $bytes = intdiv((int) $bits, 8); $rest = (int) $bits % 8;
  if (substr($a, 0, $bytes) !== substr($b, 0, $bytes)) return false;
  return $rest === 0 || ((ord($a[$bytes]) ^ ord($b[$bytes])) & (0xFF << (8 - $rest)) & 0xFF) === 0;
}
// null for a person, else why not: ua | meta-ip | screen | nogpu | softgpu.  $s: a sessions row (ua, screen, dpr, gpu, device, ip)
function bot_reason(array $s): ?string {
  if (preg_match(BOT_UA, (string) ($s['ua'] ?? ''))) return 'ua';
  if (!empty($s['ip'])) foreach (META_NETS as $n) if (ip_in($s['ip'], $n)) return 'meta-ip';
  // device emulation (seen from Meta): a 2000×2000 "screen", or a phone at 1× pixel ratio whose WebGL never came up
  if (($s['screen'] ?? '') === '2000x2000') return 'screen';
  if (empty($s['gpu']) && ($s['device'] ?? '') !== 'desktop' && $s['dpr'] !== null && (float) $s['dpr'] <= 1) return 'nogpu';
  if (preg_match('/SwiftShader|llvmpipe|softpipe|Software Rasterizer/i', (string) ($s['gpu'] ?? ''))) return 'softgpu';
  return null;
}

// the visitor's address: REMOTE_ADDR, or the header a proxy / CDN in front puts it in (config ip_header)
function client_ip(): ?string {
  $h = (string) cfg('ip_header');
  $v = $h !== '' && !empty($_SERVER[$h]) ? trim(explode(',', (string) $_SERVER[$h])[0]) : (string) ($_SERVER['REMOTE_ADDR'] ?? '');
  return filter_var($v, FILTER_VALIDATE_IP) ? $v : null;
}

// ---------------------------------------------------------------- ingest
const ID_RE = '/^[A-Za-z0-9_-]{8,64}$/';
const NAME_RE = '/^[a-z][a-z0-9_]{0,31}$/';

// One batch from the game: { v, pid, sid, now, dev, active, fps:[avg,min], st:{…}, ctx:{…} (until acknowledged), ev:[{i,t,n,p}] }
// Returns the number of new events stored. Throws InvalidArgumentException on a malformed batch.
function ingest(array $b, string $ua, ?string $ip = null): int {
  $pid = $b['pid'] ?? null; $sid = $b['sid'] ?? null;
  if (!is_string($pid) || !preg_match(ID_RE, $pid) || !is_string($sid) || !preg_match(ID_RE, $sid)) throw new InvalidArgumentException('bad ids');
  $ev = $b['ev'] ?? [];
  if (!is_array($ev) || count($ev) > 250) throw new InvalidArgumentException('bad events');
  $now = now_ms();
  // client clock → server clock (phones are often minutes off)
  $skew = isset($b['now']) && is_numeric($b['now']) ? $now - (int) $b['now'] : 0;
  $st = is_array($b['st'] ?? null) ? $b['st'] : [];
  $ctx = is_array($b['ctx'] ?? null) ? $b['ctx'] : null;
  $dev = !empty($b['dev']) ? 1 : 0;
  $active = max(0, min((int) num($b['active'] ?? 0), 86400000));

  $clean = [];
  foreach ($ev as $e) {
    if (!is_array($e) || !isset($e['i'], $e['n']) || !is_int($e['i']) || !is_string($e['n']) || !preg_match(NAME_RE, $e['n'])) continue;
    $ts = isset($e['t']) && is_numeric($e['t']) ? max($now - 7 * 86400000, min($now, (int) $e['t'] + $skew)) : $now;
    $p = $e['p'] ?? null;
    $json = $p === null ? null : json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    if ($json !== null && strlen($json) > 8000) $json = json_encode(['_truncated' => true]);
    $clean[] = ['i' => $e['i'], 'ts' => $ts, 'n' => $e['n'], 'p' => is_array($p) ? $p : [], 'json' => $json];
  }

  $pdo = db();
  $pdo->exec('BEGIN IMMEDIATE');
  try {
    $s = $pdo->prepare('SELECT * FROM sessions WHERE id = ?');
    $s->execute([$sid]);
    $sess = $s->fetch();
    $created = !$sess;
    if ($sess && $sess['player_id'] !== $pid) throw new InvalidArgumentException('session belongs to another player');
    if (!$sess) {
      $c = $ctx ?? [];
      $uaStr = mb_substr(is_string($c['ua'] ?? null) ? $c['ua'] : $ua, 0, 400);
      $d = describe_device($uaStr, $c);
      [$device, $os, $browser] = [$d['device'], $d['os'], $d['browser']];
      $p = $pdo->prepare('SELECT sessions FROM players WHERE id = ?'); $p->execute([$pid]);
      $prev = $p->fetchColumn();
      if ($prev === false) {
        $pdo->prepare('INSERT INTO players (id, first_seen, last_seen, dev) VALUES (?, ?, ?, ?)')->execute([$pid, $now, $now, $dev]);
        $prev = 0;
      }
      $start = $clean ? min(array_column($clean, 'ts')) : $now;
      // fresh = no save on the device when the page opened (a brand-new player, not just new to analytics)
      $why = null; $fresh = 0;
      foreach ($clean as $e) if ($e['n'] === 'session_start') { $why = str_or_null($e['p']['why'] ?? null, 20); $fresh = empty($e['p']['saved']) && $why === 'boot' ? 1 : 0; }
      $pdo->prepare('INSERT INTO sessions (id, player_id, started_at, last_seen, is_new, fresh, dev, why, lvl_start, cash_start, del_start,
          device, os, browser, screen, viewport, dpr, gpu, mem, cores, lang, tz, ref, pwa, ua, ip, model, os_ver, browser_ver)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([
        $sid, $pid, $start, $now, (int) $prev === 0 ? 1 : 0, $fresh, $dev, $why,
        isset($st['lvl']) ? (int) num($st['lvl']) : null, isset($st['cash']) ? num($st['cash']) : null, isset($st['del']) ? (int) num($st['del']) : null,
        $device, $os, $browser, str_or_null($c['scr'] ?? null, 20), str_or_null($c['vp'] ?? null, 20), isset($c['dpr']) ? num($c['dpr']) : null,
        str_or_null($c['gpu'] ?? null, 160), isset($c['mem']) ? num($c['mem']) : null, isset($c['cores']) ? (int) num($c['cores']) : null,
        str_or_null($c['lang'] ?? null, 20), str_or_null($c['tz'] ?? null, 50), str_or_null($c['ref'] ?? null, 120), !empty($c['pwa']) ? 1 : 0, $uaStr,
        $ip, $d['model'], $d['os_ver'], $d['browser_ver'],
      ]);
      $pdo->prepare('UPDATE players SET sessions = sessions + 1, device = ?, os = ?, browser = ?, model = COALESCE(?, model), lang = COALESCE(?, lang), tz = COALESCE(?, tz) WHERE id = ?')
        ->execute([$device, $os, $browser, $d['model'], str_or_null($c['lang'] ?? null, 20), str_or_null($c['tz'] ?? null, 50), $pid]);
      $sess = ['events' => 0, 'active_ms' => 0];
    } elseif ($ctx) {
      // the first batch can leave before the renderer (GPU name) or the client hints (model) are in
      $d = describe_device((string) $sess['ua'], $ctx + ['scr' => $sess['screen'], 'dpr' => $sess['dpr']]);
      $pdo->prepare('UPDATE sessions SET gpu = COALESCE(gpu, ?), viewport = COALESCE(viewport, ?), model = COALESCE(model, ?), os_ver = COALESCE(?, os_ver) WHERE id = ?')
        ->execute([str_or_null($ctx['gpu'] ?? null, 160), str_or_null($ctx['vp'] ?? null, 20), $d['model'], $d['os_ver'], $sid]);
      if ($d['model'] !== null) $pdo->prepare('UPDATE players SET model = ? WHERE id = ?')->execute([$d['model'], $pid]);
    }

    // events (a retried batch is ignored by the UNIQUE (session_id, i) key)
    $agg = ['events' => 0, 'jobs_started' => 0, 'jobs' => 0, 'deliveries' => 0, 'earned' => 0.0, 'xp' => 0, 'crashes' => 0, 'ride_ms' => 0, 'buys' => 0, 'spent' => 0.0, 'errors' => 0];
    $room = (int) cfg('max_events_per_session') - (int) $sess['events'];
    $ins = $pdo->prepare('INSERT OR IGNORE INTO events (session_id, player_id, i, ts, name, props) VALUES (?,?,?,?,?,?)');
    foreach ($clean as $e) {
      if ($agg['events'] >= $room) break;
      $ins->execute([$sid, $pid, $e['i'], $e['ts'], $e['n'], $e['json']]);
      if ($ins->rowCount() === 0) continue;
      $agg['events']++;
      $p = $e['p'];
      switch ($e['n']) {
        case 'job_start': $agg['jobs_started']++; break;
        case 'job_end':
          $agg['jobs']++;
          $agg['deliveries'] += is_array($p['orders'] ?? null) ? count($p['orders']) : 0;
          $agg['earned'] += num($p['total'] ?? 0);
          $agg['xp'] += (int) num($p['xp'] ?? 0);
          $agg['crashes'] += (int) num($p['stats']['crashes'] ?? 0);
          $agg['ride_ms'] += (int) (num($p['secs'] ?? 0) * 1000);
          break;
        case 'buy': $agg['buys']++; $agg['spent'] += num($p['cost'] ?? 0); break;
        case 'error': case 'boot_fail': $agg['errors']++; break;
      }
    }

    $fps = is_array($b['fps'] ?? null) && count($b['fps']) === 2 && is_numeric($b['fps'][0]) && is_numeric($b['fps'][1]) && $b['fps'][0] > 0 ? [min(240, (float) $b['fps'][0]), min(240, (float) $b['fps'][1])] : null;
    $visible = isset($st['vis']) ? ($st['vis'] ? 1 : 0) : 1;
    $where = str_or_null($st['where'] ?? null, 40);
    $set = ['last_seen = :now', 'active_ms = MAX(active_ms, :active)', 'visible = :vis', 'last_where = COALESCE(:where, last_where)', 'ip = COALESCE(ip, :ip)'];
    foreach ($agg as $k => $_) $set[] = "$k = $k + :$k";
    $args = [':now' => $now, ':active' => $active, ':vis' => $visible, ':where' => $where, ':ip' => $ip, ':id' => $sid] + array_combine(array_map(fn($k) => ":$k", array_keys($agg)), array_values($agg));
    if (isset($st['lvl'])) { $set[] = 'lvl_end = :lvl'; $set[] = 'lvl_start = COALESCE(lvl_start, :lvl)'; $args[':lvl'] = (int) num($st['lvl']); }
    if (isset($st['cash'])) { $set[] = 'cash_end = :cash'; $set[] = 'cash_start = COALESCE(cash_start, :cash)'; $args[':cash'] = num($st['cash']); }
    if (isset($st['del'])) { $set[] = 'del_end = :del'; $set[] = 'del_start = COALESCE(del_start, :del)'; $args[':del'] = (int) num($st['del']); }
    if ($fps) { $set[] = 'fps_sum = fps_sum + :fa'; $set[] = 'fps_n = fps_n + 1'; $set[] = 'fps_min = MIN(COALESCE(fps_min, :fm), :fm)'; $args[':fa'] = $fps[0]; $args[':fm'] = $fps[1]; }
    $pdo->prepare('UPDATE sessions SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($args);

    // the player row mirrors the latest save snapshot
    $gain = max(0, $active - (int) $sess['active_ms']);
    $pset = ['last_seen = :now', 'active_ms = active_ms + :gain', 'dev = :dev', 'ip = COALESCE(:ip, ip)'];
    $pargs = [':now' => $now, ':gain' => $gain, ':dev' => $dev, ':ip' => $ip, ':id' => $pid];
    $map = ['name' => ['name', 'str'], 'lvl' => ['lvl', 'int'], 'xp' => ['xp', 'int'], 'cash' => ['cash', 'num'], 'del' => ['deliveries', 'int'], 'earned' => ['earned', 'num'],
      'day' => ['day', 'int'], 'veh' => ['veh', 'str'], 'dist' => ['districts', 'str'], 'r' => ['rating', 'num'], 'ob' => ['onboard', 'int'], 'fleet' => ['fleet', 'int']];
    foreach ($map as $k => [$col, $type]) {
      if (!array_key_exists($k, $st)) continue;
      $pset[] = "$col = :$col";
      $pargs[":$col"] = $type === 'str' ? str_or_null($st[$k], 60) : ($type === 'int' ? (int) num($st[$k]) : num($st[$k]));
    }
    $pdo->prepare('UPDATE players SET ' . implode(', ', $pset) . ' WHERE id = :id')->execute($pargs);
    $q = $pdo->prepare('SELECT ua, screen, dpr, gpu, device, ip, bot, bot_why FROM sessions WHERE id = ?'); $q->execute([$sid]);
    $row = $q->fetch();
    $why = bot_reason($row);
    if ($why !== $row['bot_why'] || $created) {
      $pdo->prepare('UPDATE sessions SET bot = ?, bot_why = ? WHERE id = ?')->execute([$why ? 1 : 0, $why, $sid]);
      $pdo->prepare('UPDATE players SET bot = NOT EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = :p AND s.bot = 0) WHERE id = :p')->execute([':p' => $pid]);
    }
    $pdo->exec('COMMIT');
    return $agg['events'];
  } catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    throw $e;
  }
}
