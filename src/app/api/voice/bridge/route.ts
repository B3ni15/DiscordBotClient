import { experimental_upgradeWebSocket } from "@vercel/functions";
import type { WebSocket } from "ws";
import { Session } from "@bridge/session.mjs";
import { loadOpus } from "@bridge/opus.mjs";

/**
 * The voice worker, hosted by the app itself.
 *
 * This is the same worker as `bridge/`, reached at `/api/voice/bridge` instead
 * of on localhost, so nobody has to run anything to give the bot a voice. It
 * needs a runtime that can hold a socket and open a UDP one, which rules out
 * the edge: Node, with Fluid compute, which is where Vercel's WebSocket
 * support lives.
 *
 * What it cannot get around is the function duration limit. A connection is
 * pinned to one instance and dies when that instance reaches its maximum, so
 * the page is warned shortly beforehand and reconnects — a call is a series of
 * these, stitched together, rather than one long one. Self-hosting `bridge/`
 * has no such limit.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Every plan allows 300s; Pro and Enterprise allow more. Raise it here if your
 * plan permits — longer means fewer reconnects mid-call.
 */
export const maxDuration = 300;

/** How long before the cutoff the page is told to reconnect. */
const EXPIRY_WARNING_MS = 20_000;
/** 20 ms of 48 kHz stereo is 3840 bytes; the cap leaves room to spare. */
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Time given for every socket to see the warning and start reconnecting. */
const CRASH_RECONNECT_GRACE_MS = 2_000;

const opus = loadOpus();
let nextSessionId = 1;
/** Every socket this instance currently holds open, so a crash can warn all of them at once. */
const openSockets = new Set<WebSocket>();

opus.then((resolved) => {
  resolved.onFatalCrash(() => {
    // opusscript's codec is process-wide and, once it dies, dead for good: no
    // call into it will ever work again. The only real fix is a fresh process,
    // so every call this instance is holding is sent home the same way an
    // expiring instance already sends them — a graceful heads-up, not a cut
    // wire — and then the process exits so Vercel starts a clean one.
    console.error("voice bridge: the Opus codec crashed; recycling this instance");
    for (const socket of openSockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ t: "expiring", inMs: 0 }));
      }
    }
    setTimeout(() => process.exit(1), CRASH_RECONNECT_GRACE_MS);
  });
});

export async function GET(request: Request) {
  const denied = originProblem(request);
  if (denied) return new Response(denied, { status: 403 });

  const id = `web-${nextSessionId++}`;
  const resolvedOpus = await opus;

  try {
    return await upgrade(id, resolvedOpus);
  } catch (cause) {
    // `next dev` and self-hosted Node servers have no WebSocket upgrade to
    // hand out, so say what to do rather than throwing a stack at the browser.
    console.error("voice bridge upgrade failed", cause);
    return new Response(
      "This deployment cannot upgrade WebSocket connections. Vercel serves them on the Node runtime with Fluid compute; elsewhere (including `next dev`), run the worker in bridge/ and point Settings at it.",
      { status: 501 },
    );
  }
}

function upgrade(id: string, resolvedOpus: Awaited<ReturnType<typeof loadOpus>>) {
  return experimental_upgradeWebSocket(
    (socket: WebSocket) => {
      const log = (message: string) => console.log(`[${id}] ${message}`);
      const session = new Session(socket, { log, opus: resolvedOpus, id });

      socket.send(JSON.stringify({ t: "hello", v: 1, opus: resolvedOpus.name, hosted: true }));
      openSockets.add(socket);

      // The page cannot see the deadline, so it is told about it: a graceful
      // reconnect a few seconds early beats being cut off mid-sentence.
      const warning = setTimeout(
        () => {
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ t: "expiring", inMs: EXPIRY_WARNING_MS }));
          }
        },
        Math.max(1_000, maxDuration * 1_000 - EXPIRY_WARNING_MS),
      );

      socket.on("message", (data: Buffer, isBinary: boolean) =>
        session.handleMessage(data, isBinary),
      );
      socket.on("close", () => {
        clearTimeout(warning);
        openSockets.delete(socket);
        session.dispose();
      });
      socket.on("error", (cause: Error) => log(`socket error: ${cause.message}`));
    },
    { maxPayload: MAX_PAYLOAD_BYTES },
  );
}

/**
 * Only pages served from this deployment may drive the hosted worker. A
 * non-browser client can claim any origin it likes, so this is a courtesy
 * rather than a lock — but it does keep another site from quietly spending
 * this deployment's compute.
 */
function originProblem(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = (process.env.VOICE_BRIDGE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.includes("*") || allowed.includes(origin)) return null;

  try {
    if (new URL(origin).host === new URL(request.url).host) return null;
  } catch {
    return "Bad origin.";
  }
  return "This voice bridge only serves its own site. Set VOICE_BRIDGE_ALLOWED_ORIGINS to allow others.";
}
