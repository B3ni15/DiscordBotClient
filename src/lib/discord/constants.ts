export const API_BASE = "/api/discord";
export const CDN_BASE = "https://cdn.discordapp.com";
export const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

export const GatewayIntent = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildExpressions: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
} as const;

/** Intents that must be enabled in the Developer Portal before they may be requested. */
export const PRIVILEGED_INTENTS =
  GatewayIntent.GuildMembers | GatewayIntent.GuildPresences | GatewayIntent.MessageContent;

/**
 * Everything the client can make use of, presences included: without
 * `GuildPresences` Discord sends neither the `presences` array in GUILD_CREATE
 * nor any PRESENCE_UPDATE, so the member list can never show who is around.
 */
export const DEFAULT_INTENTS =
  GatewayIntent.Guilds |
  GatewayIntent.GuildMembers |
  GatewayIntent.GuildPresences |
  GatewayIntent.GuildExpressions |
  GatewayIntent.GuildVoiceStates |
  GatewayIntent.GuildMessages |
  GatewayIntent.GuildMessageReactions |
  GatewayIntent.GuildMessageTyping |
  GatewayIntent.DirectMessages |
  GatewayIntent.DirectMessageReactions |
  GatewayIntent.DirectMessageTyping |
  GatewayIntent.MessageContent;

/** Intents left when the bot has no privileged intents enabled. */
export const FALLBACK_INTENTS = DEFAULT_INTENTS & ~PRIVILEGED_INTENTS;

/**
 * Tried in order whenever Discord answers a connect with close code 4014
 * ("disallowed intents"). Each step drops one more privileged intent, so a bot
 * with only some of them enabled keeps the rest instead of falling all the way
 * back to nothing.
 */
export const INTENT_LADDER: readonly number[] = [
  DEFAULT_INTENTS,
  DEFAULT_INTENTS & ~GatewayIntent.GuildPresences,
  DEFAULT_INTENTS & ~(GatewayIntent.GuildPresences | GatewayIntent.GuildMembers),
  FALLBACK_INTENTS,
];

export function hasIntent(intents: number, intent: number): boolean {
  return (intents & intent) === intent;
}
