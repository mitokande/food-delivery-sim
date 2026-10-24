<?php
// Read-only JSON for the admin panel: api.php?q=overview|live|sessions|session|players|player|gameplay|errors
// Common parameters: from, to (epoch ms), tz (viewer's UTC offset in minutes, for day buckets), dev (1 = include developer devices),
// bots (1 = include crawler sessions, see bot_reason() in api/lib.php).
declare(strict_types=1);
require __DIR__ . '/auth.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!is_admin()) { http_response_code(401); echo '{"error":"login"}'; exit; }
set_exception_handler(function (Throwable $e) {
  error_log('fds admin api: ' . $e->getMessage());
  http_response_code(500);
  echo json_encode(['error' => 'sunucu hatası']);
});

$pdo = db();
$NOW = now_ms();
$from = max(0, (int) ($_GET['from'] ?? 0));
$to = (int) ($_GET['to'] ?? 0) ?: $NOW + 1;
$TZS = max(-14 * 3600, min(14 * 3600, (int) ($_GET['tz'] ?? 0) * 60)); // seconds, safe to inline
$DEV = !empty($_GET['dev']);
$BOTS = !empty($_GET['bots']);
// the traffic every number leaves out by default: developer devices and crawlers (sessions alias s, players alias p)
$devS = ($DEV ? '1' : 's.dev = 0') . ($BOTS ? '' : ' AND s.bot = 0');
$devP = ($DEV ? '1' : 'p.dev = 0') . ($BOTS ? '' : ' AND p.bot = 0');
$day = fn(string $col) => "date($col / 1000 + $TZS, 'unixepoch')";
$range = ['f' => $from, 't' => $to];

