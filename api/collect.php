<?php
// Analytics collector: the game POSTs batches of events here (fetch, or sendBeacon when the page hides).
// Body is JSON, sent as application/json (old Chrome's beacon falls back to text/plain; both are read the same way).
// See js/analytics.js for the format.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $body): never { http_response_code($code); echo json_encode($body); exit; }

// only pages of this site (plus the store apps and any configured embed hosts) may post
// the store apps (mobile/) serve the game from the phone: Android as https://localhost, iOS as capacitor://localhost
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== 'null') {
  $self = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
  if (parse_url($origin, PHP_URL_HOST) !== $self) {
    if (!in_array($origin, [...APP_ORIGINS, ...(array) cfg('allowed_origins')], true)) reply(403, ['ok' => false]);
    // an app or embed host: a JSON body makes its browser ask first (preflight)
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Credentials: true'); // sendBeacon always sends with credentials (no cookies are read here)
    header('Vary: Origin');
  }
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['ok' => false]);
$raw = file_get_contents('php://input', false, null, 0, 262145);
if ($raw === false || $raw === '') reply(400, ['ok' => false]);
if (strlen($raw) > 262144) reply(413, ['ok' => false]);
$b = json_decode($raw, true);
if (!is_array($b) || ($b['v'] ?? null) !== 1) reply(400, ['ok' => false]);

try {
  $n = ingest($b, $_SERVER['HTTP_USER_AGENT'] ?? '', client_ip());
  try { housekeep(); } catch (Throwable $e) { error_log('fds analytics housekeep: ' . $e->getMessage()); } // (never costs the batch)
  reply(200, ['ok' => true, 'n' => $n]);
} catch (InvalidArgumentException $e) {
  reply(400, ['ok' => false]);
} catch (Throwable $e) {
  error_log('fds analytics: ' . $e->getMessage());
  reply(500, ['ok' => false]);
}
