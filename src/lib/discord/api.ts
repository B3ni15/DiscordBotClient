import type {
  APIChannel,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIUser,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { RestClient } from "./rest";

export const api = {
  currentUser: (rest: RestClient) => rest.get<APIUser>("/users/@me"),

  /** Full account of any user: banner, accent colour and badge flags included. */
  user: (rest: RestClient, userId: string) => rest.get<APIUser>(`/users/${userId}`),

  currentUserGuilds: (rest: RestClient) =>
    rest.get<APIGuild[]>("/users/@me/guilds", { query: { limit: 200 } }),

  guild: (rest: RestClient, guildId: string) =>
    rest.get<APIGuild>(`/guilds/${guildId}`, { query: { with_counts: true } }),

  guildChannels: (rest: RestClient, guildId: string) =>
    rest.get<APIChannel[]>(`/guilds/${guildId}/channels`),

  guildMembers: (rest: RestClient, guildId: string, limit = 100, after?: string) =>
    rest.get<APIGuildMember[]>(`/guilds/${guildId}/members`, { query: { limit, after } }),

  channel: (rest: RestClient, channelId: string) =>
    rest.get<APIChannel>(`/channels/${channelId}`),

  messages: (
    rest: RestClient,
    channelId: string,
    options: { limit?: number; before?: string; after?: string; around?: string } = {},
  ) =>
    rest.get<APIMessage[]>(`/channels/${channelId}/messages`, {
      query: { limit: options.limit ?? 50, ...options },
    }),

  sendMessage: (
    rest: RestClient,
    channelId: string,
    body: RESTPostAPIChannelMessageJSONBody,
  ) => rest.post<APIMessage>(`/channels/${channelId}/messages`, { body }),

  /** Send a message with attachments; `files` map onto the `attachments` field by index. */
  sendMessageWithFiles: (
    rest: RestClient,
    channelId: string,
    body: RESTPostAPIChannelMessageJSONBody,
    files: File[],
  ) => {
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        ...body,
        attachments: files.map((file, index) => ({ id: index, filename: file.name })),
      }),
    );
    files.forEach((file, index) => form.append(`files[${index}]`, file, file.name));
    return rest.post<APIMessage>(`/channels/${channelId}/messages`, { form });
  },

  editMessage: (rest: RestClient, channelId: string, messageId: string, content: string) =>
    rest.patch<APIMessage>(`/channels/${channelId}/messages/${messageId}`, { body: { content } }),

  deleteMessage: (rest: RestClient, channelId: string, messageId: string) =>
    rest.delete<void>(`/channels/${channelId}/messages/${messageId}`),

  pinnedMessages: (rest: RestClient, channelId: string) =>
    rest.get<APIMessage[]>(`/channels/${channelId}/pins`),

  addReaction: (rest: RestClient, channelId: string, messageId: string, emoji: string) =>
    rest.put<void>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    ),

  removeReaction: (rest: RestClient, channelId: string, messageId: string, emoji: string) =>
    rest.delete<void>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    ),

  triggerTyping: (rest: RestClient, channelId: string) =>
    rest.post<void>(`/channels/${channelId}/typing`),

  createDM: (rest: RestClient, recipientId: string) =>
    rest.post<APIChannel>("/users/@me/channels", { body: { recipient_id: recipientId } }),
};
