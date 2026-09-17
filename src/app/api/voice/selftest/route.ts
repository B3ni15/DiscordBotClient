import { createSocket } from "node:dgram";
import { loadOpus } from "@bridge/opus.mjs";

/**
 * Whether this deployment can actually carry voice.
 *
 * Discord's voice servers speak Opus over UDP, and not every host lets a
 * function open a UDP socket. Rather than have that fail as a call that never
 * connects, this route answers the question directly: it sends a real DNS
 * query over UDP and waits for the reply, which is the same thing the voice
 * connection needs — an outbound datagram and an answer back through the same
 * mapping.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Cloudflare's resolver: answers UDP from anywhere, and is not Discord's. */
const PROBE_HOST = "1.1.1.1";
const PROBE_PORT = 53;
const PROBE_TIMEOUT_MS = 4_000;

export async function GET() {
  const [udp, opus, voice, dave] = await Promise.all([
    probeUdp(),
    check(async () => (await loadOpus()).name),
    check(async () => {
      await import("@discordjs/voice");
      return "loaded";
    }),
    check(async () => {
      await import("@snazzah/davey");
      return "loaded";
    }),
  ]);

  const ready = udp.ok && opus.ok && voice.ok && dave.ok;
  return Response.json(
    {
      ready,
      summary: ready
        ? "This deployment can host voice calls."
        : "This deployment cannot host voice calls; see the failures below.",
      checks: { udp, opus, voice, dave },
      runtime: { node: process.version, region: process.env.VERCEL_REGION ?? null },
    },
    // A failing self-test is a working route, so the status stays 200 and the
    // body carries the verdict.
    { status: 200 },
  );
}

/** Sends one DNS query for example.com and waits for any answer. */
function probeUdp(): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const started = Date.now();
    let settled = false;

    const finish = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      resolve({ ok, detail });
    };

    const timer = setTimeout(
      () => finish(false, `No UDP answer within ${PROBE_TIMEOUT_MS} ms — outbound UDP looks blocked.`),
      PROBE_TIMEOUT_MS,
    );

    socket.on("message", () => finish(true, `UDP answer in ${Date.now() - started} ms.`));
    socket.on("error", (cause) => finish(false, `UDP socket error: ${cause.message}`));
    socket.send(dnsQuery(), PROBE_PORT, PROBE_HOST, (cause) => {
      if (cause) finish(false, `Could not send a datagram: ${cause.message}`);
    });
  });
}

async function check(run: () => Promise<string>): Promise<{ ok: boolean; detail: string }> {
  try {
    return { ok: true, detail: await run() };
  } catch (cause) {
    return { ok: false, detail: cause instanceof Error ? cause.message : "Failed." };
  }
}

/** A minimal DNS question for `example.com`, which any resolver will answer. */
function dnsQuery(): Buffer {
  const header = Buffer.from([0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
  const name = Buffer.concat([
    ...["example", "com"].map((label) =>
      Buffer.concat([Buffer.of(label.length), Buffer.from(label, "ascii")]),
    ),
    Buffer.of(0),
  ]);
  // QTYPE A, QCLASS IN.
  return Buffer.concat([header, name, Buffer.from([0, 1, 0, 1])]);
}
