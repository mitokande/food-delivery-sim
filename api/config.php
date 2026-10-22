<?php
// Analytics settings. Put server-specific values (data_dir, admin_password_hash) in config.local.php next to
// this file (not in git): it returns an array that overrides these defaults. Make one with `php api/cli.php`.
declare(strict_types=1);

$cfg = [
  // where analytics.sqlite lives; must be writable by the PHP user. Prefer a folder outside the web root.
  'data_dir' => __DIR__ . '/data',
  // password_hash() of the admin panel password (php api/cli.php set-password). Empty = panel locked.
  'admin_password_hash' => '',
  // extra page origins allowed to post events (the game's own host is always allowed), e.g. 'https://example.com'
  'allowed_origins' => [],
  // a session stops accepting events after this many (runaway loops, abuse)
  'max_events_per_session' => 20000,
];
if (is_file(__DIR__ . '/config.local.php')) $cfg = array_merge($cfg, require __DIR__ . '/config.local.php');
if (getenv('FDS_DATA_DIR')) $cfg['data_dir'] = getenv('FDS_DATA_DIR'); // tests: point at a throwaway database
return $cfg;
