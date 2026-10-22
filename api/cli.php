<?php
// Analytics maintenance from the shell (never over the web).
//   php api/cli.php init [data_dir]     write api/config.local.php with a data folder and a fresh random admin password
//   php api/cli.php set-password        ask for a new admin password and store its hash in config.local.php
//   php api/cli.php info                database location and row counts
//   php api/cli.php prune <days>        delete raw events older than <days> (sessions and players are kept)
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib.php';

$local = __DIR__ . '/config.local.php';
function local_cfg(): array { global $local; return is_file($local) ? (require $local) : []; }
function write_local(array $c): void {
  global $local;
  $out = "<?php\n// Server-only analytics settings (not in git). Overrides api/config.php.\nreturn " . var_export($c, true) . ";\n";
  if (file_put_contents($local, $out) === false) { fwrite(STDERR, "cannot write $local\n"); exit(1); }
  chmod($local, 0640);
}

$cmd = $argv[1] ?? '';
switch ($cmd) {
  case 'init': {
    $c = local_cfg();
    if (!empty($argv[2])) $c['data_dir'] = rtrim($argv[2], '/');
    $pw = rtrim(strtr(base64_encode(random_bytes(12)), '+/', 'xy'), '=');
    $c['admin_password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
    write_local($c);
    echo "wrote $local\nadmin password: $pw\n";
    break;
  }
  case 'set-password': {
    echo 'New admin password: ';
    system('stty -echo 2>/dev/null'); $pw = trim((string) fgets(STDIN)); system('stty echo 2>/dev/null'); echo "\n";
    if (strlen($pw) < 8) { fwrite(STDERR, "at least 8 characters\n"); exit(1); }
    $c = local_cfg(); $c['admin_password_hash'] = password_hash($pw, PASSWORD_DEFAULT); write_local($c);
    echo "saved\n";
    break;
  }
  case 'info': {
    $pdo = db();
    echo 'db: ' . cfg('data_dir') . "/analytics.sqlite\n";
    foreach (['players', 'sessions', 'events'] as $t) echo str_pad($t, 10) . $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn() . "\n";
    break;
  }
  case 'prune': {
    $days = (int) ($argv[2] ?? 0);
    if ($days < 7) { fwrite(STDERR, "usage: prune <days ≥ 7>\n"); exit(1); }
    $pdo = db();
    $n = $pdo->exec('DELETE FROM events WHERE ts < ' . (now_ms() - $days * 86400000));
    $pdo->exec('VACUUM');
    echo "deleted $n events\n";
    break;
  }
  default:
    fwrite(STDERR, "usage: php api/cli.php init [data_dir] | set-password | info | prune <days>\n");
    exit(1);
}
