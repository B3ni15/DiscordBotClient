# DisbotClient

<p align="center">
  <img src="https://raw.githubusercontent.com/B3ni15/DiscordBotClient/master/public/brag.gif" alt="DisbotClient preview" width="900">
</p>

<p align="center">
  <strong>A modern Discord client built specifically for bots.</strong><br>
  Use your bot like a real Discord client — directly from your browser.
</p>

<p align="center">
  <a href="https://disbotclient.xyz"><img src="https://img.shields.io/badge/Live%20Demo-disbotclient.xyz-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Live Demo"></a>
  <a href="https://github.com/B3ni15/DiscordBotClient/blob/master/LICENSE"><img src="https://img.shields.io/github/license/B3ni15/DiscordBotClient?style=for-the-badge" alt="License"></a>
  <a href="https://github.com/B3ni15/DiscordBotClient"><img src="https://img.shields.io/github/stars/B3ni15/DiscordBotClient?style=for-the-badge&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/B3ni15/DiscordBotClient/issues"><img src="https://img.shields.io/github/issues/B3ni15/DiscordBotClient?style=for-the-badge" alt="Issues"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Discord%20API-Bot%20Compatible-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord API">
</p>

---

## ✨ What is DisbotClient?

DisbotClient is an open-source web client built around one simple idea:

> **Bot accounts should have a proper client too.**

Instead of building a separate dashboard for every Discord bot, DisbotClient provides a Discord-like interface for interacting with the servers, channels, members, messages and bot tooling available to a bot account.

It runs entirely from the browser, connects directly to the Discord Gateway, and uses a small same-origin proxy for Discord REST requests.

**No account. No sign-up. No database. No server-side message store.**

🌐 **Live:** https://disbotclient.xyz

---

## 🏅 Features

| | Feature | Description |
|---|---|---|
| 💬 | **Messaging** | Read, send, reply to, edit, delete, pin and react to messages |
| ⚡ | **Live Gateway** | Real-time messages, edits, deletes, reactions and typing events |
| 🧵 | **Threads** | Browse active threads and create new threads |
| 🔎 | **Search** | Discord search when available, with a loaded-history fallback |
| 👥 | **Members** | Online/offline members, roles, statuses and activities |
| 🏷️ | **Badges** | Public Discord badges and server-booster status where exposed |
| 🎨 | **Profiles** | Avatars, decorations, banners, roles, permissions and activities |
| 😀 | **Emoji** | Server custom emoji, animated emoji and emoji picker |
| 📎 | **Attachments** | Images, video, audio, uploads, embeds and image lightbox |
| 📌 | **Pins** | Browse and manage pinned messages |
| 💌 | **DMs** | Open direct conversations by user ID and remember them locally |
| 🔔 | **Notifications** | Desktop notifications, unread badges and local mutes |
| 🛠️ | **Bot tooling** | Manage slash commands and handle incoming interactions |
| 🎙️ | **Voice awareness** | See voice/stage channels and their current participants |
| 🔐 | **Privacy-first** | Tokens and local preferences remain in the browser |

---

## 🎯 Made for bot accounts

The normal Discord client is primarily designed around user accounts. DisbotClient takes the opposite approach and builds its interface around what a **bot token** can actually access.

That includes:

- Servers the bot has joined
- Categories and channels
- Channel permissions relevant to the bot
- Member lists and roles
- Message history
- Live Gateway events
- Custom server emoji
- Threads and pins
- Voice/stage channel occupancy
- Bot-accessible profile information
- Slash commands
- Incoming interactions

The client also intentionally respects Discord's bot-account API boundaries instead of trying to imitate a user account.

---

## 💬 Messaging

DisbotClient provides a full Discord-style messaging experience with:

- Infinite message history scroll-back
- Live Gateway events
- New messages, edits and deletes
- Reactions and typing indicators
- Replies
- Message editing and deletion
- Pinning
- File uploads
- Embeds and attachments
- Images, video and audio playback
- Image lightbox
- Custom and animated emoji
- Role-coloured mentions
- Discord timestamps such as `<t:...>`
- Spoilers
- Inline and fenced code
- Blockquotes
- Lists
- Headers and subtext
- Bold, italic, underline and strikethrough

