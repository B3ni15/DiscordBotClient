# disbotclient

A Discord client for your bot that runs in the browser.
[disbotclient.xyz](https://disbotclient.xyz)

The app has a small same-origin API proxy for Discord REST requests. Your bot
token stays in the browser's `localStorage`; the proxy only forwards requests to
Discord and does not store or log the token.

## Run it

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Privacy — no data is stored

There is no account, no sign-up and no database. Nothing you do here is stored
on a server.

- **Your token** lives in this browser's `localStorage` under
  `disbotclient:token` and nowhere else. Signing out deletes it.
- **Your DM list, mutes and notification settings** are `localStorage` as well.
  They never leave the browser, which is also why they do not follow you to
  another device.
- **The API proxy** (`/api/discord/*`) forwards a request to Discord and streams
  the answer back. It copies only the `authorization`, `content-type` and
  `x-audit-log-reason` headers, writes nothing to disk and logs neither the
  token nor the messages. It is stateless: restart it and it knows nothing.
- **Messages are never copied anywhere.** They are read from Discord into memory
  for as long as the tab is open and are gone when you close it.
- **The gateway connection** is made by your browser straight to Discord.
- **The hosted site** at [disbotclient.xyz](https://disbotclient.xyz) counts
  anonymous page views with Vercel Web Analytics. It sees no Discord data, no
  token and no message content. Self-host and it is not there at all.

If you would rather trust nothing, run it yourself — see *Run it* above.

## Your token

Find it on the Bot tab of the
[Developer Portal](https://discord.com/developers/applications). Turn on the
`MESSAGE CONTENT`, `SERVER MEMBERS` and `PRESENCE` intents there as well, or
message text arrives empty, the member list stays empty and nobody shows up as
online. Whichever of them are off, the client steps down one intent at a time
and connects with the rest instead of failing.

Use a **bot** token only. A user account token ("selfbot") violates Discord's
terms of service, and this client does not support it.

## What works

**Messages**
- Servers, channels grouped by category, message history with infinite
  scroll-back
- Live gateway events: new messages, edits, deletes, reactions, typing
- Full Discord markdown — bold, italic, underline, strikethrough, inline and
  fenced code, blockquotes, lists, headers, subtext, spoilers
- Mentions with role colours, `<t:…>` timestamps, custom and animated emoji
- Embeds, attachments, image lightbox, video and audio playback
- Send, reply, edit, delete, pin; file uploads
- Reactions with an emoji picker that includes the server's own emoji

**Navigation**
- Threads: browse the active ones, create new threads
- Pinned messages
- Search — tries Discord's search endpoint, falls back to searching the
  history already loaded when the bot token is rejected (see limits below)
- Direct messages opened by user ID or from any member card, remembered
  locally together with who the person is (name, handle, the server you met
  them in, their roles there, and a note you can add)
- Voice and stage channels listed with everyone currently sitting in them,
  their mic, headphone, camera and Go Live state, and the channel's user
  limit. Clicking one opens its built-in voice text chat — the voice stream
  itself cannot be joined (see limits)
- Member list grouped by hoisted role, split into online and offline, with
  status dots, custom statuses and what everyone is playing
- User card with badges, banner, presence, join and account dates, roles and
  the permissions that matter

**Bot tooling**
- Slash command management: list, create, edit and delete global and
  server-scoped commands
- Interaction inbox: see incoming slash command invocations, reply within the
  three-second window or defer and send a follow-up
- Desktop notifications with per-channel and per-server mute, unread badges

## Limits

These come from the bot token, not from this client:

- No DM list; direct messages can only be opened with a user ID
- No server-side message search, so search falls back to loaded history
- The bot only sees servers it has been invited to
- No presence (online/offline) unless the `PRESENCE INTENT` is enabled
- Voice channels are shown, and so is who is in them, but the client cannot
  join a voice stream — see below

## Not built yet

- **Joining voice.** Voice channels, their occupants and their text chat are
  all there; connecting to the audio is not. It is possible in a browser —
  Discord's own web client uses the voice gateway's WebRTC mode rather than raw
  UDP — but that mode is undocumented, so it is deliberately a separate step.
- Message components (buttons, select menus) on incoming interactions
- Modal interaction responses
- Guild and channel management (roles, permissions, invites)
- Stickers and polls

## Stack

Next.js (App Router, static export), TypeScript, Tailwind, Zustand. The REST
and gateway clients are written for this project; the markdown parser and the
emoji picker have no third-party dependencies. The interface follows Discord's
own dark theme — surfaces, spacing, status shapes and motion.

## License

MIT
