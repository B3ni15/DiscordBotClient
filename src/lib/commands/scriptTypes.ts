/**
 * Type declarations for what a command script can use, handed to the code
 * editor so it can autocomplete and explain every helper the way VS Code
 * would. They describe the sandbox in ./sandbox.ts; keep the two in step.
 */
export const SCRIPT_TYPES = String.raw`
type Snowflake = string;
/** An id, or anything that carries one (a user, a channel, a role…). */
type IdLike = Snowflake | number | { id: Snowflake };
/** Audit log reason as a string, or an options object with one. */
type ReasonOpts = string | { reason?: string; guildId?: Snowflake };
type GuildOpts = { guildId?: Snowflake; reason?: string };
type PermissionName = keyof typeof Permissions;
/** A permission bit field: a name, a list of names, a number or a decimal string. */
type PermissionsLike = PermissionName | string | number | bigint | Array<PermissionName | string | number | bigint>;
type ColorLike = string | number | [number, number, number];

interface Embed {
  title?: string; description?: string; url?: string; color?: number; timestamp?: string;
  footer?: { text: string; icon_url?: string };
  image?: { url: string }; thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

/** A message: plain text, or an object. camelCase keys are accepted too. */
type MessageLike = string | number | {
  content?: string;
  embeds?: Array<Embed | EmbedBuilder>;
  components?: any[];
  /** Only for interaction replies: visible to the user of the command only. */
  ephemeral?: boolean;
  allowedMentions?: { parse?: Array<"users" | "roles" | "everyone">; users?: Snowflake[]; roles?: Snowflake[]; replied_user?: boolean };
  /** Sends the message as a reply to this message id. */
  replyTo?: Snowflake;
  tts?: boolean;
  poll?: any;
  flags?: number;
  stickerIds?: Snowflake[];
};

interface User { id: Snowflake; username: string; global_name: string | null; avatar: string | null; bot?: boolean; [key: string]: any }
interface Member { user?: User; nick?: string | null; roles: Snowflake[]; joined_at: string; permissions?: string; communication_disabled_until?: string | null; [key: string]: any }
interface Channel { id: Snowflake; type: number; name?: string; guild_id?: Snowflake; parent_id?: Snowflake | null; position?: number; topic?: string | null; [key: string]: any }
interface Role { id: Snowflake; name: string; color: number; position: number; permissions: string; hoist: boolean; mentionable: boolean; [key: string]: any }
interface Message { id: Snowflake; channel_id: Snowflake; content: string; author: User; embeds: Embed[]; [key: string]: any }
interface Webhook { id: Snowflake; token?: string; url?: string; name: string | null; channel_id: Snowflake; [key: string]: any }
interface Guild { id: Snowflake; name: string; icon: string | null; owner_id: Snowflake; approximate_member_count?: number; [key: string]: any }

/** The raw interaction Discord sent. */
declare const interaction: any;
/** Who used the command. */
declare const user: User;
/** The guild member who used the command; null in DMs. */
declare const member: Member | null;
/** Where the command was used; null in DMs. */
declare const guildId: Snowflake | null;
declare const channelId: Snowflake;

/** The command's option values. */
declare const options: {
  /** Every option value by name. */
  data: Record<string, any>;
  get(name: string): any;
  getString(name: string): string | null;
  getInteger(name: string): number | null;
  getNumber(name: string): number | null;
  getBoolean(name: string): boolean | null;
  getUser(name: string): User | null;
  getMember(name: string): Member | null;
  getChannel(name: string): Channel | null;
  getRole(name: string): Role | null;
  getAttachment(name: string): { id: Snowflake; url: string; filename: string; size: number; content_type?: string } | null;
  getMentionable(name: string): User | Role | null;
  getSubcommand(): string | null;
  getSubcommandGroup(): string | null;
};

/** Answers the command. After defer() it fills in the "thinking…" message; after a reply it sends a follow-up. */
declare function reply(message: MessageLike): Promise<Message | null>;
/** Shows "thinking…" and buys 15 minutes; a later reply() fills it in. */
declare function defer(options?: { ephemeral?: boolean }): Promise<null>;
/** Another message after the first reply. */
declare function followUp(message: MessageLike): Promise<Message | null>;
/** Changes the first reply. */
declare function editReply(message: MessageLike): Promise<Message | null>;
/** Removes the first reply. */
declare function deleteReply(): Promise<null>;
/** Posts a normal message into a channel. Same as messages.send(). */
declare function send(channelId: Snowflake, message: MessageLike): Promise<Message>;

/** Raw access to any Discord API route (https://discord.com/developers/docs). Paths start with "/". */
declare const discord: {
  get<T = any>(path: string, query?: Record<string, any>, opts?: ReasonOpts): Promise<T>;
  post<T = any>(path: string, body?: any, opts?: ReasonOpts): Promise<T>;
  patch<T = any>(path: string, body?: any, opts?: ReasonOpts): Promise<T>;
  put<T = any>(path: string, body?: any, opts?: ReasonOpts): Promise<T>;
  delete<T = any>(path: string, opts?: ReasonOpts): Promise<T>;
  request<T = any>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, opts?: { query?: Record<string, any>; body?: any; reason?: string }): Promise<T>;
};

/** The server the command was used in (or the one given with guildId). */
declare const guild: {
  get(opts?: { guildId?: Snowflake }): Promise<Guild>;
  /** name, icon (data URI), banner, description, verificationLevel, systemChannelId, afkChannelId… */
  edit(data: Record<string, any>, opts?: GuildOpts): Promise<Guild>;
  channels(guildId?: Snowflake): Promise<Channel[]>;
  roles(guildId?: Snowflake): Promise<Role[]>;
  bans(opts?: { limit?: number; after?: Snowflake; guildId?: Snowflake }): Promise<Array<{ user: User; reason: string | null }>>;
  bulkBan(userIds: IdLike[], opts?: GuildOpts & { deleteMessageSeconds?: number }): Promise<{ banned_users: Snowflake[]; failed_users: Snowflake[] }>;
  invites(guildId?: Snowflake): Promise<any[]>;
  webhooks(guildId?: Snowflake): Promise<Webhook[]>;
  auditLog(opts?: { userId?: Snowflake; actionType?: number; before?: Snowflake; after?: Snowflake; limit?: number; guildId?: Snowflake }): Promise<any>;
  pruneCount(opts?: { days?: number; guildId?: Snowflake }): Promise<{ pruned: number }>;
  prune(opts?: GuildOpts & { days?: number }): Promise<{ pruned: number }>;
  voiceRegions(guildId?: Snowflake): Promise<any[]>;
  /** The bot leaves the server. */
  leave(guildId?: Snowflake): Promise<void>;
};

type ChannelTypeName = "text" | "voice" | "category" | "announcement" | "stage" | "forum" | "media";
interface Overwrite { id: IdLike; type?: "role" | "member" | 0 | 1; allow?: PermissionsLike; deny?: PermissionsLike }
interface ChannelData {
  name?: string;
  type?: ChannelTypeName | number;
  topic?: string | null;
  /** The category to put it in; null takes it out. */
  parent?: IdLike | null;
  position?: number;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites?: Overwrite[];
  [key: string]: any;
}

declare const channels: {
  get(channelId: IdLike): Promise<Channel>;
  list(guildId?: Snowflake): Promise<Channel[]>;
  create(data: ChannelData & { name: string; guildId?: Snowflake }, opts?: GuildOpts): Promise<Channel>;
  edit(channelId: IdLike, data: ChannelData, opts?: ReasonOpts): Promise<Channel>;
  delete(channelId: IdLike, opts?: ReasonOpts): Promise<Channel>;
  setPositions(list: Array<{ id: IdLike; position?: number; parentId?: Snowflake | null; lockPermissions?: boolean }>, opts?: GuildOpts): Promise<void>;
  /** Allows or denies permissions for one role or member in a channel. */
  setPermission(channelId: IdLike, target: IdLike, perms: { type?: "role" | "member"; allow?: PermissionsLike; deny?: PermissionsLike }, opts?: ReasonOpts): Promise<void>;
  deletePermission(channelId: IdLike, target: IdLike, opts?: ReasonOpts): Promise<void>;
  invites(channelId: IdLike): Promise<any[]>;
  createInvite(channelId: IdLike, data?: { maxAge?: number; maxUses?: number; temporary?: boolean; unique?: boolean }, opts?: ReasonOpts): Promise<{ code: string; [key: string]: any }>;
  typing(channelId: IdLike): Promise<void>;
  follow(announcementChannelId: IdLike, targetChannelId: IdLike): Promise<any>;
};

declare const messages: {
  send(channelId: IdLike, message: MessageLike): Promise<Message>;
  get(channelId: IdLike, messageId: IdLike): Promise<Message>;
  /** Newest first; up to 100. */
  list(channelId: IdLike, opts?: { limit?: number; before?: Snowflake; after?: Snowflake; around?: Snowflake }): Promise<Message[]>;
  edit(channelId: IdLike, messageId: IdLike, message: MessageLike): Promise<Message>;
  delete(channelId: IdLike, messageId: IdLike, opts?: ReasonOpts): Promise<void>;
  /** Deletes the newest N messages, or the ids given (up to 100, younger than 14 days). Resolves to how many. */
  bulkDelete(channelId: IdLike, which: number | IdLike[], opts?: ReasonOpts): Promise<number>;
  pins(channelId: IdLike): Promise<Message[]>;
  pin(channelId: IdLike, messageId: IdLike, opts?: ReasonOpts): Promise<void>;
  unpin(channelId: IdLike, messageId: IdLike, opts?: ReasonOpts): Promise<void>;
  /** emoji: "👍", "name:id" or "<:name:id>". */
  react(channelId: IdLike, messageId: IdLike, emoji: string): Promise<void>;
  /** Removes the bot's reaction, or someone else's when userId is given. */
  unreact(channelId: IdLike, messageId: IdLike, emoji: string, userId?: IdLike): Promise<void>;
  reactions(channelId: IdLike, messageId: IdLike, emoji: string, opts?: { limit?: number; after?: Snowflake }): Promise<User[]>;
  /** Clears every reaction, or only one emoji's. */
  clearReactions(channelId: IdLike, messageId: IdLike, emoji?: string): Promise<void>;
  crosspost(channelId: IdLike, messageId: IdLike): Promise<Message>;
  endPoll(channelId: IdLike, messageId: IdLike): Promise<Message>;
};

interface RoleData { name?: string; color?: ColorLike; permissions?: PermissionsLike; hoist?: boolean; mentionable?: boolean; icon?: string | null; unicodeEmoji?: string | null }

declare const roles: {
  list(guildId?: Snowflake): Promise<Role[]>;
  get(roleId: IdLike, opts?: { guildId?: Snowflake }): Promise<Role>;
  create(data: RoleData, opts?: GuildOpts): Promise<Role>;
  edit(roleId: IdLike, data: RoleData, opts?: GuildOpts): Promise<Role>;
  delete(roleId: IdLike, opts?: GuildOpts): Promise<void>;
  setPositions(list: Array<{ id: IdLike; position: number }>, opts?: GuildOpts): Promise<Role[]>;
  /** Gives a member a role. */
  add(userId: IdLike, roleId: IdLike, opts?: GuildOpts): Promise<void>;
  /** Takes a role away from a member. */
  remove(userId: IdLike, roleId: IdLike, opts?: GuildOpts): Promise<void>;
};

declare const members: {
  get(userId: IdLike, opts?: { guildId?: Snowflake }): Promise<Member>;
  list(opts?: { limit?: number; after?: Snowflake; guildId?: Snowflake }): Promise<Member[]>;
  /** Members whose username or nickname starts with the query. */
  search(query: string, opts?: { limit?: number; guildId?: Snowflake }): Promise<Member[]>;
  /** nick, roles, mute, deaf, channelId, communicationDisabledUntil, flags… */
  edit(userId: IdLike, data: Record<string, any>, opts?: GuildOpts): Promise<Member>;
  setNickname(userId: IdLike, nick: string | null, opts?: GuildOpts): Promise<Member>;
  /** Times someone out for ms milliseconds (max 28 days); null or 0 lifts it. */
  timeout(userId: IdLike, ms: number | null, opts?: GuildOpts): Promise<Member>;
  kick(userId: IdLike, opts?: GuildOpts): Promise<void>;
  ban(userId: IdLike, opts?: GuildOpts & { deleteMessageSeconds?: number }): Promise<void>;
  unban(userId: IdLike, opts?: GuildOpts): Promise<void>;
  /** Moves someone to another voice channel; null disconnects them. */
  move(userId: IdLike, channelId: IdLike | null, opts?: GuildOpts): Promise<Member>;
  mute(userId: IdLike, muted?: boolean, opts?: GuildOpts): Promise<Member>;
  deafen(userId: IdLike, deafened?: boolean, opts?: GuildOpts): Promise<Member>;
  /** The bot's own member. */
  me(opts?: { guildId?: Snowflake }): Promise<Member>;
  setMyNickname(nick: string | null, opts?: GuildOpts): Promise<Member>;
};

/** A webhook: its URL, { id, token }, or its id with opts.token. */
type WebhookLike = string | { id: Snowflake; token?: string };

declare const webhooks: {
  /** avatar: a data URI — see imageData(). */
  create(channelId: IdLike, data: string | { name: string; avatar?: string }, opts?: ReasonOpts): Promise<Webhook>;
  list(channelId: IdLike): Promise<Webhook[]>;
  listGuild(guildId?: Snowflake): Promise<Webhook[]>;
  get(webhookId: IdLike): Promise<Webhook>;
  /** name, avatar, channel (moves it). */
  edit(webhookId: IdLike, data: { name?: string; avatar?: string | null; channel?: IdLike }, opts?: ReasonOpts): Promise<Webhook>;
  delete(webhookId: IdLike, opts?: ReasonOpts): Promise<void>;
  /** Posts through a webhook, optionally under another name and avatar. */
  send(webhook: WebhookLike, message: MessageLike, opts?: { username?: string; avatarURL?: string; threadId?: Snowflake; threadName?: string; wait?: boolean; token?: string }): Promise<Message>;
  editMessage(webhook: WebhookLike, messageId: IdLike, message: MessageLike, opts?: { token?: string }): Promise<Message>;
  deleteMessage(webhook: WebhookLike, messageId: IdLike, opts?: { token?: string }): Promise<void>;
};

declare const threads: {
  /** A thread in a text channel, or a forum post when message is given. */
  create(channelId: IdLike, data: string | { name: string; type?: "public" | "private"; autoArchiveDuration?: 60 | 1440 | 4320 | 10080; invitable?: boolean; message?: MessageLike; appliedTags?: Snowflake[] }, opts?: ReasonOpts): Promise<Channel>;
  fromMessage(channelId: IdLike, messageId: IdLike, data: string | { name: string; autoArchiveDuration?: number }, opts?: ReasonOpts): Promise<Channel>;
  edit(threadId: IdLike, data: Record<string, any>, opts?: ReasonOpts): Promise<Channel>;
  archive(threadId: IdLike, archived?: boolean, opts?: ReasonOpts): Promise<Channel>;
  lock(threadId: IdLike, locked?: boolean, opts?: ReasonOpts): Promise<Channel>;
  delete(threadId: IdLike, opts?: ReasonOpts): Promise<Channel>;
  join(threadId: IdLike): Promise<void>;
  leave(threadId: IdLike): Promise<void>;
  addMember(threadId: IdLike, userId: IdLike): Promise<void>;
  removeMember(threadId: IdLike, userId: IdLike): Promise<void>;
  members(threadId: IdLike): Promise<any[]>;
  active(guildId?: Snowflake): Promise<{ threads: Channel[]; members: any[] }>;
  archived(channelId: IdLike, opts?: { private?: boolean; limit?: number; before?: string }): Promise<{ threads: Channel[]; has_more: boolean }>;
};

declare const emojis: {
  list(guildId?: Snowflake): Promise<any[]>;
  get(emojiId: IdLike, opts?: { guildId?: Snowflake }): Promise<any>;
  /** image: a data URI — imageData(url) makes one. */
  create(data: { name: string; image: string; roles?: IdLike[] }, opts?: GuildOpts): Promise<any>;
  edit(emojiId: IdLike, data: { name?: string; roles?: Snowflake[] }, opts?: GuildOpts): Promise<any>;
  delete(emojiId: IdLike, opts?: GuildOpts): Promise<void>;
  stickers(guildId?: Snowflake): Promise<any[]>;
  deleteSticker(stickerId: IdLike, opts?: GuildOpts): Promise<void>;
};

interface EventData {
  name?: string;
  description?: string;
  /** "stage", "voice" or "external" (needs location and scheduledEndTime). */
  entityType?: "stage" | "voice" | "external" | number;
  channel?: IdLike;
  location?: string;
  scheduledStartTime?: Date | number | string;
  scheduledEndTime?: Date | number | string;
  image?: string;
  status?: number;
}

declare const events: {
  list(guildId?: Snowflake): Promise<any[]>;
  get(eventId: IdLike, opts?: { guildId?: Snowflake }): Promise<any>;
  create(data: EventData, opts?: GuildOpts): Promise<any>;
  edit(eventId: IdLike, data: EventData, opts?: GuildOpts): Promise<any>;
  delete(eventId: IdLike, opts?: GuildOpts): Promise<void>;
  users(eventId: IdLike, opts?: { limit?: number; guildId?: Snowflake }): Promise<any[]>;
};

declare const invites: {
  /** A code or a discord.gg link. */
  get(code: string): Promise<any>;
  delete(code: string, opts?: ReasonOpts): Promise<any>;
  create(channelId: IdLike, data?: { maxAge?: number; maxUses?: number; temporary?: boolean; unique?: boolean }, opts?: ReasonOpts): Promise<{ code: string; [key: string]: any }>;
};

declare const users: {
  get(userId: IdLike): Promise<User>;
  /** The bot itself. */
  me(): Promise<User>;
  /** Sends someone a direct message. Fails if they do not accept DMs from the bot. */
  dm(userId: IdLike, message: MessageLike): Promise<Message>;
  /** Servers the bot is in. */
  guilds(): Promise<Guild[]>;
};

/** Permission names to bits, plus has() and resolve(). */
declare const Permissions: {
  readonly CreateInstantInvite: string; readonly KickMembers: string; readonly BanMembers: string; readonly Administrator: string;
  readonly ManageChannels: string; readonly ManageGuild: string; readonly AddReactions: string; readonly ViewAuditLog: string;
  readonly PrioritySpeaker: string; readonly Stream: string; readonly ViewChannel: string; readonly SendMessages: string;
  readonly SendTTSMessages: string; readonly ManageMessages: string; readonly EmbedLinks: string; readonly AttachFiles: string;
  readonly ReadMessageHistory: string; readonly MentionEveryone: string; readonly UseExternalEmojis: string; readonly ViewGuildInsights: string;
  readonly Connect: string; readonly Speak: string; readonly MuteMembers: string; readonly DeafenMembers: string; readonly MoveMembers: string;
  readonly UseVAD: string; readonly ChangeNickname: string; readonly ManageNicknames: string; readonly ManageRoles: string;
  readonly ManageWebhooks: string; readonly ManageGuildExpressions: string; readonly UseApplicationCommands: string;
  readonly RequestToSpeak: string; readonly ManageEvents: string; readonly ManageThreads: string; readonly CreatePublicThreads: string;
  readonly CreatePrivateThreads: string; readonly UseExternalStickers: string; readonly SendMessagesInThreads: string;
  readonly UseEmbeddedActivities: string; readonly ModerateMembers: string; readonly ViewCreatorMonetizationAnalytics: string;
  readonly UseSoundboard: string; readonly CreateGuildExpressions: string; readonly CreateEvents: string; readonly UseExternalSounds: string;
  readonly SendVoiceMessages: string; readonly SendPolls: string; readonly UseExternalApps: string; readonly PinMessages: string;
  /** Whether a bit field (e.g. member.permissions) includes the permission(s); Administrator counts as all. */
  has(bits: string | number | bigint | null | undefined, permission: PermissionsLike): boolean;
  /** Combines names, numbers or bit strings into one decimal bit field string. */
  resolve(value: PermissionsLike): string;
};

/** Channel type numbers by name, e.g. ChannelType.GuildText (0). */
declare const ChannelType: {
  readonly GuildText: 0; readonly DM: 1; readonly GuildVoice: 2; readonly GroupDM: 3; readonly GuildCategory: 4;
  readonly GuildAnnouncement: 5; readonly AnnouncementThread: 10; readonly PublicThread: 11; readonly PrivateThread: 12;
  readonly GuildStageVoice: 13; readonly GuildDirectory: 14; readonly GuildForum: 15; readonly GuildMedia: 16;
  readonly [name: string]: number;
};

/** Downloads an image (up to 8 MB) as a data: URI, for emojis, icons and avatars. The host must allow CORS. */
declare function imageData(url: string): Promise<string>;

declare class EmbedBuilder {
  constructor(data?: Embed | EmbedBuilder);
  setTitle(title: string): this;
  setDescription(description: string): this;
  setURL(url: string): this;
  setColor(color: ColorLike): this;
  setAuthor(author: string | { name: string; url?: string; iconURL?: string } | null): this;
  setFooter(footer: string | { text: string; iconURL?: string } | null): this;
  setImage(url: string | null): this;
  setThumbnail(url: string | null): this;
  setTimestamp(time?: Date | number | string | null): this;
  addFields(...fields: Array<{ name: string; value: string; inline?: boolean } | Array<{ name: string; value: string; inline?: boolean }>>): this;
  setFields(...fields: Array<{ name: string; value: string; inline?: boolean }>): this;
  toJSON(): Embed;
}

/** Waits ms milliseconds. */
declare function sleep(ms: number): Promise<void>;
`;