The Markdown renderer is implemented specifically for the project without relying on a third-party Markdown parser.

---

## 👤 Profiles, members & badges

Profiles are rendered using information that is available to the bot through Discord's APIs.

Depending on the available data, a profile can show:

- Avatar
- Avatar decoration
- Banner
- Username and display name
- Account creation date
- Server join date
- Roles and role colours
- Relevant permissions
- Online/offline presence
- Custom status
- Rich activities
- Activity artwork
- Activity elapsed time
- Public account flags / badges
- Server booster status

Badges use Discord's public flag information where available and are displayed using Discord-style icons, with the badge name available on hover.

> Some profile information is only available to user accounts. DisbotClient does not attempt to bypass Discord's API restrictions.

---

## 🧵 Threads, pins & search

### Threads

Browse active threads directly from the channel interface and create new threads when the bot has the required permissions.

### Pinned messages

Open pinned messages without leaving the normal channel experience.

### Search

The client first attempts to use Discord's search endpoint. If server-side search is unavailable to the bot, DisbotClient can fall back to searching message history that has already been loaded in the browser.

Fallback search is therefore intentionally limited to data already available to the client.

---

## 💌 Direct messages

Bot accounts do not receive the same DM-list functionality as normal Discord user accounts.

DisbotClient handles this limitation transparently: DMs can be opened using a **user ID** or from a member card.

Recently opened conversations can be remembered locally together with:

- Display name
- Username / handle
- The server where you met the user
- Their roles there
- A local note you can add

This information is stored in browser `localStorage` and is not uploaded to the application server.

---

## 🎙️ Voice & stage channels

The client can display voice and stage channels together with their current state:

- Current participants
- Microphone state
- Headphone/deafened state
- Camera state
- Go Live state
- Channel user limit
- Voice-channel text chat

### Why can't DisbotClient join voice?

The actual voice stream is not currently implemented.

Discord's browser client uses a WebRTC-based voice flow that is not exposed as a documented public browser API for this use case. DisbotClient therefore keeps voice streaming separate rather than relying on an unsupported workaround.

---

## 🛠️ Bot tooling

DisbotClient is more than a message viewer.

### Slash commands

Manage application commands directly from the client:

- List global commands
- List server commands
- Create commands
- Edit commands
- Delete commands

### Interaction inbox

Incoming slash-command invocations can be viewed and handled from the interaction inbox.

You can respond inside Discord's interaction response window, or defer an interaction and complete it using a follow-up.

This makes DisbotClient useful as a lightweight operational interface for bot developers and administrators.

---

## 🔔 Notifications

Desktop notifications are available for incoming activity, with local controls for:

- Per-channel mute
- Per-server mute
- Unread badges

Notification preferences remain in the browser and do not require an application account.

---

## 🔐 Privacy & security

Privacy is a core design goal of DisbotClient.

### Bot token

Your bot token is stored only in this browser's `localStorage` under:

```text
disbotclient:token
```

There is no database for tokens. Signing out removes the locally stored token.

> ⚠️ **Never enter a user account token.** DisbotClient is designed for bot tokens only.

### REST API proxy

Discord REST requests go through the same-origin proxy:

```text
/api/discord/*
```

The proxy forwards the request to Discord and streams the response back. It is designed to be stateless and forwards only the headers required by the request, including authorization, content type and audit-log reason.

The proxy does not intentionally persist:

- Bot tokens
- Messages
- User data
- Sessions
- Application state

### Messages stay in memory

Messages are fetched from Discord into the browser while the tab is open. They are not copied into a server-side message database.

### Gateway connection

The Discord Gateway connection is made directly by the browser rather than being proxied through the application server.

### Hosted analytics

The public instance at **disbotclient.xyz** uses Vercel Web Analytics for anonymous page-view analytics. This is separate from Discord data and does not provide the application with your bot token or message content.

If you want the smallest possible trust boundary, self-host the application.

---

## 🧩 Discord intents

For the fullest experience, enable these intents in the Discord Developer Portal:

- `MESSAGE CONTENT INTENT`
- `SERVER MEMBERS INTENT`
- `PRESENCE INTENT`

