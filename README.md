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

## Your token

Find it on the Bot tab of the
[Developer Portal](https://discord.com/developers/applications). Turn on the
`MESSAGE CONTENT` and `SERVER MEMBERS` intents there as well, or message text
arrives empty and the member list stays empty. If neither is enabled, the
client connects without privileged intents instead of failing.

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
- Direct messages opened by user ID, remembered locally
- Member list grouped by hoisted role, with role colours and a user card

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
- No voice

## Not built yet

- **Voice channels.** Possible in a browser — Discord's own web client uses the
  voice gateway's WebRTC mode rather than raw UDP — but that mode is
  undocumented, so it is deliberately a separate step.
- Message components (buttons, select menus) on incoming interactions
- Modal interaction responses
- Guild and channel management (roles, permissions, invites)
- Stickers and polls

## Stack

Next.js (App Router, static export), TypeScript, Tailwind, Zustand. The REST
and gateway clients are written for this project; the markdown parser and the
emoji picker have no third-party dependencies.

## License

MIT
