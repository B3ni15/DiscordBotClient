import type { APIDMChannel, APIGuild, APIGuildMember } from "discord-api-types/v10";
import { api } from "@/lib/discord/api";
import type { RestClient } from "@/lib/discord/rest";
import { findDMByRecipient, rememberDM } from "./dmStore";

/** Discord's epoch, the zero point of every snowflake's timestamp. */
const DISCORD_EPOCH = BigInt(1420070400000);

export interface DMScanProgress {
  /** The server being walked right now. */
  guildName: string;
  /** Members looked at so far, across every server. */
  checked: number;
  /** DMs with at least one message that were filed under Direct Messages. */
  found: number;
}

export interface DMScanOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DMScanProgress) => void;
}

/**
 * Finds the conversations this bot already has with members of the given
 * servers. Bot tokens cannot list their DMs, but opening a DM with someone
 * hands back the existing channel together with its `last_message_id`, so a
 * channel that has one is a conversation worth listing. Members are walked one
 * at a time; the REST client waits out any rate limit on the way.
 *
 * Needs the Server Members privileged intent to page through a server's members.
 */
export async function scanGuildDMs(
  rest: RestClient,
  guilds: APIGuild[],
  selfId: string,
  { signal, onProgress }: DMScanOptions = {},
): Promise<DMScanProgress> {
  const seen = new Set<string>([selfId]);
  const progress: DMScanProgress = { guildName: "", checked: 0, found: 0 };

  for (const guild of guilds) {
    progress.guildName = guild.name;
    onProgress?.({ ...progress });
    const roleNames = new Map((guild.roles ?? []).map((role) => [role.id, role.name]));

    let after: string | undefined;
    for (;;) {
      signal?.throwIfAborted();
      const page: APIGuildMember[] = await api.guildMembers(rest, guild.id, 1000, after);
      if (page.length === 0) break;
      after = page[page.length - 1].user.id;

      for (const member of page) {
        signal?.throwIfAborted();
        const user = member.user;
        // Bots cannot DM each other, and one person only needs checking once.
        if (user.bot || seen.has(user.id)) continue;
        seen.add(user.id);
        progress.checked++;

        if (!findDMByRecipient(user.id)) {
          let channel: APIDMChannel | null = null;
          try {
            channel = (await api.createDM(rest, user.id)) as APIDMChannel;
          } catch {
            // One member Discord will not open a DM with is no reason to stop.
          }
          if (channel?.last_message_id) {
            const listed = rememberDM(
              channel,
              {
                username: user.username,
                globalName: user.global_name,
                discriminator: user.discriminator,
                avatar: user.avatar,
                bot: user.bot,
                publicFlags: user.public_flags,
                nick: member.nick,
                guildId: guild.id,
                guildName: guild.name,
                roles: member.roles
                  .map((id) => roleNames.get(id))
                  .filter((name): name is string => Boolean(name)),
              },
              snowflakeTime(channel.last_message_id),
            );
            // Removed DMs with nothing new since stay removed.
            if (listed) progress.found++;
          }
        }
        onProgress?.({ ...progress });
      }

      if (page.length < 1000) break;
    }
  }

  return progress;
}

function snowflakeTime(id: string): number {
  return Number((BigInt(id) >> BigInt(22)) + DISCORD_EPOCH);
}
