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
  ];
  $v = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
  foreach ($steps as $n => $sql) {
    if ($n <= $v) continue;
    $pdo->exec('BEGIN IMMEDIATE');
    // another request may have migrated while we waited for the lock
    if ((int) $pdo->query('PRAGMA user_version')->fetchColumn() >= $n) { $pdo->exec('COMMIT'); continue; }
    $pdo->exec($sql);
    $pdo->exec("PRAGMA user_version = $n");
    $pdo->exec('COMMIT');
  }
}

function now_ms(): int { return (int) floor(microtime(true) * 1000); }
function num($v, float $def = 0): float { return is_numeric($v) ? (float) $v : $def; }
function str_or_null($v, int $max = 120): ?string { return is_scalar($v) && $v !== '' ? mb_substr((string) $v, 0, $max) : null; }

// rough device / OS / browser from the user agent (good enough for a breakdown chart)
function parse_ua(string $ua, bool $touch): array {
  $os = preg_match('/iPhone|iPad|iPod/', $ua) ? 'iOS'
    : (str_contains($ua, 'Android') ? 'Android'
    : (str_contains($ua, 'CrOS') ? 'ChromeOS'
    : (str_contains($ua, 'Windows') ? 'Windows'
    : (str_contains($ua, 'Macintosh') ? ($touch ? 'iOS' : 'macOS') // iPadOS asks for the desktop site
    : (str_contains($ua, 'Linux') ? 'Linux' : 'Other')))));
  $browser = match (true) {
    (bool) preg_match('/FBAN|FBAV|Instagram|TikTok|musical_ly|Snapchat|Twitter|Line\//', $ua) => 'In-app',
    str_contains($ua, 'SamsungBrowser') => 'Samsung',
    (bool) preg_match('/Edg(e|A|iOS)?\//', $ua) => 'Edge',
    (bool) preg_match('/OPR\/|Opera/', $ua) => 'Opera',
    (bool) preg_match('/YaBrowser/', $ua) => 'Yandex',
    (bool) preg_match('/Firefox|FxiOS/', $ua) => 'Firefox',
    (bool) preg_match('/Chrome|CriOS/', $ua) => 'Chrome',
    str_contains($ua, 'Safari') => 'Safari',
    default => 'Other',
  };
  $tablet = str_contains($ua, 'iPad') || ($os === 'iOS' && str_contains($ua, 'Macintosh')) || ($os === 'Android' && !str_contains($ua, 'Mobile'));
  $device = $tablet ? 'tablet' : (in_array($os, ['iOS', 'Android'], true) || str_contains($ua, 'Mobile') ? 'mobile' : 'desktop');
  return [$device, $os, $browser];
}

// ---------------------------------------------------------------- ingest
const ID_RE = '/^[A-Za-z0-9_-]{8,64}$/';
const NAME_RE = '/^[a-z][a-z0-9_]{0,31}$/';

