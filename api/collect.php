<?php
// Analytics collector: the game POSTs batches of events here (fetch keepalive, or sendBeacon when the page hides).
// Body is JSON sent as text/plain so the browser needs no preflight. See js/analytics.js for the format.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $body): never { http_response_code($code); echo json_encode($body); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['ok' => false]);
// only pages of this site (plus any configured embed hosts) may post
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== 'null') {
  $self = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
  if (parse_url($origin, PHP_URL_HOST) !== $self && !in_array($origin, (array) cfg('allowed_origins'), true)) reply(403, ['ok' => false]);
}
$raw = file_get_contents('php://input', false, null, 0, 262145);
if ($raw === false || $raw === '') reply(400, ['ok' => false]);
if (strlen($raw) > 262144) reply(413, ['ok' => false]);
$b = json_decode($raw, true);
if (!is_array($b) || ($b['v'] ?? null) !== 1) reply(400, ['ok' => false]);

try {
  $n = ingest($b, $_SERVER['HTTP_USER_AGENT'] ?? '');
  reply(200, ['ok' => true, 'n' => $n]);
} catch (InvalidArgumentException $e) {
  reply(400, ['ok' => false]);
} catch (Throwable $e) {
  error_log('fds analytics: ' . $e->getMessage());
  reply(500, ['ok' => false]);
}
