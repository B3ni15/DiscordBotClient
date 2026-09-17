/**
 * Exercises the bridge's protocol without Discord: the handshake, the gateway
 * payload it asks the browser to send, and an audio frame.
 *
 *   node test/smoke.mjs
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import {
  AUDIO_OUT,
  AUDIO_OUT_OPUS,
  FRAME_BYTES,
  decodeOutgoingAudio,
  encodeIncomingAudio,
} from "../src/protocol.mjs";

const PORT = 8799;
const SECRET = "smoke-test-secret";
const entry = fileURLToPath(new URL("../src/index.mjs", import.meta.url));

const bridge = spawn(process.execPath, [entry, "--port", String(PORT), "--secret", SECRET], {
  stdio: ["ignore", "pipe", "inherit"],
});

const failures = [];
function check(name, condition) {
  console.log(`${condition ? "ok  " : "FAIL"} ${name}`);
  if (!condition) failures.push(name);
}

try {
  await waitForListening(bridge);

  const socket = new WebSocket(`ws://127.0.0.1:${PORT}?secret=${SECRET}`);
  const messages = [];
  socket.on("message", (data, isBinary) => {
    if (!isBinary) messages.push(JSON.parse(data.toString()));
  });
  await once(socket, "open");

  const hello = await nextMessage(messages, (message) => message.t === "hello");
  check("greets with a hello carrying the protocol version", hello.v === 1);
  check("reports which Opus library it found", typeof hello.opus === "string");

  socket.send(JSON.stringify({ t: "ping" }));
  check("answers a ping", Boolean(await nextMessage(messages, (m) => m.t === "pong")));

  socket.send(
    JSON.stringify({ t: "join", guildId: "1", channelId: "2", selfMute: false, selfDeaf: false }),
  );

  const connecting = await nextMessage(messages, (m) => m.t === "status");
  check("reports that it is connecting", connecting.state === "connecting");

  // The browser owns the gateway, so a join must come back as a payload for it
  // to send: op 4, with the channel that was asked for.
  const gateway = await nextMessage(messages, (m) => m.t === "gateway");
  check("asks the browser to send a voice state update", gateway.payload?.op === 4);
  check("targets the requested channel", gateway.payload?.d?.channel_id === "2");
  check("targets the requested guild", gateway.payload?.d?.guild_id === "1");

  // Audio before the voice connection is ready must be dropped, not thrown on.
  const frame = Buffer.alloc(1 + FRAME_BYTES);
  frame[0] = AUDIO_OUT;
  socket.send(frame, { binary: true });
  socket.send(JSON.stringify({ t: "ping" }));
  check("survives audio sent before it is ready", Boolean(await nextMessage(messages, (m) => m.t === "pong")));

  socket.send(JSON.stringify({ t: "nonsense" }));
  const error = await nextMessage(messages, (m) => m.t === "error");
  check("rejects an unknown message", error.message.includes("nonsense"));

  socket.close();

  // The wire format itself, in both directions: the page builds the frame the
  // bridge decodes, and reads back the one the bridge builds.
  const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
  const outgoing = Buffer.alloc(1 + pcm.byteLength);
  outgoing[0] = AUDIO_OUT;
  Buffer.from(pcm.buffer).copy(outgoing, 1);
  const decoded = decodeOutgoingAudio(outgoing);
  check(
    "decodes a PCM frame the page built",
    decoded?.kind === "pcm" && decoded.payload.equals(Buffer.from(pcm.buffer)),
  );
  check(
    "rejects a frame with a half sample in it",
    decodeOutgoingAudio(outgoing.subarray(0, 4)) === null,
  );

  // A browser that encodes Opus itself sends packets of any length.
  const packet = Buffer.from([0x78, 0x01, 0x02, 0x03, 0x04]);
  const opusFrame = Buffer.concat([Buffer.of(AUDIO_OUT_OPUS), packet]);
  const decodedOpus = decodeOutgoingAudio(opusFrame);
  check(
    "passes a browser-encoded Opus packet through",
    decodedOpus?.kind === "opus" && decodedOpus.payload.equals(packet),
  );

  const userId = "123456789012345678";
  const incoming = encodeIncomingAudio(userId, Buffer.from(pcm.buffer));
  const view = new DataView(incoming.buffer, incoming.byteOffset, incoming.byteLength);
  check("tags incoming audio with the speaker", view.getBigUint64(1).toString() === userId);
  check(
    "keeps the samples intact for the page",
    Buffer.from(incoming.subarray(9)).equals(Buffer.from(pcm.buffer)),
  );
} finally {
  bridge.kill("SIGTERM");
}

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);

function waitForListening(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the bridge did not start")), 10_000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function nextMessage(messages, matches, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const index = messages.findIndex(matches);
    if (index !== -1) return messages.splice(index, 1)[0];
    if (Date.now() > deadline) throw new Error("timed out waiting for a message");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
