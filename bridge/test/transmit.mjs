/**
 * The part that decides whether anyone hears the bot: packets have to leave at
 * a steady 20 ms, in order, and the stream has to be closed off with silence.
 *
 *   node test/transmit.mjs
 */
import {
  JITTER_PACKETS,
  MAX_QUEUED_PACKETS,
  SILENCE_FRAME,
  SILENCE_FRAMES,
  Transmitter,
} from "../src/transmitter.mjs";

const failures = [];
function check(name, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures.push(name);
}

/** Stands in for a voice connection, recording what it is asked to send. */
function fakeConnection({ ready = true } = {}) {
  return {
    sent: [],
    speaking: [],
    playOpusPacket(packet) {
      if (!ready) return false;
      this.sent.push({ packet, at: Date.now() });
      return true;
    },
    setSpeaking(value) {
      this.speaking.push(value);
    },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const packetsOf = (count, from = 0) =>
  Array.from({ length: count }, (_, index) => Buffer.of(from + index));

// --- a steady stream --------------------------------------------------------
{
  const connection = fakeConnection();
  const transmitter = new Transmitter(connection);
  transmitter.start();

  // A second of audio, arriving as it would from a browser: every 20 ms.
  const packets = packetsOf(50);
  for (const packet of packets) {
    transmitter.push(packet);
    await wait(20);
  }
  await wait(200);
  transmitter.stop();

  const audio = connection.sent.filter((entry) => !entry.packet.equals(SILENCE_FRAME));
  check("everything pushed is sent", audio.length === packets.length, `${audio.length} of ${packets.length}`);
  check(
    "in the order it was pushed",
    audio.every((entry, index) => entry.packet.equals(packets[index])),
  );

  const gaps = audio.slice(1).map((entry, index) => entry.at - audio[index].at);
  const worst = Math.max(...gaps);
  check(`packets leave about 20 ms apart (worst ${worst} ms)`, worst <= 45);

  const counts = transmitter.takeCounts();
  check("the counters report what was sent", counts.sent === packets.length, `sent ${counts.sent}`);
}

// --- the tail ---------------------------------------------------------------
{
  const connection = fakeConnection();
  const transmitter = new Transmitter(connection);
  transmitter.start();
  for (const packet of packetsOf(6, 100)) transmitter.push(packet);
  await wait(400);
  transmitter.stop();

  const silence = connection.sent.filter((entry) => entry.packet.equals(SILENCE_FRAME));
  check(`silence closes the stream off (${silence.length} frames)`, silence.length === SILENCE_FRAMES);
  check("and the bot stops being shown as speaking", connection.speaking.at(-1) === false);
}

// --- a connection that cannot carry it --------------------------------------
{
  const connection = fakeConnection({ ready: false });
  const transmitter = new Transmitter(connection);
  transmitter.start();
  for (const packet of packetsOf(5, 200)) transmitter.push(packet);
  await wait(200);
  transmitter.stop();

  const counts = transmitter.takeCounts();
  check("packets a dead connection refuses are counted, not lost silently", counts.refused === 5);
  check("and none are counted as sent", counts.sent === 0);
}

// --- backlog ----------------------------------------------------------------
{
  const connection = fakeConnection();
  const transmitter = new Transmitter(connection);
  // Not started: nothing drains, so the queue must bound itself.
  for (const packet of packetsOf(MAX_QUEUED_PACKETS + 10)) transmitter.push(packet);
  check("the queue never grows past its bound", transmitter.queued === MAX_QUEUED_PACKETS);
  check("and the drops are counted", transmitter.takeCounts().dropped === 10);
}

// --- borrowed memory --------------------------------------------------------
{
  const connection = fakeConnection();
  const transmitter = new Transmitter(connection);
  transmitter.start();

  // A socket buffer that gets reused under us, which is what Node's pooling
  // does in practice: the queued packet must not change with it.
  const borrowed = Buffer.from([1, 2, 3, 4]);
  for (let index = 0; index < JITTER_PACKETS; index++) transmitter.push(borrowed);
  borrowed.fill(0xff);
  await wait(120);
  transmitter.stop();

  const first = connection.sent[0]?.packet;
  check(
    "a queued packet keeps its bytes when the buffer behind it is reused",
    Boolean(first) && first.equals(Buffer.from([1, 2, 3, 4])),
    first ? `got ${[...first].join(",")}` : "nothing sent",
  );
}

// --- jitter buffer ----------------------------------------------------------
{
  const connection = fakeConnection();
  const transmitter = new Transmitter(connection);
  transmitter.start();
  transmitter.push(Buffer.of(1));
  await wait(60);
  check(
    `nothing is sent before ${JITTER_PACKETS} packets have gathered`,
    connection.sent.length === 0,
  );
  transmitter.push(Buffer.of(2));
  transmitter.push(Buffer.of(3));
  await wait(120);
  transmitter.stop();
  check("and then it flows", connection.sent.length >= 3);
}

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
