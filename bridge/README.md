# DisbotClient voice bridge

A small worker that gives the bot a microphone and ears.

DisbotClient runs entirely in the browser, and a browser cannot open the UDP
socket Discord's voice servers exchange Opus frames over. This process opens it
instead. Everything else stays in the browser.

**You do not have to run this.** The app hosts the same worker at
`/api/voice/bridge`, and the client uses it by default. Run this one when you
want a call that is never interrupted — a serverless function drops its
WebSocket when it reaches its maximum duration, so a hosted call is resumed
every few minutes — or when you are developing locally, where `next dev` cannot
upgrade WebSocket connections at all.

## What it does and does not see

- **It never sees the bot token.** Discord's voice protocol authenticates with
  the voice token from `VOICE_SERVER_UPDATE`, not with the bot token, so the
  bridge never needs it and never receives it.
- **It has no gateway connection.** When it needs a voice state update (`op 4`)
  sent, it hands the payload to the browser, which sends it over the gateway it
  already has. That also means the bot keeps a single gateway session.
- **It handles audio, and nothing else.** Microphone capture, file decoding and
  mixing all happen in the browser; the bridge receives finished PCM, and sends
  back the PCM it decodes from the channel.

## Running it

```bash
cd bridge
npm install
npm start
```

It prints the address to paste into DisbotClient → Settings → Voice bridge:

```
ws://127.0.0.1:8787?secret=Xu1pK8ta2Nc9
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--port` | `8787` | Port to listen on (`BRIDGE_PORT`). |
| `--host` | `127.0.0.1` | Interface to bind (`BRIDGE_HOST`). |
| `--secret` | random | Secret callers must present (`BRIDGE_SECRET`). |
| `--no-secret` | — | Accept anyone who can reach the port. |

A secret is generated on every start unless you set one, because anything
running in the browser can reach a port on `localhost`: the secret is what stops
another page from driving your bot. Keep the default bind address unless you
know you want the bridge reachable from elsewhere on your network.

Serving the app over HTTPS and the bridge over plain `ws://` works as long as
the bridge address is `localhost` or `127.0.0.1`, which browsers treat as
trustworthy. For a bridge on another machine, put it behind TLS and use `wss://`.

## Dependencies

- `@discordjs/voice` speaks the voice protocol, and `@snazzah/davey` is its
  end-to-end encryption support — required, not optional, because the library
  imports it on load.
- `@discordjs/opus` is a native Opus build and is optional: when it is missing
  or has no prebuilt binary for your platform, the pure WebAssembly `opusscript`
  is used instead. It is slower but needs no compiler. Installing with
  `npm install --omit=optional` skips the native build entirely.

## Checking it works

```bash
npm test
```

Walks the whole protocol against a running bridge — handshake, the gateway
payload it asks the browser to send, an audio frame, the wire format in both
directions — and then the outgoing path against the real `@discordjs/voice`:
packets pushed in must come out of the audio resource whole, in order, and one
20 ms block each. No Discord account involved.

```bash
npm run test:browser
```

The same path from the other end, in a real browser: the capture worklet cuts
audio into 20 ms blocks, WebCodecs encodes them, the page sends them over the
socket, and the bridge reports how many it received. Needs the app running
(`npm run dev` in the repository root) and Playwright installed.

## Protocol

JSON text frames for control, binary frames for audio, each with one leading
tag byte.

| Tag | Direction | Payload |
| --- | --- | --- |
| `0x03` | browser → Discord | A finished Opus packet. Browsers encode their own through WebCodecs, so this is the normal case: about 180 bytes per 20 ms, handed to Discord untouched. |
| `0x01` | browser → Discord | 20 ms of 48 kHz stereo signed 16-bit PCM (3840 bytes), for a browser with no encoder. The bridge encodes it. |
| `0x02` | Discord → browser | The speaker's id as a big-endian 64-bit number, then their audio as PCM. |

| Browser → bridge | Meaning |
| --- | --- |
| `join` | Join `guildId` / `channelId`. |
| `update` | Move, mute or deafen without rebuilding the connection. |
| `leave` | Leave the channel. |
| `voice-state`, `voice-server` | The gateway events the handshake needs. |
| `ping` | Answered with `pong`. |

| Bridge → browser | Meaning |
| --- | --- |
| `hello` | Protocol version and the Opus library in use. |
| `gateway` | A payload the browser must send on its gateway. |
| `status` | `idle`, `connecting`, `ready` or `reconnecting`. |
| `speaking` | Someone started or stopped talking. |
| `stats` | Every two seconds: frames received, packets handed to Discord, packets arriving from the channel, drops, and what the audio player is doing. The client shows these next to its own counts, which is what makes "nobody can hear me" diagnosable rather than a guess. |
| `expiring` | Only from the hosted worker: this instance is about to reach its time limit, so reconnect now. |
| `error` | Something went wrong, in words. |
