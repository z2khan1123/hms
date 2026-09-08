/**
 * Refuses to start the dev stack when something already holds its ports.
 *
 * Without this, a second `npm run dev` half-works in a way that looks like a
 * code fault. The web server binds fine, the API loses the race for its port
 * and dies with EADDRINUSE, and `nest start --watch` restarts it straight back
 * into the same collision. What you see is a scrolling stack trace and, in the
 * browser, "Request failed with status code 502" on sign-in — because Vite is
 * proxying /api to a port nothing is listening on. Nothing in that picture
 * points at the actual cause, which is simply that the stack was already up.
 *
 * So fail here instead, before anything starts, and say which port and what to
 * do about it.
 */
import { createConnection } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The API's port is configurable, so read it rather than assuming 3000. */
function apiPort() {
  try {
    const env = readFileSync(join(root, 'apps/api/.env'), 'utf8');
    const match = env.match(/^\s*PORT\s*=\s*"?(\d+)"?/m);
    if (match) return Number(match[1]);
  } catch {
    // No .env yet: the API will fail on its own with a clearer message than
    // anything we could invent here.
  }
  return 3000;
}

/**
 * Connect rather than bind. A bind test only proves *we* cannot take the port
 * with the address family we happened to pick — the API listens on `::` and
 * Vite on `::1`, so a bind check on 0.0.0.0 misses both. If a connection is
 * accepted, something is listening, whatever it bound to.
 */
function inUse(port, host) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function isTaken(port) {
  // Both families: a listener on one is invisible from the other.
  const [v4, v6] = await Promise.all([inUse(port, '127.0.0.1'), inUse(port, '::1')]);
  return v4 || v6;
}

const PORTS = [
  { port: apiPort(), name: 'API' },
  { port: 5173, name: 'web' },
];

const taken = [];
for (const p of PORTS) {
  if (await isTaken(p.port)) taken.push(p);
}

if (taken.length > 0) {
  const list = taken.map((t) => `${t.name} (port ${t.port})`).join(' and ');
  const ports = taken.map((t) => t.port);

  // Naming the command matters more than naming the problem: the person
  // reading this wants the stack running, not a diagnosis.
  const inspect =
    process.platform === 'win32'
      ? `Get-NetTCPConnection -State Listen -LocalPort ${ports.join(',')} | Select-Object LocalPort, OwningProcess`
      : `lsof -nP -iTCP:${ports.join(',')} -sTCP:LISTEN`;
  const clear =
    process.platform === 'win32'
      ? `Get-NetTCPConnection -State Listen -LocalPort ${ports.join(',')} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
      : `lsof -tiTCP:${ports.join(',')} -sTCP:LISTEN | xargs kill`;

  process.stderr.write(
    `\nThe dev stack is already running: ${list}.\n\n` +
      `Starting a second one does not work. The API would lose the race for its\n` +
      `port, restart, and lose it again, and sign-in would fail with a 502.\n\n` +
      `If you want the running one, just use it: http://localhost:5173\n\n` +
      `To see what is holding the port:\n  ${inspect}\n\n` +
      `To stop it and start fresh:\n  ${clear}\n  npm run dev\n\n`,
  );
  process.exit(1);
}
