#!/usr/bin/env node
/**
 * DisbotClient voice bridge.
 *
 * A page cannot open the UDP socket Discord's voice servers exchange Opus over,
 * so this small worker holds that socket instead. It is deliberately ignorant:
 * the browser keeps the bot token and the gateway connection, and this process
 * only ever sees the voice handshake payloads relayed through it, plus the
 * audio itself.
 *
 *   node src/index.mjs [--port 8787] [--host 127.0.0.1] [--secret <secret>] [--no-secret]
 */
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { loadOpus } from "./opus.mjs";
import { Session } from "./session.mjs";

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";

const options = parseArguments(process.argv.slice(2));
const opus = await loadOpus();

const server = new WebSocketServer({ host: options.host, port: options.port });
let nextSessionId = 1;

server.on("connection", (socket, request) => {
  const id = `session-${nextSessionId++}`;
  const log = (message) => console.log(`[${id}] ${message}`);

  if (options.secret && !isAuthorised(request, options.secret)) {
    log(`rejected a connection from ${request.socket.remoteAddress}: wrong secret`);
    socket.close(4001, "Wrong or missing secret.");
    return;
  }

  log(`connected from ${request.socket.remoteAddress}`);
  const session = new Session(socket, { log, opus, id });

  socket.on("message", (data, isBinary) => session.handleMessage(data, isBinary));
  socket.on("close", () => {
    session.close("browser disconnected");
    log("disconnected");
  });
  socket.on("error", (cause) => log(`socket error: ${cause.message}`));

  socket.send(JSON.stringify({ t: "hello", v: 1, opus: opus.name }));
});

server.on("listening", () => {
  const origin = `ws://${options.host}:${options.port}`;
  const url = options.secret ? `${origin}?secret=${options.secret}` : origin;
  console.log(`DisbotClient voice bridge listening on ${origin}`);
  console.log(`Opus: ${opus.name}`);
  console.log("");
  console.log("Paste this into DisbotClient → Settings → Voice bridge:");
  console.log(`  ${url}`);
  console.log("");
  if (!options.secret) {
    console.log("Running without a secret: anything that can reach this port may use it.");
  }
});

server.on("error", (cause) => {
  console.error(`Could not start the bridge: ${cause.message}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("\nShutting down.");
    server.close(() => process.exit(0));
    // Sockets mid-call would otherwise hold the process open.
    for (const client of server.clients) client.terminate();
  });
}

/**
 * The secret may travel in the query string (which is what the printed URL
 * carries, so configuring the app is one paste) or in an Authorization header
 * for callers that would rather not put it in a URL.
 */
function isAuthorised(request, secret) {
  const url = new URL(request.url ?? "/", "ws://bridge");
  if (url.searchParams.get("secret") === secret) return true;
  const header = request.headers.authorization;
  return typeof header === "string" && header.replace(/^Bearer /i, "") === secret;
}

function parseArguments(argv) {
  const options = {
    host: process.env.BRIDGE_HOST ?? DEFAULT_HOST,
    port: Number(process.env.BRIDGE_PORT ?? DEFAULT_PORT),
    // Without a secret any page the browser opens could drive this worker, so
    // one is generated when none is given rather than left off.
    secret: process.env.BRIDGE_SECRET ?? randomBytes(9).toString("base64url"),
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--host") options.host = argv[++index];
    else if (argument === "--secret") options.secret = argv[++index];
    else if (argument === "--no-secret") options.secret = null;
    else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: node src/index.mjs [--port 8787] [--host 127.0.0.1] [--secret <secret>] [--no-secret]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${argument}`);
      process.exit(1);
    }
  }

  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65_535) {
    console.error("--port must be a port number.");
    process.exit(1);
  }
  return options;
}
