import type {
  APIApplication,
  APIApplicationCommand,
  APIInteractionResponseCallbackData,
  APIMessage,
  RESTPatchAPIApplicationCommandJSONBody,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import type { RestClient } from "./rest";

/** `null` (or omitted) means the global scope, a snowflake means one guild. */
export type CommandScope = string | null | undefined;

function basePath(applicationId: string, guildId: CommandScope): string {
  return guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;
}

/**
 * Application command CRUD plus the interaction response endpoints.
 *
 * Kept apart from `api.ts` because these routes are keyed by the *application*
 * id rather than by a guild or channel, and because the interaction callback
 * routes are authenticated by the interaction token, not by the bot token.
 */
export const commandApi = {
  /** The application behind the current bot token. */
  currentApplication: (rest: RestClient) => rest.get<APIApplication>("/oauth2/applications/@me"),

  /** Commands of one scope: global when `guildId` is empty, guild-local otherwise. */
  list: (rest: RestClient, applicationId: string, guildId?: CommandScope) =>
    rest.get<APIApplicationCommand[]>(basePath(applicationId, guildId), {
      query: { with_localizations: false },
    }),

  /** Discord upserts by name, so this also overwrites a command of the same name. */
  create: (
    rest: RestClient,
    applicationId: string,
    body: RESTPostAPIApplicationCommandsJSONBody,
    guildId?: CommandScope,
  ) => rest.post<APIApplicationCommand>(basePath(applicationId, guildId), { body }),

  edit: (
    rest: RestClient,
    applicationId: string,
    commandId: string,
    body: RESTPatchAPIApplicationCommandJSONBody,
    guildId?: CommandScope,
  ) =>
    rest.patch<APIApplicationCommand>(`${basePath(applicationId, guildId)}/${commandId}`, { body }),

  remove: (rest: RestClient, applicationId: string, commandId: string, guildId?: CommandScope) =>
    rest.delete<void>(`${basePath(applicationId, guildId)}/${commandId}`),

  /** Replaces every command of the scope in a single request. */
  bulkOverwrite: (
    rest: RestClient,
    applicationId: string,
    body: RESTPostAPIApplicationCommandsJSONBody[],
    guildId?: CommandScope,
  ) => rest.put<APIApplicationCommand[]>(basePath(applicationId, guildId), { body }),

  /** Type 4 — answer the interaction with a message right away. */
  respond: (
    rest: RestClient,
    interactionId: string,
    interactionToken: string,
    data: APIInteractionResponseCallbackData,
  ) =>
    rest.post<void>(`/interactions/${interactionId}/${interactionToken}/callback`, {
      body: { type: InteractionResponseType.ChannelMessageWithSource, data },
    }),

  /** Type 5 — "the bot is thinking"; buys 15 minutes for a follow-up. */
  defer: (
    rest: RestClient,
    interactionId: string,
    interactionToken: string,
    ephemeral = false,
  ) =>
    rest.post<void>(`/interactions/${interactionId}/${interactionToken}/callback`, {
      body: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        // 1 << 6 = EPHEMERAL
        data: ephemeral ? { flags: 1 << 6 } : {},
      },
    }),

  /** Follow-up message on an already acknowledged interaction. */
  followUp: (
    rest: RestClient,
    applicationId: string,
    interactionToken: string,
    data: APIInteractionResponseCallbackData,
  ) => rest.post<APIMessage>(`/webhooks/${applicationId}/${interactionToken}`, { body: data }),

  /** Replaces the original (possibly deferred) response. */
  editOriginalResponse: (
    rest: RestClient,
    applicationId: string,
    interactionToken: string,
    data: APIInteractionResponseCallbackData,
  ) =>
    rest.patch<APIMessage>(`/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      body: data,
    }),
};

/**
 * For a bot the application id equals the bot user's id, so the store's user is
 * enough; `/oauth2/applications/@me` is only consulted when it is missing.
 */
export async function resolveApplicationId(
  rest: RestClient,
  botUserId?: string | null,
): Promise<string> {
  if (botUserId) return botUserId;
  const application = await commandApi.currentApplication(rest);
  return application.id;
}
