<?php
// Admin login: one password (hash in api/config.local.php), a signed cookie, no server-side sessions.
// The signing key comes from the password hash, so changing the password logs every browser out.
declare(strict_types=1);
require __DIR__ . '/../api/lib.php';

const COOKIE = 'fds_admin';
const COOKIE_DAYS = 30;

function admin_key(): string { return hash_hmac('sha256', 'fds-admin-cookie', (string) cfg('admin_password_hash')); }
function cookie_path(): string { return rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/'; }
function is_https(): bool { return ($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'; }
function set_admin_cookie(string $v, int $exp): void {
  setcookie(COOKIE, $v, ['expires' => $exp, 'path' => cookie_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}

function admin_configured(): bool { return (string) cfg('admin_password_hash') !== ''; }
function is_admin(): bool {
  if (!admin_configured()) return false;
  $c = $_COOKIE[COOKIE] ?? '';
  if (!preg_match('/^(\d{10})\.([a-f0-9]{64})$/', $c, $m)) return false;
  return (int) $m[1] > time() && hash_equals(hash_hmac('sha256', $m[1], admin_key()), $m[2]);
}

// true, or an error message for the login form
function try_login(string $password) {
  if (!admin_configured()) return 'Panel şifresi ayarlanmamış (php api/cli.php init).';
  $pdo = db();
  $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
  $since = now_ms() - 15 * 60000;
  $q = $pdo->prepare('SELECT COUNT(*) FROM logins WHERE ip = ? AND ts > ? AND ok = 0');
  $q->execute([$ip, $since]);
  if ((int) $q->fetchColumn() >= 8) return 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.';
  $ok = password_verify($password, (string) cfg('admin_password_hash'));
  $pdo->prepare('INSERT INTO logins (ip, ts, ok) VALUES (?, ?, ?)')->execute([$ip, now_ms(), $ok ? 1 : 0]);
  $pdo->exec('DELETE FROM logins WHERE ts < ' . (now_ms() - 7 * 86400000));
  if (!$ok) { usleep(600000); return 'Şifre yanlış.'; }
  $exp = time() + COOKIE_DAYS * 86400;
  set_admin_cookie($exp . '.' . hash_hmac('sha256', (string) $exp, admin_key()), $exp);
  return true;
}
function logout(): void { set_admin_cookie('', time() - 3600); }
