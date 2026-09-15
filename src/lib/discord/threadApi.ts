import type { APIThreadChannel } from "discord-api-types/v10";
import type { RestClient } from "./rest";

/** Minutes of inactivity before Discord archives a thread. */
export type AutoArchiveDuration = 60 | 1440 | 4320 | 10080;

export const AUTO_ARCHIVE_DURATIONS: readonly AutoArchiveDuration[] = [60, 1440, 4320, 10080];

/** 11 = public thread, 12 = private thread. */
export const ThreadType = {
  Public: 11,
  Private: 12,
} as const;

export type ThreadType = (typeof ThreadType)[keyof typeof ThreadType];

export interface CreateThreadFromMessageOptions {
  name: string;
  auto_archive_duration?: AutoArchiveDuration;
  /** Seconds a member must wait between messages, 0-21600. */
  rate_limit_per_user?: number;
  reason?: string;
}

export interface CreateThreadOptions extends CreateThreadFromMessageOptions {
  /** Defaults to a public thread. */
  type?: ThreadType;
  /** Private threads only: may members invite others. */
  invitable?: boolean;
}

/**
 * Thread creation endpoints. Kept out of `api.ts` and `navApi.ts` so the thread
 * surface can change without touching the chat or navigation clients.
 */
export const threadApi = {
  /**
   * Starts a thread anchored to an existing message. The thread id equals the
   * message id, and Discord derives the type from the parent channel.
   */
  createFromMessage: (
    rest: RestClient,
    channelId: string,
    messageId: string,
    options: CreateThreadFromMessageOptions,
  ) =>
    rest.post<APIThreadChannel>(`/channels/${channelId}/messages/${messageId}/threads`, {
      body: {
        name: options.name,
        auto_archive_duration: options.auto_archive_duration,
        rate_limit_per_user: options.rate_limit_per_user,
      },
      reason: options.reason,
    }),

  /** Starts a standalone thread with no anchor message. */
  create: (rest: RestClient, channelId: string, options: CreateThreadOptions) =>
    rest.post<APIThreadChannel>(`/channels/${channelId}/threads`, {
      body: {
        name: options.name,
        auto_archive_duration: options.auto_archive_duration,
        rate_limit_per_user: options.rate_limit_per_user,
        type: options.type ?? ThreadType.Public,
        // Only meaningful for private threads; Discord ignores it otherwise.
        invitable: options.type === ThreadType.Private ? options.invitable : undefined,
      },
      reason: options.reason,
    }),
};

/** Human-readable label for an auto-archive duration. */
export function autoArchiveLabel(duration: AutoArchiveDuration): string {
  switch (duration) {
    case 60:
      return "1 hour";
    case 1440:
      return "24 hours";
    case 4320:
      return "3 days";
    case 10080:
      return "1 week";
  }
}
