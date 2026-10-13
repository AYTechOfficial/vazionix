/**
 * BotKeep boot wrapper — the platform requires a process listening on
 * SERVER_PORT within ~2 minutes of start, but a production `next build`
 * takes longer. This wrapper binds the port immediately:
 *
 *   - `.next/BUILD_ID` present  → the app is built; spawn `next start` and
 *     keep this process attached to it for the lifetime of the server.
 *   - build missing             → bind a minimal placeholder on SERVER_PORT
 *     (satisfies the startup check), run `npm run build` as a child, and exit
 *     cleanly when it succeeds; BotKeep restarts the container and this script
 *     takes the built-server path on the next boot.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const HOST = '0.0.0.0';

const log = (...args) => console.log('[boot]', ...args);

function serveApp() {
  const child = spawn('npm', ['start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT), HOST: HOST },
  });
  child.on('exit', (code, signal) => {
    log(`next start exited (code=${code} signal=${signal}); exiting so BotKeep restarts us`);
    process.exit(code ?? 1);
  });
  /* Keep the wrapper alive while next start runs; die with it. */
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
}

function buildThenRestart() {
  const placeholder = createServer((_req, res) => {
    /* Must answer 2xx: BotKeep's startup probe treats error responses as a
       failed start and kills the container even though the port is bound. */
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vazionix is building — the real server starts in a moment.');
  });
  placeholder.listen(PORT, HOST, () => log(`placeholder listening on ${HOST}:${PORT}; starting build`));

  const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
  build.on('exit', (code) => {
    if (code !== 0) {
      log(`build failed with code=${code}; exiting nonzero`);
      process.exit(code ?? 1);
    }
    log('build finished; handing the port over to next start in this same process');
    /* A clean exit reads as "stopped" to BotKeep — it does not restart us.
       So the wrapper never exits: it closes the placeholder and serves. */
    placeholder.close(() => serveApp());
  });
}

if (existsSync('.next/BUILD_ID')) {
  log('build detected; serving');
  serveApp();
} else {
  log('no build found; building first');
  buildThenRestart();
}