// One batch from the game: { v, pid, sid, now, dev, active, fps:[avg,min], st:{…}, ctx:{…} (until acknowledged), ev:[{i,t,n,p}] }
// Returns the number of new events stored. Throws InvalidArgumentException on a malformed batch.
function ingest(array $b, string $ua): int {
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
    if ($sess && $sess['player_id'] !== $pid) throw new InvalidArgumentException('session belongs to another player');
    if (!$sess) {
      $c = $ctx ?? [];
      $uaStr = mb_substr(is_string($c['ua'] ?? null) ? $c['ua'] : $ua, 0, 400);
      [$device, $os, $browser] = parse_ua($uaStr, !empty($c['touch']));
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
          device, os, browser, screen, viewport, dpr, gpu, mem, cores, lang, tz, ref, pwa, ua)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([
        $sid, $pid, $start, $now, (int) $prev === 0 ? 1 : 0, $fresh, $dev, $why,
        isset($st['lvl']) ? (int) num($st['lvl']) : null, isset($st['cash']) ? num($st['cash']) : null, isset($st['del']) ? (int) num($st['del']) : null,
        $device, $os, $browser, str_or_null($c['scr'] ?? null, 20), str_or_null($c['vp'] ?? null, 20), isset($c['dpr']) ? num($c['dpr']) : null,
        str_or_null($c['gpu'] ?? null, 160), isset($c['mem']) ? num($c['mem']) : null, isset($c['cores']) ? (int) num($c['cores']) : null,
        str_or_null($c['lang'] ?? null, 20), str_or_null($c['tz'] ?? null, 50), str_or_null($c['ref'] ?? null, 120), !empty($c['pwa']) ? 1 : 0, $uaStr,
      ]);
      $pdo->prepare('UPDATE players SET sessions = sessions + 1, device = ?, os = ?, browser = ?, lang = COALESCE(?, lang), tz = COALESCE(?, tz) WHERE id = ?')
        ->execute([$device, $os, $browser, str_or_null($c['lang'] ?? null, 20), str_or_null($c['tz'] ?? null, 50), $pid]);
      $sess = ['events' => 0, 'active_ms' => 0];
    } elseif ($ctx && !empty($ctx['gpu'])) {
      // the first batch can leave before the renderer is up
      $pdo->prepare('UPDATE sessions SET gpu = COALESCE(gpu, ?), viewport = COALESCE(viewport, ?) WHERE id = ?')->execute([str_or_null($ctx['gpu'], 160), str_or_null($ctx['vp'] ?? null, 20), $sid]);
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
    $set = ['last_seen = :now', 'active_ms = MAX(active_ms, :active)', 'visible = :vis', 'last_where = COALESCE(:where, last_where)'];
    foreach ($agg as $k => $_) $set[] = "$k = $k + :$k";
    $args = [':now' => $now, ':active' => $active, ':vis' => $visible, ':where' => $where, ':id' => $sid] + array_combine(array_map(fn($k) => ":$k", array_keys($agg)), array_values($agg));
    if (isset($st['lvl'])) { $set[] = 'lvl_end = :lvl'; $set[] = 'lvl_start = COALESCE(lvl_start, :lvl)'; $args[':lvl'] = (int) num($st['lvl']); }
    if (isset($st['cash'])) { $set[] = 'cash_end = :cash'; $set[] = 'cash_start = COALESCE(cash_start, :cash)'; $args[':cash'] = num($st['cash']); }
    if (isset($st['del'])) { $set[] = 'del_end = :del'; $set[] = 'del_start = COALESCE(del_start, :del)'; $args[':del'] = (int) num($st['del']); }
    if ($fps) { $set[] = 'fps_sum = fps_sum + :fa'; $set[] = 'fps_n = fps_n + 1'; $set[] = 'fps_min = MIN(COALESCE(fps_min, :fm), :fm)'; $args[':fa'] = $fps[0]; $args[':fm'] = $fps[1]; }
    $pdo->prepare('UPDATE sessions SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($args);

    // the player row mirrors the latest save snapshot
    $gain = max(0, $active - (int) $sess['active_ms']);
    $pset = ['last_seen = :now', 'active_ms = active_ms + :gain', 'dev = :dev'];
    $pargs = [':now' => $now, ':gain' => $gain, ':dev' => $dev, ':id' => $pid];
    $map = ['name' => ['name', 'str'], 'lvl' => ['lvl', 'int'], 'xp' => ['xp', 'int'], 'cash' => ['cash', 'num'], 'del' => ['deliveries', 'int'], 'earned' => ['earned', 'num'],
      'day' => ['day', 'int'], 'veh' => ['veh', 'str'], 'dist' => ['districts', 'str'], 'r' => ['rating', 'num'], 'ob' => ['onboard', 'int'], 'fleet' => ['fleet', 'int']];
    foreach ($map as $k => [$col, $type]) {
      if (!array_key_exists($k, $st)) continue;
      $pset[] = "$col = :$col";
      $pargs[":$col"] = $type === 'str' ? str_or_null($st[$k], 60) : ($type === 'int' ? (int) num($st[$k]) : num($st[$k]));
    }
    $pdo->prepare('UPDATE players SET ' . implode(', ', $pset) . ' WHERE id = :id')->execute($pargs);
    $pdo->exec('COMMIT');
    return $agg['events'];
  } catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    throw $e;
  }
}