function rows(string $sql, array $args = []): array { global $pdo; $s = $pdo->prepare($sql); $s->execute($args); return $s->fetchAll(); }
function row(string $sql, array $args = []): array { return rows($sql, $args)[0] ?? []; }
function val(string $sql, array $args = []) { global $pdo; $s = $pdo->prepare($sql); $s->execute($args); return $s->fetchColumn(); }
function median(array $xs): ?float { if (!$xs) return null; sort($xs); $n = count($xs); return $n % 2 ? (float) $xs[intdiv($n, 2)] : ($xs[$n / 2 - 1] + $xs[$n / 2]) / 2; }
function out(array $d): never { echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function decode_props(array $rs): array { foreach ($rs as &$r) if (array_key_exists('props', $r)) $r['props'] = $r['props'] === null ? null : json_decode($r['props'], true); return $rs; }

// the slice of sessions every overview number is computed from
function kpis(int $f, int $t): array {
  global $devS;
  $a = ['f' => $f, 't' => $t];
  $k = row("SELECT COUNT(*) sessions, COUNT(DISTINCT player_id) players, COALESCE(SUM(is_new), 0) new_players, COALESCE(SUM(active_ms), 0) active_ms,
      COALESCE(SUM(deliveries), 0) deliveries, COALESCE(SUM(jobs_started), 0) jobs_started, COALESCE(SUM(jobs), 0) jobs, COALESCE(SUM(earned), 0) earned,
      COALESCE(SUM(errors), 0) errors, COALESCE(SUM(buys), 0) buys
    FROM sessions s WHERE started_at >= :f AND started_at < :t AND $devS", $a);
  $k['median_ms'] = median(array_map('intval', array_column(rows("SELECT active_ms FROM sessions s WHERE started_at >= :f AND started_at < :t AND $devS", $a), 'active_ms')));
  $k['avg_ms'] = $k['sessions'] ? $k['active_ms'] / $k['sessions'] : null;
  return $k;
}

$q = $_GET['q'] ?? '';
switch ($q) {
  // ------------------------------------------------------------ overview
  case 'overview': {
    $k = kpis($from, $to);
    $prev = $from > 0 ? kpis($from - ($to - $from), $from) : null;
    $k['online'] = (int) val("SELECT COUNT(*) FROM sessions s WHERE last_seen > ? AND visible = 1 AND $devS", [$NOW - 75000]);
    // how many crawler sessions the numbers above leave out
    $k['bots'] = (int) val('SELECT COUNT(*) FROM sessions s WHERE started_at >= :f AND started_at < :t AND bot = 1 AND ' . ($DEV ? '1' : 's.dev = 0'), $range);

    $daily = rows("SELECT {$day('started_at')} day, COUNT(DISTINCT player_id) players, SUM(is_new) new_players, COUNT(*) sessions,
        ROUND(SUM(active_ms) / 60000.0, 1) minutes, SUM(deliveries) deliveries
      FROM sessions s WHERE started_at >= :f AND started_at < :t AND $devS GROUP BY day ORDER BY day", $range);
    // fill the days nobody played
    $first = $from ?: (int) (val("SELECT MIN(started_at) FROM sessions s WHERE $devS") ?: $NOW);
    $byDay = array_column($daily, null, 'day');
    $days = [];
    for ($d = (int) floor(($first / 1000 + $TZS) / 86400), $e = (int) floor((min($to, $NOW) / 1000 + $TZS) / 86400), $i = 0; $d <= $e && $i < 400; $d++, $i++) {
      $key = gmdate('Y-m-d', $d * 86400);
      $days[] = $byDay[$key] ?? ['day' => $key, 'players' => 0, 'new_players' => 0, 'sessions' => 0, 'minutes' => 0, 'deliveries' => 0];
    }

    // new players (no save on the device) and how far they got
    $funnel = row("WITH c AS (SELECT DISTINCT player_id id FROM sessions s WHERE is_new = 1 AND fresh = 1 AND started_at >= :f AND started_at < :t AND $devS)
      SELECT COUNT(*) opened,
        COALESCE(SUM(EXISTS (SELECT 1 FROM events e WHERE e.player_id = c.id AND e.name = 'boot')), 0) loaded,
        COALESCE(SUM(EXISTS (SELECT 1 FROM events e WHERE e.player_id = c.id AND e.name = 'intro_done')), 0) intro,
        COALESCE(SUM(EXISTS (SELECT 1 FROM events e WHERE e.player_id = c.id AND e.name = 'job_start')), 0) rode,
        COALESCE(SUM(p.deliveries >= 1), 0) delivered,
        COALESCE(SUM(p.onboard >= 99), 0) tutorial,
        COALESCE(SUM(p.deliveries >= 5), 0) del5,
        COALESCE(SUM(p.lvl >= 3), 0) lvl3,
        COALESCE(SUM(EXISTS (SELECT 1 FROM events e WHERE e.player_id = c.id AND e.name = 'buy' AND json_extract(e.props, '$.k') = 'vehicle')), 0) vehicle,
        COALESCE(SUM(p.districts LIKE '%downtown%'), 0) downtown,
        COALESCE(SUM(p.sessions >= 2), 0) returned
      FROM c JOIN players p ON p.id = c.id", $range);

    // day-N retention by first-day cohort (only cohorts old enough count toward an average)
    $today = (int) floor(($NOW / 1000 + $TZS) / 86400);
    $ret = rows("WITH c AS (SELECT player_id, {$day('started_at')} d0 FROM sessions s WHERE is_new = 1 AND started_at >= :f AND started_at < :t AND $devS),
        a AS (SELECT DISTINCT player_id, {$day('started_at')} d FROM sessions WHERE started_at >= :f)
      SELECT c.d0, COUNT(DISTINCT c.player_id) n,
        COUNT(DISTINCT CASE WHEN julianday(a.d) - julianday(c.d0) = 1 THEN c.player_id END) d1,
        COUNT(DISTINCT CASE WHEN julianday(a.d) - julianday(c.d0) = 3 THEN c.player_id END) d3,
        COUNT(DISTINCT CASE WHEN julianday(a.d) - julianday(c.d0) = 7 THEN c.player_id END) d7,
        COUNT(DISTINCT CASE WHEN julianday(a.d) - julianday(c.d0) = 14 THEN c.player_id END) d14,
        COUNT(DISTINCT CASE WHEN julianday(a.d) - julianday(c.d0) = 30 THEN c.player_id END) d30
      FROM c LEFT JOIN a ON a.player_id = c.player_id GROUP BY c.d0 ORDER BY c.d0 DESC LIMIT 60", $range);
    $avg = [];
    foreach ($ret as &$r) {
      $r['age'] = $today - (int) floor(strtotime($r['d0'] . ' UTC') / 86400);
      foreach ([1, 3, 7, 14, 30] as $n) if ($r['age'] >= $n) { $avg[$n][0] = ($avg[$n][0] ?? 0) + $r["d$n"]; $avg[$n][1] = ($avg[$n][1] ?? 0) + $r['n']; }
    }
    unset($r);
    $k['d1'] = isset($avg[1]) && $avg[1][1] ? $avg[1][0] / $avg[1][1] : null;
    $k['d7'] = isset($avg[7]) && $avg[7][1] ? $avg[7][0] / $avg[7][1] : null;

    $by = fn(string $col) => rows("SELECT COALESCE($col, '?') k, COUNT(*) n FROM sessions s WHERE started_at >= :f AND started_at < :t AND $devS GROUP BY 1 ORDER BY 2 DESC LIMIT 10", $range);
    $hours = rows("SELECT CAST(strftime('%H', started_at / 1000 + $TZS, 'unixepoch') AS INTEGER) h, COUNT(*) n FROM sessions s WHERE started_at >= :f AND started_at < :t AND $devS GROUP BY h", $range);
    $quit = rows("SELECT COALESCE(last_where, '?') k, COUNT(*) n FROM sessions s WHERE started_at >= :f AND started_at < :t AND last_seen < :old AND $devS GROUP BY 1 ORDER BY 2 DESC LIMIT 12", $range + ['old' => $NOW - 120000]);
    $fps = rows("SELECT CASE WHEN f < 20 THEN '<20' WHEN f < 30 THEN '20–30' WHEN f < 45 THEN '30–45' WHEN f < 55 THEN '45–55' ELSE '55+' END k, COUNT(*) n
      FROM (SELECT fps_sum / fps_n f FROM sessions s WHERE fps_n > 0 AND started_at >= :f AND started_at < :t AND $devS) GROUP BY k", $range);
    $gpus = rows("SELECT COALESCE(gpu, '?') gpu, COUNT(*) n, ROUND(SUM(fps_sum) / SUM(fps_n), 1) fps, ROUND(MIN(fps_min), 1) worst
      FROM sessions s WHERE fps_n > 0 AND started_at >= :f AND started_at < :t AND $devS GROUP BY gpu ORDER BY n DESC LIMIT 12", $range);
    out(['kpis' => $k, 'prev' => $prev, 'daily' => $days, 'funnel' => $funnel, 'retention' => $ret, 'devices' => $by('device'), 'os' => $by('os'), 'models' => $by('model'),
      'browsers' => $by('browser'), 'hours' => $hours, 'quit' => $quit, 'fps' => $fps, 'gpus' => $gpus]);
  }

  // ------------------------------------------------------------ who is playing right now
  case 'live': {
    $s = rows("SELECT s.id, s.player_id, p.name, s.started_at, s.last_seen, s.active_ms, s.visible, s.last_where, s.lvl_end, s.cash_end, s.deliveries, s.earned,
        s.device, s.os, s.os_ver, s.browser, s.browser_ver, s.model, s.ip, s.is_new, s.bot, s.bot_why
      FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.last_seen > ? AND $devS ORDER BY s.last_seen DESC LIMIT 100", [$NOW - 10 * 60000]);
    $feed = rows("SELECT e.session_id, e.player_id, p.name, e.ts, e.name ev, e.props FROM events e JOIN sessions s ON s.id = e.session_id JOIN players p ON p.id = e.player_id
      WHERE e.ts > ? AND e.name NOT IN ('app_show', 'tab') AND $devS ORDER BY e.ts DESC LIMIT 60", [$NOW - 30 * 60000]);
    out(['now' => $NOW, 'sessions' => $s, 'feed' => decode_props($feed)]);
  }

  // ------------------------------------------------------------ sessions table
  case 'sessions': {
    $where = ["$devS"]; $args = [];
    if (!empty($_GET['player'])) { $where[] = 's.player_id = :pl'; $args['pl'] = (string) $_GET['player']; }
    else { $where[] = 's.started_at >= :f AND s.started_at < :t'; $args += $range; }
    if (!empty($_GET['search'])) { $where[] = '(p.name LIKE :qs OR s.player_id LIKE :qs OR s.id LIKE :qs OR s.ip LIKE :qs OR s.model LIKE :qs)'; $args['qs'] = '%' . $_GET['search'] . '%'; }
    if (!empty($_GET['new'])) $where[] = 's.is_new = 1';
    if (!empty($_GET['err'])) $where[] = 's.errors > 0';
    if (!empty($_GET['min'])) { $where[] = 's.active_ms >= :min'; $args['min'] = (int) $_GET['min'] * 60000; }
    $sorts = ['started' => 's.started_at', 'active' => 's.active_ms', 'deliveries' => 's.deliveries', 'earned' => 's.earned', 'events' => 's.events', 'lvl' => 's.lvl_end', 'errors' => 's.errors'];
    $sort = $sorts[$_GET['sort'] ?? ''] ?? 's.started_at';
    $dir = ($_GET['dir'] ?? '') === 'asc' ? 'ASC' : 'DESC';
    $page = max(0, (int) ($_GET['page'] ?? 0));
    $w = implode(' AND ', $where);
    $total = (int) val("SELECT COUNT(*) FROM sessions s JOIN players p ON p.id = s.player_id WHERE $w", $args);
    $list = rows("SELECT s.id, s.player_id, p.name, s.started_at, s.last_seen, s.active_ms, s.visible, s.is_new, s.fresh, s.dev, s.bot, s.bot_why, s.why, s.events, s.jobs, s.jobs_started,
        s.deliveries, s.earned, s.crashes, s.buys, s.spent, s.errors, s.lvl_start, s.lvl_end, s.cash_start, s.cash_end, s.last_where,
        CASE WHEN s.fps_n > 0 THEN ROUND(s.fps_sum / s.fps_n, 1) END fps, s.device, s.os, s.os_ver, s.browser, s.browser_ver, s.model, s.ip
      FROM sessions s JOIN players p ON p.id = s.player_id WHERE $w ORDER BY $sort $dir, s.started_at DESC LIMIT 50 OFFSET " . ($page * 50), $args);
    out(['total' => $total, 'page' => $page, 'rows' => $list, 'now' => $NOW]);
  }

  case 'session': {
    $id = (string) ($_GET['id'] ?? '');
    $s = row('SELECT s.*, CASE WHEN s.fps_n > 0 THEN ROUND(s.fps_sum / s.fps_n, 1) END fps FROM sessions s WHERE id = ?', [$id]);
    if (!$s) { http_response_code(404); out(['error' => 'not found']); }
    $p = row('SELECT * FROM players WHERE id = ?', [$s['player_id']]);
    $nth = (int) val('SELECT COUNT(*) FROM sessions WHERE player_id = ? AND started_at <= ?', [$s['player_id'], $s['started_at']]);
    $nav = [
      'prev' => val('SELECT id FROM sessions WHERE player_id = ? AND started_at < ? ORDER BY started_at DESC LIMIT 1', [$s['player_id'], $s['started_at']]) ?: null,
      'next' => val('SELECT id FROM sessions WHERE player_id = ? AND started_at > ? ORDER BY started_at LIMIT 1', [$s['player_id'], $s['started_at']]) ?: null,
    ];
    $ev = decode_props(rows('SELECT i, ts, name, props FROM events WHERE session_id = ? ORDER BY i LIMIT 5000', [$id]));
    out(['session' => $s, 'player' => $p, 'nth' => $nth, 'nav' => $nav, 'events' => $ev, 'now' => $NOW]);
  }

  // ------------------------------------------------------------ players
  case 'players': {
    $where = [$devP]; $args = [];
    if (empty($_GET['all'])) { $where[] = 'EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = p.id AND s.started_at >= :f AND s.started_at < :t)'; $args += $range; }
    if (!empty($_GET['search'])) { $where[] = '(p.name LIKE :qs OR p.id LIKE :qs OR p.ip LIKE :qs OR p.model LIKE :qs)'; $args['qs'] = '%' . $_GET['search'] . '%'; }
    $sorts = ['last' => 'p.last_seen', 'first' => 'p.first_seen', 'active' => 'p.active_ms', 'lvl' => 'p.lvl', 'deliveries' => 'p.deliveries', 'sessions' => 'p.sessions', 'cash' => 'p.cash', 'earned' => 'p.earned'];
    $sort = $sorts[$_GET['sort'] ?? ''] ?? 'p.last_seen';
    $dir = ($_GET['dir'] ?? '') === 'asc' ? 'ASC' : 'DESC';
    $page = max(0, (int) ($_GET['page'] ?? 0));
    $w = implode(' AND ', $where);
    $total = (int) val("SELECT COUNT(*) FROM players p WHERE $w", $args);
    $list = rows("SELECT p.* FROM players p WHERE $w ORDER BY $sort $dir LIMIT 50 OFFSET " . ($page * 50), $args);
    out(['total' => $total, 'page' => $page, 'rows' => $list, 'now' => $NOW]);
  }

  case 'player': {
    $id = (string) ($_GET['id'] ?? '');
    $p = row('SELECT * FROM players WHERE id = ?', [$id]);
    if (!$p) { http_response_code(404); out(['error' => 'not found']); }
    $sessions = rows("SELECT id, started_at, last_seen, active_ms, visible, is_new, bot, bot_why, why, events, jobs, deliveries, earned, crashes, buys, spent, errors, lvl_start, lvl_end,
        cash_end, last_where, device, os, os_ver, browser, browser_ver, model, ip, CASE WHEN fps_n > 0 THEN ROUND(fps_sum / fps_n, 1) END fps
      FROM sessions WHERE player_id = ? ORDER BY started_at DESC LIMIT 300", [$id]);
    $levels = decode_props(rows("SELECT ts, props FROM events WHERE player_id = ? AND name = 'level_up' ORDER BY ts", [$id]));
    $buys = decode_props(rows("SELECT ts, name, props FROM events WHERE player_id = ? AND name IN ('buy', 'achievement') ORDER BY ts DESC LIMIT 200", [$id]));
    $rides = row("SELECT COUNT(*) n, AVG(json_extract(o.value, '$.stars')) stars, AVG(json_extract(o.value, '$.early')) early, AVG(json_extract(o.value, '$.late')) late
      FROM events e, json_each(e.props, '$.orders') o WHERE e.player_id = ? AND e.name = 'job_end'", [$id]);
    $districts = rows("SELECT json_extract(o.value, '$.d') d, COUNT(*) n, AVG(json_extract(o.value, '$.stars')) stars
      FROM events e, json_each(e.props, '$.orders') o WHERE e.player_id = ? AND e.name = 'job_end' GROUP BY d ORDER BY n DESC", [$id]);
    out(['player' => $p, 'sessions' => $sessions, 'levels' => $levels, 'buys' => $buys, 'rides' => $rides, 'districts' => $districts, 'now' => $NOW]);
  }

  // ------------------------------------------------------------ how the game plays
  case 'gameplay': {
    $ev = fn(string $name, string $sel, string $group = '', string $order = '', string $extra = '') => rows(
      "SELECT $sel FROM events e JOIN sessions s ON s.id = e.session_id $extra WHERE e.name = '$name' AND e.ts >= :f AND e.ts < :t AND $devS"
      . ($group ? " GROUP BY $group" : '') . ($order ? " ORDER BY $order" : ''), $range);
    $orderAgg = "COUNT(*) n, AVG(json_extract(o.value, '$.stars')) stars, AVG(json_extract(o.value, '$.early')) early, AVG(json_extract(o.value, '$.late')) late,
      AVG(json_extract(o.value, '$.pay') + json_extract(o.value, '$.tip') + json_extract(o.value, '$.bonus')) pay, AVG(json_extract(o.value, '$.tip')) tip,
      AVG(json_extract(o.value, '$.ratio')) ratio, AVG(json_extract(o.value, '$.cond')) cond";
    $orders = ", json_each(e.props, '$.orders') o";
    $districts = $ev('job_end', "json_extract(o.value, '$.d') k, $orderAgg", 'k', 'n DESC', $orders);
    $types = $ev('job_end', "json_extract(o.value, '$.type') k, $orderAgg", 'k', 'n DESC', $orders);
    $stars = $ev('job_end', "json_extract(o.value, '$.stars') k, COUNT(*) n", 'k', 'k', $orders);
    $rides = $ev('job_end', "COUNT(*) n, AVG(json_extract(e.props, '$.secs')) secs, AVG(json_extract(e.props, '$.m')) m, AVG(json_extract(e.props, '$.total')) total,
      AVG(json_extract(e.props, '$.xp')) xp, AVG(json_extract(e.props, '$.fines')) fines, AVG(json_extract(e.props, '$.fuel')) fuel,
      AVG(json_extract(e.props, '$.stats.crashes')) crashes, AVG(json_extract(e.props, '$.stats.overtakes')) overtakes, AVG(json_extract(e.props, '$.stats.perfect')) perfect,
      AVG(json_extract(e.props, '$.stats.hops')) hops, AVG(json_extract(e.props, '$.stats.shortcuts')) shortcuts, AVG(json_extract(e.props, '$.stats.boostT')) boost,
      AVG(json_extract(e.props, '$.stats.stopT')) stop, AVG(json_extract(e.props, '$.stats.nearMisses')) near, AVG(json_extract(e.props, '$.stats.bestFlow')) flow,
      AVG(json_extract(e.props, '$.stats.events')) events, AVG(json_extract(e.props, '$.stats.horns')) horns")[0] ?? [];
    $rides['started'] = (int) ($ev('job_start', 'COUNT(*) n')[0]['n'] ?? 0);
    $vehicles = $ev('job_end', "json_extract(e.props, '$.veh') k, COUNT(*) n, AVG(json_extract(e.props, '$.secs')) secs, AVG(json_extract(e.props, '$.total')) total, AVG(json_extract(e.props, '$.stats.crashes')) crashes", 'k', 'n DESC');
    // auto-drive vs riding yourself (desktop keyboard)
    $modes = $ev('job_end', "COALESCE(json_extract(e.props, '$.manual'), 0) k, COUNT(*) n, AVG(json_extract(e.props, '$.secs')) secs, AVG(json_extract(e.props, '$.total')) total,
      AVG(json_extract(e.props, '$.stats.crashes')) crashes, AVG(json_extract(e.props, '$.stats.skids')) skids, AVG(json_extract(e.props, '$.stats.reroutes')) reroutes,
      AVG(json_extract(e.props, '$.stats.overtakes')) overtakes", 'k', 'k');
    $modeOrders = array_column($ev('job_end', "COALESCE(json_extract(e.props, '$.manual'), 0) k, AVG(json_extract(o.value, '$.stars')) stars, AVG(json_extract(o.value, '$.late')) late", 'k', '', $orders), null, 'k');
    foreach ($modes as &$m) $m += ['stars' => $modeOrders[$m['k']]['stars'] ?? null, 'late' => $modeOrders[$m['k']]['late'] ?? null];
    unset($m);
    $events = $ev('ride_event', "json_extract(e.props, '$.id') k, COUNT(*) n, AVG(json_extract(e.props, '$.good')) good, SUM(json_extract(e.props, '$.opt') = 0) o0,
      SUM(json_extract(e.props, '$.opt') = 1) o1, AVG(json_extract(e.props, '$.auto')) auto", 'k', 'n DESC');
    $crashes = $ev('crash', "json_extract(e.props, '$.why') k, COUNT(*) n", 'k', 'n DESC LIMIT 15');
    $buys = $ev('buy', "json_extract(e.props, '$.k') kind, json_extract(e.props, '$.id') item, COUNT(*) n, SUM(json_extract(e.props, '$.cost')) spent, AVG(json_extract(e.props, '$.lvl')) lvl", 'kind, item', 'n DESC LIMIT 40');
    $levelRows = $ev('level_up', "json_extract(e.props, '$.lvl') lvl, json_extract(e.props, '$.pm') pm, json_extract(e.props, '$.del') del");
    $lv = [];
    foreach ($levelRows as $r) { $lv[(int) $r['lvl']]['pm'][] = (float) $r['pm']; $lv[(int) $r['lvl']]['del'][] = (float) $r['del']; }
    ksort($lv);
    $levels = [];
    foreach ($lv as $l => $x) $levels[] = ['lvl' => $l, 'n' => count($x['pm']), 'pm' => median($x['pm']), 'del' => median($x['del'])];
    $lvlDist = rows("SELECT p.lvl k, COUNT(*) n FROM players p WHERE $devP AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_id = p.id AND s.started_at >= :f AND s.started_at < :t) GROUP BY p.lvl ORDER BY p.lvl", $range);
    $tutorial = $ev('onboard_step', "json_extract(e.props, '$.step') k, COUNT(DISTINCT e.player_id) n", 'k', 'k + 0');
    $tabs = $ev('tab', "json_extract(e.props, '$.tab') k, COUNT(*) n", 'k', 'n DESC');
    $ach = $ev('achievement', "json_extract(e.props, '$.id') k, COUNT(*) n", 'k', 'n DESC');
    $claims = $ev('claim', "json_extract(e.props, '$.k') k, COUNT(*) n, SUM(json_extract(e.props, '$.reward')) reward", 'k', 'n DESC');
    out(compact('districts', 'types', 'stars', 'rides', 'modes', 'vehicles', 'events', 'crashes', 'buys', 'levels', 'lvlDist', 'tutorial', 'tabs', 'ach', 'claims'));
  }

  // ------------------------------------------------------------ errors, grouped by message
  case 'errors': {
    $g = rows("SELECT json_extract(e.props, '$.msg') msg, e.name kind, COUNT(*) n, COUNT(DISTINCT e.session_id) sessions, COUNT(DISTINCT e.player_id) players,
        MIN(e.ts) first, MAX(e.ts) last, MAX(e.id) sample, GROUP_CONCAT(DISTINCT s.browser || ' / ' || s.os) envs
      FROM events e JOIN sessions s ON s.id = e.session_id WHERE e.name IN ('error', 'boot_fail') AND e.ts >= :f AND e.ts < :t AND $devS
      GROUP BY msg, kind ORDER BY n DESC LIMIT 100", $range);
    foreach ($g as &$r) {
      $x = row('SELECT session_id, props FROM events WHERE id = ?', [$r['sample']]);
      $r['session'] = $x['session_id'] ?? null;
      $r['props'] = isset($x['props']) ? json_decode($x['props'], true) : null;
    }
    unset($r);
    out(['groups' => $g]);
  }

  default:
    http_response_code(400);
    out(['error' => 'unknown query']);
}
