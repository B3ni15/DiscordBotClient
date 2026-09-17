/**
 * The outgoing side, without Discord: an Opus packet the page sent must reach
 * the voice connection byte for byte, and PCM from a browser that cannot encode
 * must come back out as 20 ms packets.
 *
 *   node test/send-path.mjs
 */
import { Readable } from "node:stream";
import { StreamType, createAudioResource } from "@discordjs/voice";
import { loadOpus } from "../src/opus.mjs";
import { AUDIO_OUT, AUDIO_OUT_OPUS, FRAME_BYTES, decodeOutgoingAudio } from "../src/protocol.mjs";

const failures = [];
function check(name, condition) {
  console.log(`${condition ? "ok  " : "FAIL"} ${name}`);
  if (!condition) failures.push(name);
}

const opus = await loadOpus();
const encoder = opus.createEncoder();
const decoder = opus.createDecoder();

// A second of a 440 Hz tone, in the 20 ms blocks the page sends.
const frames = Array.from({ length: 50 }, (_, block) => {
  const pcm = Buffer.alloc(FRAME_BYTES);
  for (let sample = 0; sample < 960; sample++) {
    const t = (block * 960 + sample) / 48_000;
    const value = Math.round(16_000 * Math.sin(2 * Math.PI * 440 * t));
    pcm.writeInt16LE(value, sample * 4);
    pcm.writeInt16LE(value, sample * 4 + 2);
  }
  return pcm;
});

// --- the resource the session builds ---------------------------------------
const outgoing = new Readable({ objectMode: true, read() {} });
const resource = createAudioResource(outgoing, { inputType: StreamType.Opus });

check("an Opus stream needs no transcoding pipeline", resource.edges.length === 0);

const packets = frames.slice(0, 5).map((frame) => encoder.encode(frame));
for (const packet of packets) outgoing.push(packet);
// A Readable hands nothing over until the event loop has turned once.
await new Promise((resolve) => setImmediate(resolve));

check("the resource is readable once packets are pushed", resource.readable);

const readBack = packets.map(() => resource.read());
check(
  "every packet arrives whole and in order",
  readBack.every((packet, index) => Buffer.isBuffer(packet) && packet.equals(packets[index])),
);
check(
  "each packet is one 20 ms block of audio",
  readBack.every((packet) => decoder.decode(packet).length === FRAME_BYTES),
);

// --- the wire format both browsers use --------------------------------------
const opusFrame = Buffer.concat([Buffer.of(AUDIO_OUT_OPUS), packets[0]]);
const decodedOpus = decodeOutgoingAudio(opusFrame);
check("a browser-encoded packet is passed through untouched", decodedOpus?.kind === "opus" && decodedOpus.payload.equals(packets[0]));

const pcmFrame = Buffer.concat([Buffer.of(AUDIO_OUT), frames[0]]);
const decodedPcm = decodeOutgoingAudio(pcmFrame);
check("PCM from a browser without an encoder is recognised", decodedPcm?.kind === "pcm" && decodedPcm.payload.equals(frames[0]));

// --- encoding the fallback keeps the sound ----------------------------------
const roundTrip = decoder.decode(encoder.encode(frames[10]));
let peak = 0;
for (let offset = 0; offset < roundTrip.length; offset += 2) {
  peak = Math.max(peak, Math.abs(roundTrip.readInt16LE(offset)));
}
check(`PCM survives the encoder (peak ${peak} of 16000)`, peak > 12_000);

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
