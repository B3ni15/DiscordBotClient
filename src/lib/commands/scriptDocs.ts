/**
 * The command script reference: one source for the /docs/commands page and its
 * plain Markdown twin at /docs/commands.md, which is what AI assistants and
 * other scrapers are pointed at. Describes the sandbox in ./sandbox.ts.
 */

export interface DocEntry {
  /** How it is called, e.g. "channels.create(data, opts?)". */
  signature: string;
  description: string;
  example?: string;
}

export interface DocSection {
  id: string;
  title: string;
  /** Paragraphs above the entries. Inline `code` is allowed. */
  intro: string[];
  entries?: DocEntry[];
  /** Longer, complete scripts. */
  examples?: Array<{ title: string; code: string }>;
}

export const DOCS_UPDATED = "October 14, 2026";

export const DOCS_SUMMARY =
  "Every slash command can run a piece of JavaScript in your browser whenever someone uses it. " +
  "This page lists everything a script can use — replying, options, and helpers for channels, " +
  "roles, messages, members, webhooks, threads, emojis, events and the server itself — with examples.";

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "basics",
    title: "How scripts work",
    intro: [
      "Open Slash Commands, pick a command and write its handler in the editor. The handler is the body of an `async` function: use `await` anywhere and `return` to stop.",
      "A script runs in the open client tab, inside a sandboxed Web Worker. It never sees the bot token; every Discord call it makes is passed to the page, checked, and sent from there. The script only runs while the client is open and logged in as the bot.",
      "Discord gives a command three seconds to answer. A script that has not answered after about 1.5 s is deferred automatically (the user sees “thinking…”), and its later `reply()` fills that in. A script that finishes without answering gets a short private “✅ Done.” so nobody sees “The application did not respond”.",
      "The helpers take ids as strings (`\"123…\"`), or any object with an `id` — so `channels.delete(options.getChannel(\"channel\"))` works. Wherever a server is needed and none is given, the server the command was used in is used. Data objects accept camelCase keys (`rateLimitPerUser`) as well as Discord's own snake_case (`rate_limit_per_user`).",
      "Most helpers that change something take a last `opts` argument: a reason string, or `{ reason }`, which shows up in the server's audit log. Server-wide helpers also accept `{ guildId }` to work in another server.",
    ],
    examples: [
      {
        title: "Hello world",
        code: `const name = user.global_name ?? user.username;
await reply(\`Hello, \${name}! 👋\`);`,
      },
      {
        title: "Shorthand: return a reply",
        code: `return "Pong! 🏓";`,
      },
    ],
  },
  {
    id: "replying",
    title: "Replying",
    intro: [
      "A message is either a string, or an object with `content`, `embeds`, `components`, `allowedMentions`, `poll`, `flags`… Pass `ephemeral: true` to show a reply only to the person who used the command.",
    ],
    entries: [
      { signature: "reply(message)", description: "Answers the command. After defer() it fills in the “thinking…” message; after a reply it becomes a follow-up.", example: `await reply({ content: "Only you can see this.", ephemeral: true });` },
      { signature: "defer({ ephemeral }?)", description: "Shows “thinking…” and gives the script up to 15 minutes (the script itself is stopped after 60 s).", example: `await defer();\nconst data = await guild.get();\nawait reply(\`\${data.name} has \${data.approximate_member_count} members.\`);` },
      { signature: "followUp(message)", description: "Another message after the first reply." },
      { signature: "editReply(message)", description: "Changes the first reply." },
      { signature: "deleteReply()", description: "Removes the first reply." },
      { signature: "send(channelId, message)", description: "Posts a regular message into a channel (same as messages.send)." },
      { signature: "return value", description: "Returning a string or a message object replies with it when nothing was sent yet." },
    ],
  },
  {
    id: "context",
    title: "Options and context",
    intro: ["What the command was used with, by whom and where."],
    entries: [
      { signature: "options.getString(name)", description: "An option's value, or null. Also getInteger, getNumber, getBoolean and get." },
      { signature: "options.getUser(name) / getMember(name)", description: "The chosen user, or their member object in this server (with .user)." },
      { signature: "options.getChannel(name) / getRole(name) / getMentionable(name)", description: "The resolved channel, role, or user/role." },
      { signature: "options.getAttachment(name)", description: "An uploaded file: { url, filename, size, content_type }." },
      { signature: "options.getSubcommand() / getSubcommandGroup()", description: "Which sub-command was used, if the command has them." },
      { signature: "options.data", description: "Every option value by name." },
      { signature: "user", description: "Who used the command: { id, username, global_name, avatar, … }." },
      { signature: "member", description: "Their member object (roles, nick, permissions); null in DMs." },
      { signature: "guildId / channelId", description: "Where it was used; guildId is null in DMs." },
      { signature: "interaction", description: "The raw interaction Discord sent." },
    ],
    examples: [
      {
        title: "Only for people who can manage the server",
        code: `if (!member || !Permissions.has(member.permissions, "ManageGuild")) {
  return { content: "You need Manage Server for this.", ephemeral: true };
}
await reply("Okay, boss.");`,
      },
    ],
  },
  {
    id: "channels",
    title: "Channels",
    intro: [
      "Create, edit and delete channels and categories, and set who may do what in them. `type` is one of `\"text\"`, `\"voice\"`, `\"category\"`, `\"announcement\"`, `\"stage\"`, `\"forum\"`, `\"media\"`, or a number (see `ChannelType`). Needs the Manage Channels permission (and Manage Roles for permissions).",
    ],
    entries: [
      { signature: "channels.get(channelId)", description: "One channel." },
      { signature: "channels.list(guildId?)", description: "Every channel in the server." },
      {
        signature: "channels.create(data, opts?)",
        description: "Creates a channel: { name, type, topic, parent, position, nsfw, rateLimitPerUser, bitrate, userLimit, permissionOverwrites }.",
        example: `const category = await channels.create({ name: "Support", type: "category" });
const ticket = await channels.create({
  name: \`ticket-\${user.username}\`,
  type: "text",
  parent: category.id,
  permissionOverwrites: [
    { id: guildId, type: "role", deny: ["ViewChannel"] },          // @everyone
    { id: user.id, type: "member", allow: ["ViewChannel", "SendMessages"] },
  ],
}, "Ticket opened");`,
      },
      { signature: "channels.edit(channelId, data, opts?)", description: "Renames, moves, changes the topic, slowmode, overwrites…", example: `await channels.edit(channelId, { name: "closed", topic: "Archived", rateLimitPerUser: 30 });` },
      { signature: "channels.delete(channelId, opts?)", description: "Deletes a channel, category or thread.", example: `await channels.delete(options.getChannel("channel"), "Cleanup");` },
      { signature: "channels.setPositions([{ id, position, parentId?, lockPermissions? }], opts?)", description: "Reorders channels." },
      {
        signature: "channels.setPermission(channelId, roleOrUserId, { type, allow, deny }, opts?)",
        description: "Adds or replaces one permission overwrite. type is \"role\" (default) or \"member\".",
        example: `// Lock the channel for @everyone
await channels.setPermission(channelId, guildId, { deny: ["SendMessages"] }, "Lockdown");`,
      },
      { signature: "channels.deletePermission(channelId, roleOrUserId, opts?)", description: "Removes an overwrite." },
      { signature: "channels.createInvite(channelId, { maxAge, maxUses, temporary, unique }?, opts?)", description: "Makes an invite; maxAge in seconds (0 = never expires).", example: `const invite = await channels.createInvite(channelId, { maxAge: 3600, maxUses: 1 });\nawait reply(\`https://discord.gg/\${invite.code}\`);` },
      { signature: "channels.invites(channelId)", description: "The channel's invites." },
      { signature: "channels.typing(channelId)", description: "Shows “Bot is typing…” for a few seconds." },
      { signature: "channels.follow(announcementChannelId, targetChannelId)", description: "Follows an announcement channel into another channel." },
    ],
  },
  {
    id: "messages",
    title: "Messages and reactions",
    intro: ["Read, send, edit and delete messages in any channel the bot can see. Emojis are written as `\"👍\"`, `\"name:id\"` or `\"<:name:id>\"`."],
    entries: [
      { signature: "messages.send(channelId, message)", description: "Sends a message. replyTo: messageId makes it a reply.", example: `const [last] = await messages.list(channelId, { limit: 1 });\nawait messages.send(channelId, { content: "Hi!", replyTo: last.id });` },
      { signature: "messages.get(channelId, messageId)", description: "One message." },
      { signature: "messages.list(channelId, { limit, before, after, around }?)", description: "Up to 100 messages, newest first." },
      { signature: "messages.edit(channelId, messageId, message)", description: "Edits one of the bot's messages (or only flags/embeds on others)." },
      { signature: "messages.delete(channelId, messageId, opts?)", description: "Deletes a message." },
      {
        signature: "messages.bulkDelete(channelId, countOrIds, opts?)",
        description: "Deletes the newest N messages (up to 100), or the ids given. Discord only bulk-deletes messages younger than 14 days. Resolves to how many were deleted.",
        example: `const amount = options.getInteger("amount") ?? 10;
const deleted = await messages.bulkDelete(channelId, amount, \`Purge by \${user.username}\`);
await reply({ content: \`🧹 Deleted \${deleted} messages.\`, ephemeral: true });`,
      },
      { signature: "messages.pin / unpin(channelId, messageId, opts?)", description: "Pins or unpins." },
      { signature: "messages.pins(channelId)", description: "The pinned messages." },
      { signature: "messages.react(channelId, messageId, emoji)", description: "Adds the bot's reaction." },
      { signature: "messages.unreact(channelId, messageId, emoji, userId?)", description: "Removes the bot's reaction, or someone else's." },
      { signature: "messages.reactions(channelId, messageId, emoji, { limit, after }?)", description: "Who reacted with an emoji." },
      { signature: "messages.clearReactions(channelId, messageId, emoji?)", description: "Removes all reactions, or only one emoji's." },
      { signature: "messages.crosspost(channelId, messageId)", description: "Publishes a message in an announcement channel." },
      { signature: "messages.endPoll(channelId, messageId)", description: "Ends a poll early." },
    ],
  },
  {
    id: "roles",
    title: "Roles",
    intro: ["Roles need Manage Roles, and the bot can only manage roles below its own highest role. `permissions` takes names (`[\"KickMembers\", \"BanMembers\"]`), a number or a bit string; `color` takes `\"#5865f2\"`, a number or `[r, g, b]`."],
    entries: [
      { signature: "roles.list(guildId?)", description: "Every role in the server." },
      { signature: "roles.get(roleId, opts?)", description: "One role." },
      {
        signature: "roles.create({ name, color, permissions, hoist, mentionable, icon, unicodeEmoji }, opts?)",
        description: "Creates a role.",
        example: `const role = await roles.create({
  name: "Moderator",
  color: "#f0b232",
  hoist: true,
  permissions: ["KickMembers", "ModerateMembers", "ManageMessages"],
}, "Set up by /setup");`,
      },
      { signature: "roles.edit(roleId, data, opts?)", description: "Changes a role." },
      { signature: "roles.delete(roleId, opts?)", description: "Deletes a role." },
      { signature: "roles.setPositions([{ id, position }], opts?)", description: "Reorders roles." },
      {
        signature: "roles.add(userId, roleId, opts?) / roles.remove(userId, roleId, opts?)",
        description: "Gives a member a role, or takes it away.",
        example: `const role = options.getRole("role");
const has = member.roles.includes(role.id);
if (has) await roles.remove(user, role, "Self-role");
else await roles.add(user, role, "Self-role");
return { content: \`\${has ? "Removed" : "Added"} <@&\${role.id}>\`, ephemeral: true };`,
      },
    ],
  },
  {
    id: "members",
    title: "Members and moderation",
    intro: ["Kick, ban, time out, rename and move members. Listing and searching members needs the Server Members intent enabled for the bot in the Developer Portal."],
    entries: [
      { signature: "members.get(userId, opts?)", description: "One member." },
      { signature: "members.list({ limit, after }?)", description: "Up to 1000 members per call." },
      { signature: "members.search(query, { limit }?)", description: "Members whose name starts with the query." },
      { signature: "members.edit(userId, data, opts?)", description: "nick, roles, mute, deaf, channelId, communicationDisabledUntil, flags…" },
      { signature: "members.setNickname(userId, nick, opts?)", description: "Changes a nickname; null resets it." },
      {
        signature: "members.timeout(userId, ms, opts?)",
        description: "Times someone out for ms milliseconds (up to 28 days); null or 0 lifts it.",
        example: `const target = options.getUser("user");
await members.timeout(target, 10 * 60 * 1000, options.getString("reason") ?? "No reason");
await reply(\`🔇 <@\${target.id}> is timed out for 10 minutes.\`);`,
      },
      { signature: "members.kick(userId, opts?)", description: "Kicks someone." },
      { signature: "members.ban(userId, { deleteMessageSeconds, reason }?)", description: "Bans someone, optionally deleting up to 7 days of their messages.", example: `await members.ban(options.getUser("user"), { deleteMessageSeconds: 86400, reason: "Spam" });` },
      { signature: "members.unban(userId, opts?)", description: "Lifts a ban." },
      { signature: "guild.bans() / guild.bulkBan(userIds, opts?)", description: "Lists bans; bans up to 200 users at once." },
      { signature: "members.move(userId, channelId | null, opts?)", description: "Moves someone to another voice channel; null disconnects them." },
      { signature: "members.mute(userId, muted?, opts?) / members.deafen(userId, deafened?, opts?)", description: "Server mute or deafen in voice." },
      { signature: "members.me() / members.setMyNickname(nick)", description: "The bot's own member, and its nickname." },
    ],
  },
  {
    id: "webhooks",
    title: "Webhooks",
    intro: ["Create webhooks and post through them under any name and avatar. A webhook can be given as its URL, as `{ id, token }`, or as an id with `{ token }` in the options. Needs Manage Webhooks."],
    entries: [
      {
        signature: "webhooks.create(channelId, { name, avatar }, opts?)",
        description: "Creates a webhook; the result has .url and .token. avatar is a data URI (see imageData).",
        example: `const hook = await webhooks.create(channelId, { name: "Announcer" });
await webhooks.send(hook, "Hello from a webhook!", { username: "Captain Hook" });`,
      },
      { signature: "webhooks.list(channelId) / webhooks.listGuild(guildId?)", description: "A channel's, or the whole server's, webhooks." },
      { signature: "webhooks.get(webhookId)", description: "One webhook." },
      { signature: "webhooks.edit(webhookId, { name, avatar, channel }, opts?)", description: "Renames it, changes its avatar, or moves it to another channel." },
      { signature: "webhooks.delete(webhookId, opts?)", description: "Deletes it." },
      {
        signature: "webhooks.send(webhook, message, { username, avatarURL, threadId, threadName, wait }?)",
        description: "Posts through the webhook. Resolves to the message unless wait is false.",
        example: `// Say something "as" the user, through a webhook of this channel
const hook = (await webhooks.list(channelId)).find((entry) => entry.token)
  ?? (await webhooks.create(channelId, { name: "Echo" }));
await webhooks.send(hook, options.getString("text"), {
  username: user.global_name ?? user.username,
  avatarURL: user.avatar ? \`https://cdn.discordapp.com/avatars/\${user.id}/\${user.avatar}.png\` : undefined,
});`,
      },
      { signature: "webhooks.editMessage(webhook, messageId, message) / deleteMessage(webhook, messageId)", description: "Edits or deletes a message the webhook sent." },
    ],
  },
  {
    id: "threads",
    title: "Threads and forum posts",
    intro: ["Threads live in text and announcement channels; a forum post is a thread created with a first `message`."],
    entries: [
      { signature: "threads.create(channelId, { name, type, autoArchiveDuration, invitable, message, appliedTags }, opts?)", description: "Creates a public (default) or \"private\" thread; with message, a forum post.", example: `await threads.create(forumId, { name: "Bug report", message: { content: "What happened?" } });` },
      { signature: "threads.fromMessage(channelId, messageId, name | data, opts?)", description: "Starts a thread from a message." },
      { signature: "threads.edit(threadId, data, opts?)", description: "Renames, changes slowmode, tags…" },
      { signature: "threads.archive(threadId, archived?) / threads.lock(threadId, locked?)", description: "Archives or locks a thread (pass false to undo)." },
      { signature: "threads.delete(threadId, opts?)", description: "Deletes a thread." },
      { signature: "threads.join / leave(threadId)", description: "The bot joins or leaves." },
      { signature: "threads.addMember / removeMember(threadId, userId)", description: "Adds someone to, or removes them from, a thread." },
      { signature: "threads.members(threadId)", description: "Who is in it." },
      { signature: "threads.active(guildId?) / threads.archived(channelId, { private, limit }?)", description: "Active threads in the server; archived ones in a channel." },
    ],
  },
  {
    id: "guild",
    title: "The server",
    intro: ["The server the command was used in, unless `{ guildId }` names another. Editing it needs Manage Server."],
    entries: [
      { signature: "guild.get()", description: "The server, with approximate member and online counts." },
      { signature: "guild.edit(data, opts?)", description: "name, icon, banner, description, verificationLevel, systemChannelId, afkChannelId, afkTimeout…", example: `await guild.edit({ name: "My cool server", icon: await imageData("https://example.com/icon.png") });` },
      { signature: "guild.channels() / guild.roles()", description: "Every channel or role." },
      { signature: "guild.invites() / guild.webhooks()", description: "Every invite or webhook." },
      { signature: "guild.auditLog({ userId, actionType, before, limit }?)", description: "Recent audit log entries. Needs View Audit Log." },
      { signature: "guild.pruneCount({ days }) / guild.prune({ days }, opts?)", description: "How many inactive members a prune would kick, and doing it." },
      { signature: "guild.voiceRegions()", description: "Voice regions available to the server." },
      { signature: "guild.leave()", description: "The bot leaves the server." },
    ],
  },
  {
    id: "emojis-events",
    title: "Emojis, stickers, events and invites",
    intro: ["Emoji images are data URIs; `imageData(url)` downloads one. Scheduled events take `entityType` `\"voice\"`, `\"stage\"` (with `channel`) or `\"external\"` (with `location` and `scheduledEndTime`)."],
    entries: [
      { signature: "emojis.list() / emojis.get(id)", description: "The server's emojis." },
      { signature: "emojis.create({ name, image, roles }, opts?)", description: "Uploads an emoji.", example: `const url = options.getAttachment("image").url;\nconst emoji = await emojis.create({ name: options.getString("name"), image: await imageData(url) });\nreturn \`Added <:\${emoji.name}:\${emoji.id}>\`;` },
      { signature: "emojis.edit(id, { name, roles }, opts?) / emojis.delete(id, opts?)", description: "Renames or deletes an emoji." },
      { signature: "emojis.stickers() / emojis.deleteSticker(id)", description: "The server's stickers." },
      {
        signature: "events.create(data, opts?)",
        description: "Schedules an event: { name, description, entityType, channel, location, scheduledStartTime, scheduledEndTime, image }.",
        example: `await events.create({
  name: "Movie night",
  entityType: "external",
  location: "Our living room",
  scheduledStartTime: Date.now() + 24 * 3600e3,
  scheduledEndTime: Date.now() + 27 * 3600e3,
});`,
      },
      { signature: "events.list() / get(id) / edit(id, data) / delete(id) / users(id)", description: "The rest of scheduled events." },
      { signature: "invites.get(code) / invites.delete(code, opts?) / invites.create(channelId, data?)", description: "Looks up, revokes or makes an invite. code may be a discord.gg link." },
    ],
  },
  {
    id: "users",
    title: "Users and DMs",
    intro: [],
    entries: [
      { signature: "users.get(userId)", description: "Any user's public profile." },
      { signature: "users.me()", description: "The bot itself." },
      { signature: "users.dm(userId, message)", description: "Sends someone a direct message. Fails when they do not accept DMs from the bot.", example: `await users.dm(user, "Thanks for using the bot! 💌");` },
      { signature: "users.guilds()", description: "The servers the bot is in." },
    ],
  },
  {
    id: "utilities",
    title: "Utilities",
    intro: [],
    entries: [
      {
        signature: "new EmbedBuilder()",
        description: "setTitle, setDescription, setURL, setColor, setAuthor, setFooter, setImage, setThumbnail, setTimestamp, addFields, setFields.",
        example: `const embed = new EmbedBuilder()
  .setTitle("Server info")
  .setColor("#5865f2")
  .addFields({ name: "Members", value: "42", inline: true })
  .setTimestamp();
await reply({ embeds: [embed] });`,
      },
      { signature: "Permissions", description: "Permission bits by name (Permissions.BanMembers), plus Permissions.has(bits, names) and Permissions.resolve(names)." },
      { signature: "ChannelType", description: "Channel type numbers by name (ChannelType.GuildVoice)." },
      { signature: "imageData(url)", description: "Downloads an image (up to 8 MB) as a data: URI, for emojis, icons and avatars. The host must allow cross-origin requests; Discord's CDN does." },
      { signature: "sleep(ms)", description: "Waits." },
      { signature: "console.log / info / warn / error", description: "Writes to the console under the editor." },
      { signature: "fetch(url)", description: "Calls other web APIs, as long as they allow cross-origin requests. Runs from the worker's opaque origin, without cookies." },
    ],
  },
  {
    id: "raw-api",
    title: "Any other Discord route",
    intro: [
      "Everything above is built on `discord.*`, which reaches any route of the Discord REST API (https://discord.com/developers/docs) as the bot. Paths start with `/`; ids and bodies are exactly as Discord documents them (snake_case).",
    ],
    entries: [
      { signature: "discord.get(path, query?, opts?)", description: "GET, with query parameters as an object.", example: `const automod = await discord.get(\`/guilds/\${guildId}/auto-moderation/rules\`);` },
      { signature: "discord.post / patch / put(path, body?, opts?)", description: "Requests with a JSON body; opts may carry the audit log reason.", example: `await discord.post(\`/guilds/\${guildId}/auto-moderation/rules\`, {\n  name: "No invites",\n  event_type: 1,\n  trigger_type: 1,\n  trigger_metadata: { keyword_filter: ["discord.gg/*"] },\n  actions: [{ type: 1 }],\n  enabled: true,\n}, "Set up by /automod");` },
      { signature: "discord.delete(path, opts?)", description: "DELETE." },
      { signature: "discord.request(method, path, { query, body, reason })", description: "The same, with the method as a string." },
    ],
  },
  {
    id: "limits",
    title: "Limits",
    intro: [
      "What a script does on Discord is between the bot and Discord: Discord's rate limits, permissions and Terms apply, and the bot can only do what its roles allow. The limits below only protect this client and its API proxy from runaway scripts.",
    ],
    entries: [
      { signature: "60 seconds", description: "A run is stopped after a minute." },
      { signature: "150 calls per run", description: "Discord calls one run may make, replies included." },
      { signature: "300 calls per minute", description: "Shared by every script running in the tab; answering the command itself does not count." },
      { signature: "5 runs at once", description: "More are answered with a private “busy, try again”." },
      { signature: "4 MB per request", description: "Largest body a script may send." },
      { signature: "40 kB per script", description: "The size of the handler itself." },
      { signature: "500 console lines", description: "Per run; long lines are cut at 4,000 characters." },
    ],
  },
  {
    id: "examples",
    title: "Complete examples",
    intro: ["Each is a whole handler; add the options it reads to the command."],
    examples: [
      {
        title: "/lock — lock or unlock the current channel",
        code: `const locked = options.getBoolean("locked") ?? true;
await channels.setPermission(channelId, guildId, {
  deny: locked ? ["SendMessages"] : [],
}, \`\${locked ? "Locked" : "Unlocked"} by \${user.username}\`);
return locked ? "🔒 Channel locked." : "🔓 Channel unlocked.";`,
      },
      {
        title: "/ticket — a private channel for the user",
        code: `await defer({ ephemeral: true });
const channel = await channels.create({
  name: \`ticket-\${user.username}\`.toLowerCase(),
  type: "text",
  topic: \`Ticket for <@\${user.id}>\`,
  permissionOverwrites: [
    { id: guildId, type: "role", deny: ["ViewChannel"] },
    { id: user.id, type: "member", allow: ["ViewChannel", "SendMessages", "AttachFiles"] },
  ],
});
await messages.send(channel.id, \`Hi <@\${user.id}>, describe your problem and staff will be with you.\`);
await reply(\`Your ticket: <#\${channel.id}>\`);`,
      },
      {
        title: "/color — a personal color role",
        code: `const hex = options.getString("hex");
if (!/^#?[0-9a-f]{6}$/i.test(hex)) return { content: "Use a hex color like #ff8800.", ephemeral: true };
const name = \`color-\${user.id}\`;
const existing = (await roles.list()).find((role) => role.name === name);
const role = existing
  ? await roles.edit(existing.id, { color: hex })
  : await roles.create({ name, color: hex, permissions: [] });
if (!member.roles.includes(role.id)) await roles.add(user, role);
return { content: \`Your color is now \${hex}.\`, ephemeral: true };`,
      },
      {
        title: "/announce — post through a webhook with an embed",
        code: `const target = options.getChannel("channel");
const hooks = await webhooks.list(target);
const hook = hooks.find((entry) => entry.token) ?? (await webhooks.create(target, { name: "Announcements" }));
await webhooks.send(hook, {
  embeds: [new EmbedBuilder().setTitle("📣 Announcement").setDescription(options.getString("text")).setColor("#eb459e")],
}, { username: "Staff" });
return { content: "Posted.", ephemeral: true };`,
      },
      {
        title: "/setup — categories, channels and a role in one go",
        code: `await defer();
const staff = await roles.create({ name: "Staff", color: "#23a55a", hoist: true, permissions: ["ManageMessages", "KickMembers", "ModerateMembers"] });
const info = await channels.create({ name: "Information", type: "category" });
for (const name of ["rules", "announcements"]) {
  await channels.create({
    name, type: "text", parent: info.id,
    permissionOverwrites: [{ id: guildId, deny: ["SendMessages"] }, { id: staff.id, allow: ["SendMessages"] }],
  });
}
const talk = await channels.create({ name: "Community", type: "category" });
await channels.create({ name: "general", type: "text", parent: talk.id });
await channels.create({ name: "Lounge", type: "voice", parent: talk.id, userLimit: 10 });
await reply("✅ Server set up.");`,
      },
    ],
  },
];

/** The whole reference as Markdown, for /docs/commands.md and AI assistants. */
export function docsMarkdown(siteUrl: string): string {
  const lines: string[] = [
    "# disbotclient — command script reference",
    "",
    `> ${DOCS_SUMMARY}`,
    "",
    `Last updated ${DOCS_UPDATED}. Web version: ${siteUrl}/docs/commands`,
    "",
  ];
  for (const section of DOC_SECTIONS) {
    lines.push(`## ${section.title}`, "");
    for (const paragraph of section.intro) lines.push(paragraph, "");
    for (const entry of section.entries ?? []) {
      lines.push(`### \`${entry.signature}\``, "", entry.description, "");
      if (entry.example) lines.push("```js", entry.example, "```", "");
    }
    for (const example of section.examples ?? []) {
      lines.push(`### ${example.title}`, "", "```js", example.code, "```", "");
    }
  }
  return lines.join("\n");
}
