/**
 * Self-hosted entry point: the Next.js app and the voice worker on one port.
 *
 * `next start` cannot upgrade WebSocket connections, which is why the hosted
 * worker at `/api/voice/bridge` only works on Vercel. This server wraps Next
 * and answers that one path itself with the same worker `bridge/` runs, so the
 * page can keep connecting to `wss://<your host>/api/voice/bridge` — one
 * hostname, nothing extra to route in a reverse proxy or a Cloudflare tunnel.
 *
 * Everything else, including other upgrade requests (Next's dev HMR socket),
 * is handed to Next untouched.
 *
 *   node server.mjs              production (after `next build`)
 *   node server.mjs --dev        development
 *
 * Environment: PORT (3000), HOSTNAME (0.0.0.0), VOICE_BRIDGE_ALLOWED_ORIGINS
 * (same meaning as on Vercel).
 */
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { Session } from "./bridge/src/session.mjs";
import { loadOpus } from "./bridge/src/opus.mjs";

const BRIDGE_PATH = "/api/voice/bridge";
/** 20 ms of 48 kHz stereo is 3840 bytes; the cap leaves room to spare. */
const MAX_PAYLOAD_BYTES = 64 * 1024;
const CRASH_RECONNECT_GRACE_MS = 2_000;

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const opus = await loadOpus();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
const openSockets = new Set();
let nextSessionId = 1;

opus.onFatalCrash(() => {
  // opusscript's codec is process-wide and dead for good once it crashes; send
  // every call home gracefully, then exit so the container restarts cleanly.
  console.error("voice bridge: the Opus codec crashed; recycling this process");
  for (const socket of openSockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ t: "expiring", inMs: 0 }));
    }
  }
  setTimeout(() => process.exit(1), CRASH_RECONNECT_GRACE_MS);
});

const server = createServer((request, response) => {
  handle(request, response).catch((cause) => {
    console.error("request failed", cause);
    response.statusCode = 500;
    response.end("Internal Server Error");
  });
});

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");

  if (pathname !== BRIDGE_PATH) {
    handleUpgrade(request, socket, head);
    return;
  }

  const denied = originProblem(request);
  if (denied) {
    socket.write(`HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(denied)}\r\n\r\n${denied}`);
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => attach(ws));
});

function attach(socket) {
  const id = `web-${nextSessionId++}`;
  const log = (message) => console.log(`[${id}] ${message}`);
  const session = new Session(socket, { log, opus, id });

  openSockets.add(socket);
  // No `expiring` timer here: unlike a serverless function, this process has no
  // duration limit, so a call lasts as long as the connection does.
  socket.send(JSON.stringify({ t: "hello", v: 1, opus: opus.name, hosted: true }));

  socket.on("message", (data, isBinary) => session.handleMessage(data, isBinary));
  socket.on("close", () => {
    openSockets.delete(socket);
    session.dispose();
  });
  socket.on("error", (cause) => log(`socket error: ${cause.message}`));
}

/**
 * Only pages served from this host may drive the worker, same as the Vercel
 * route. Behind a proxy the browser's origin is the public host, so the
 * forwarded host header is compared as well as `Host`.
 */
function originProblem(request) {
  const origin = request.headers.origin;
  if (!origin) return null;

  const allowed = (process.env.VOICE_BRIDGE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.includes("*") || allowed.includes(origin)) return null;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return "Bad origin.";
  }
  const hosts = [request.headers.host, request.headers["x-forwarded-host"]]
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim());
  if (hosts.includes(originHost)) return null;

  return "This voice bridge only serves its own site. Set VOICE_BRIDGE_ALLOWED_ORIGINS to allow others.";
}

server.listen(port, hostname, () => {
  console.log(`> ready on http://${hostname}:${port} (voice bridge at ${BRIDGE_PATH})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
