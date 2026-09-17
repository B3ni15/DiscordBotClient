/**
 * The whole outgoing path in a real browser, minus Discord: the capture worklet
 * cuts audio into 20 ms blocks, WebCodecs encodes them as Opus, the page sends
 * them over the socket, and the bridge reports how many it received.
 *
 * Needs the app running (`npm run dev` in the repository root) and Playwright.
 *
 *   node bridge/test/browser-to-bridge.mjs [http://localhost:3000]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP = process.argv[2] ?? "http://localhost:3000";
const PORT = 8797;
const SECRET = "browser-to-bridge";
const entry = fileURLToPath(new URL("../src/index.mjs", import.meta.url));

const bridge = spawn(process.execPath, [entry, "--port", String(PORT), "--secret", SECRET], {
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("the bridge did not start")), 10_000);
  bridge.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("listening")) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
page.on("console", (message) => console.log("  page:", message.text()));
await page.goto(APP, { waitUntil: "domcontentloaded" });

const report = await page.evaluate(async ({ port, secret }) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?secret=${secret}`);
  socket.binaryType = "arraybuffer";
  const stats = [];
  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data);
      if (message.t === "stats") stats.push(message);
    }
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("could not reach the bridge"));
  });

  // The page's own audio graph: a tone where the microphone would be.
  const context = new AudioContext({ sampleRate: 48000 });
  await context.audioWorklet.addModule("/voice/capture-worklet.js");
  await context.resume();

  const tone = context.createOscillator();
  tone.frequency.value = 440;
  const capture = new AudioWorkletNode(context, "pcm-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
  });
  tone.connect(capture);
  tone.start();
  const silent = context.createGain();
  silent.gain.value = 0;
  capture.connect(silent).connect(context.destination);

  const config = {
    codec: "opus",
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 64000,
    opus: { frameDuration: 20000 },
  };
  const supported =
    typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported(config)).supported;

  let sent = 0;
  let packetBytes = 0;
  let timestamp = 0;

  const send = (tag, body) => {
    const frame = new Uint8Array(1 + body.byteLength);
    frame[0] = tag;
    frame.set(body, 1);
    socket.send(frame);
    sent += 1;
    packetBytes += body.byteLength;
  };

  const encoder = supported
    ? new AudioEncoder({
        output: (chunk) => {
          const packet = new Uint8Array(chunk.byteLength);
          chunk.copyTo(packet);
          send(0x03, packet);
        },
        error: () => {},
      })
    : null;
  encoder?.configure(config);

  capture.port.onmessage = (event) => {
    const pcm = new Int16Array(event.data);
    if (encoder && encoder.state === "configured") {
      const data = new AudioData({
        format: "s16",
        sampleRate: 48000,
        numberOfFrames: pcm.length / 2,
        numberOfChannels: 2,
        timestamp,
        data: pcm,
      });
      timestamp += 20000;
      encoder.encode(data);
      data.close();
      return;
    }
    send(0x01, new Uint8Array(pcm.buffer));
  };

  await new Promise((resolve) => setTimeout(resolve, 5_000));
  socket.close();
  await context.close();
  return { supported, sent, averageBytes: sent ? Math.round(packetBytes / sent) : 0, stats };
}, { port: PORT, secret: SECRET });

await browser.close();
bridge.kill("SIGTERM");

const received = report.stats.reduce((total, entry) => total + entry.framesIn, 0);
// The bridge reports on its own clock, so only the seconds it has reported on
// can be compared — the tail of the run has not been counted yet.
const reportedSeconds = report.stats.reduce((total, entry) => total + entry.overMs / 1_000, 0);
const receivedPerSecond = reportedSeconds ? Math.round(received / reportedSeconds) : 0;
const failures = [];
function check(name, condition) {
  console.log(`${condition ? "ok  " : "FAIL"} ${name}`);
  if (!condition) failures.push(name);
}

console.log(report);
check("this browser encodes Opus itself", report.supported);
check("the page sends about 50 packets a second", report.sent >= 200 && report.sent <= 300);
check("an Opus packet is a fraction of the PCM it came from", report.averageBytes < 400);
check("the bridge reports what it is receiving", report.stats.length > 0);
check(
  `the bridge receives the full stream (${receivedPerSecond} packets a second)`,
  receivedPerSecond >= 45,
);

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