| Intent | Used for |
|---|---|
| **Message Content** | Reading message content |
| **Server Members** | Member lists and member information |
| **Presence** | Online/offline state, custom status and activities |

If an intent is disabled, Discord will not provide the corresponding data. DisbotClient attempts to use the intents that are actually available instead of unnecessarily failing the entire connection.

---

## 🚧 Limitations

These limitations primarily come from Discord's bot API:

- **No DM list:** direct messages must be opened using a user ID or member card.
- **No bot server-side message search:** fallback search only covers history already loaded into the browser.
- **Only invited servers are visible:** a bot cannot browse arbitrary servers.
- **Presence requires the Presence Intent.**
- **No user bios:** bot accounts cannot use the user-profile endpoint in the same way as user accounts.
- **No Nitro / Quest-style user badges:** these are not exposed through the bot-accessible profile data.
- **No voice streaming:** voice/stage channels and participants are visible, but the actual voice stream cannot currently be joined.

---

## 🗺️ Roadmap

- [ ] Browser voice connection
- [ ] Incoming interaction components
- [ ] Button interactions
- [ ] Select menu interactions
- [ ] Modal interaction responses
- [ ] Guild management
- [ ] Channel management
- [ ] Role management
- [ ] Permission management
- [ ] Invite management
- [ ] Stickers
- [ ] Polls
- [ ] More bot administration tools

The roadmap may change as Discord's APIs evolve.

---

## 🏗️ Architecture

```text
┌──────────────────────────────┐
│           Browser            │
│                              │
│  Next.js / React / Zustand   │
│          │        │          │
│          │        └─────────────────┐
│          │                          │
│          ▼                          ▼
│   Discord REST proxy        Discord Gateway
│          │                          │
└──────────┼──────────────────────────┼─────┘
           │                          │
           ▼                          ▼
      Discord REST               Discord Gateway
```

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Zustand

### Discord integration

- Custom Discord REST client
- Custom Discord Gateway client
- `discord-api-types`

### Local state

Browser-local state is used for information such as:

- Bot token
- Opened DM information
- Mutes
- Notification settings
- Client preferences

### Server-side component

The server-side component is intentionally small and primarily provides the same-origin REST proxy.

---

## 🚀 Run locally

### Requirements

- Node.js
- npm
- A Discord bot application

### Installation

```bash
git clone https://github.com/B3ni15/DiscordBotClient.git
cd DiscordBotClient
npm install
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run start
```

### Lint

```bash
npm run lint
```

---

## 🔍 Self-hosting

The hosted instance is convenient, but self-hosting gives you complete control over the deployment.

With your own instance you can:

- Control the server
- Control the deployment
- Remove hosted analytics
- Inspect the source yourself
- Run everything under your own infrastructure

This is especially useful when working with bots that have sensitive permissions.

---

## ⚠️ Token safety

Treat a Discord bot token like a password.

**Never commit it to Git. Never put it in an issue. Never send it to another person.**

If a token is exposed, rotate it immediately in the Discord Developer Portal.

DisbotClient supports **bot tokens only**. User-account tokens / selfbots are not supported.

---

## 📦 Tech stack

The project is intentionally lightweight and currently uses:

- **Next.js 16** — application framework
- **React 19** — UI
- **TypeScript 5** — type-safe development
- **Tailwind CSS 4** — styling
- **Zustand 5** — client state
- **discord-api-types** — Discord API types
- **Vercel Web Analytics** — anonymous analytics on the hosted instance

The project also contains its own Discord REST and Gateway clients, Markdown renderer and emoji picker.

---

## 📜 License

DisbotClient is released under the **MIT License**.

See [`LICENSE`](./LICENSE) for the complete license text.

---

## ⭐ Support the project

If DisbotClient is useful to you, consider giving the repository a star. It helps the project get discovered and makes continued development easier to justify.

<p align="center">
  <a href="https://github.com/B3ni15/DiscordBotClient">⭐ Star on GitHub</a>
  ·
  <a href="https://github.com/B3ni15/DiscordBotClient/issues">🐛 Report an issue</a>
  ·
  <a href="https://disbotclient.xyz">🌐 Open DisbotClient</a>
</p>

<p align="center">
  Made with TypeScript, React, Next.js and a lot of Discord API experimentation.
</p>
