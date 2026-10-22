<?php
// Analytics admin panel: login form, or the app shell (admin/app.js draws everything from admin/api.php).
declare(strict_types=1);
require __DIR__ . '/auth.php';

header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  if (($_POST['action'] ?? '') === 'logout') logout();
  else {
    $r = try_login((string) ($_POST['password'] ?? ''));
    if ($r !== true) $error = $r;
  }
  if (!$error) { header('Location: ' . cookie_path(), true, 303); exit; }
}
$in = is_admin();
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Analitik · Food Delivery Simulator</title>
<link rel="stylesheet" href="app.css">
</head>
<body>
<?php if (!$in): ?>
<main class="login">
  <form method="post" class="card">
    <h1>Food Delivery Simulator</h1>
    <p class="muted">Analitik paneli</p>
    <?php if (!admin_configured()): ?>
      <p class="err">Panel şifresi henüz ayarlanmamış. Sunucuda <code>php api/cli.php init</code> çalıştır.</p>
    <?php else: ?>
      <label>Şifre<input type="password" name="password" autocomplete="current-password" autofocus required></label>
      <?php if ($error): ?><p class="err"><?= htmlspecialchars($error) ?></p><?php endif; ?>
      <button class="primary">Giriş</button>
    <?php endif; ?>
  </form>
</main>
<?php else: ?>
<header class="top">
  <a class="brand" href="#/overview"><b>Food Delivery Sim</b><span>Analitik</span></a>
  <nav id="nav">
    <a href="#/overview" data-v="overview">Genel bakış</a>
    <a href="#/live" data-v="live">Canlı</a>
    <a href="#/sessions" data-v="sessions session">Oturumlar</a>
    <a href="#/players" data-v="players player">Oyuncular</a>
    <a href="#/gameplay" data-v="gameplay">Oynanış</a>
    <a href="#/errors" data-v="errors">Hatalar</a>
  </nav>
  <form method="post" class="logout"><input type="hidden" name="action" value="logout"><button class="ghost">Çıkış</button></form>
</header>
<div class="filters" id="filters">
  <div class="seg" id="range">
    <button data-r="today">Bugün</button><button data-r="7d">7 gün</button><button data-r="30d">30 gün</button><button data-r="90d">90 gün</button><button data-r="all">Tümü</button>
  </div>
  <label class="chk"><input type="checkbox" id="dev"> Geliştirici cihazları dahil</label>
  <span class="muted small" id="stamp"></span>
</div>
<main id="view"></main>
<div id="tip" class="tip" role="tooltip" hidden></div>
<script type="module" src="app.js"></script>
<?php endif; ?>
</body>
</html>
