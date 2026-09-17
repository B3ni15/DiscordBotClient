"use client";

import { useEffect, useState } from "react";
import type { APIUser } from "discord-api-types/v10";
import { PermissionFlagsBits } from "discord-api-types/v10";
import { Spinner } from "@/components/ui/Spinner";
import { StatusDot, STATUS_LABEL } from "@/components/ui/StatusDot";
import { api } from "@/lib/discord/api";
import {
  avatarDecorationUrl,
  memberAvatarUrl,
  userAvatarUrl,
  userBannerUrl,
} from "@/lib/discord/cdn";
import { customStatus, detailedActivities, deviceLabel } from "@/lib/discord/presence";
import {
  displayName,
  memberColorHex,
  memberPermissions,
  memberRoles,
  roleColorHex,
  snowflakeTimestamp,
} from "@/lib/discord/roles";
import { ActivityCard } from "@/components/members/ActivityCard";
import { BadgeRow } from "@/components/members/BadgeRow";
import { BotTag } from "@/components/ui/BotTag";
import {
  EXTRA_BADGES,
  accentColorHex,
  userBadges,
  type UserBadge,
} from "@/lib/discord/userFlags";
import { OFFLINE_PRESENCE, useClient } from "@/lib/store/client";

export interface UserCardProps {
  guildId: string;
  userId: string;
  onClose: () => void;
  className?: string;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", DATE_FORMAT).format(date);
}

/** Discord heads each activity with what the person is doing, not "Activity". */
const ACTIVITY_HEADING: Record<number, string> = {
  0: "Playing",
  1: "Streaming",
  2: "Listening to",
  3: "Watching",
  5: "Competing in",
};

/** Permissions worth calling out on a profile, highest impact first. */
const NOTABLE_PERMISSIONS: Array<[bigint, string]> = [
  [PermissionFlagsBits.Administrator, "Administrator"],
  [PermissionFlagsBits.ManageGuild, "Manage Server"],
  [PermissionFlagsBits.ManageRoles, "Manage Roles"],
  [PermissionFlagsBits.ManageChannels, "Manage Channels"],
  [PermissionFlagsBits.BanMembers, "Ban Members"],
  [PermissionFlagsBits.KickMembers, "Kick Members"],
  [PermissionFlagsBits.ModerateMembers, "Timeout Members"],
  [PermissionFlagsBits.ManageMessages, "Manage Messages"],
  [PermissionFlagsBits.MentionEveryone, "Mention Everyone"],
];

/**
 * Profile of a single guild member: identity and badges, presence and what they
 * are doing, the dates, their roles and standing in the server, and a shortcut
 * that opens the DM and files it under Direct Messages.
 */
export function UserCard({ guildId, userId, onClose, className }: UserCardProps) {
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const guild = useClient((state) => state.guilds[guildId]);
  const presence = useClient(
    (state) => state.presenceByGuild[guildId]?.[userId] ?? OFFLINE_PRESENCE,
  );
  const hasPresence = useClient((state) => state.presenceEnabled);
  const getRest = useClient((state) => state.getRest);
  const openDM = useClient((state) => state.openDM);

  const [copied, setCopied] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The account as Discord knows it; carries the banner and badges a member
   * object lacks. Kept with the id it was fetched for, so a card switched to
   * another member never shows the previous one's profile.
   */
  const [fetched, setFetched] = useState<{ id: string; user: APIUser } | null>(null);
  /** Evaluated once per mount: only used to tell an active timeout from a past one. */
  const [mountedAt] = useState(() => Date.now());

  const user = member?.user;
  const roles = member ? memberRoles(member, guild?.roles ?? []) : [];
  const nameColor = member ? memberColorHex(member, guild?.roles ?? []) : null;

  useEffect(() => {
    let cancelled = false;
    api
      .user(getRest(), userId)
      .then((user) => {
        if (!cancelled) setFetched({ id: userId, user });
      })
      .catch(() => {
        // The profile stays on what the member object already carries.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, getRest]);

  const account = fetched?.id === userId ? fetched.user : null;

  const banner = account ? userBannerUrl(account) : null;
  const accent = accentColorHex(account?.accent_color) ?? nameColor;
  // The REST account carries public_flags; the member's user object usually
  // does too, so badges show before that request lands.
  const flagged = account ?? user;
  // Boosting is a guild fact rather than an account flag, so it is added here
  // rather than being read off public_flags with the rest.
  const badges: UserBadge[] = [
    ...userBadges(flagged),
    ...(member?.premium_since ? [EXTRA_BADGES.serverBooster as UserBadge] : []),
  ];
  const avatar =
    memberAvatarUrl(guildId, userId, member?.avatar, 128) ??
    (user ? userAvatarUrl(user, 128) : undefined);
  const decoration = avatarDecorationUrl(account?.avatar_decoration_data);

  const status = customStatus(presence);
  const activities = detailedActivities(presence);
  const devices = deviceLabel(presence);

  const permissions =
    guild && member ? memberPermissions(guild, member) : null;
  const isAdmin =
    permissions !== null &&
    (permissions & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
  // Administrator already grants everything, so listing the rest says nothing.
  const notable =
    permissions === null
      ? []
      : isAdmin
        ? ["Administrator"]
        : NOTABLE_PERMISSIONS.filter(([bit]) => (permissions & bit) === bit).map(
            ([, label]) => label,
          );
  const isOwner = guild?.owner_id === userId;
  const timeoutUntil = member?.communication_disabled_until;
  const timedOut = timeoutUntil ? Date.parse(timeoutUntil) > mountedAt : false;

  async function copyId() {
    setError(null);
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the ID to the clipboard.");
    }
  }

  async function handleOpenDM() {
    setDmBusy(true);
    setError(null);
    try {
      // Everything known here is stored with the DM: the bot may lose sight of
      // this person the moment it no longer shares a server with them.
      await openDM(userId, {
        username: user?.username,
        globalName: user?.global_name ?? null,
        discriminator: user?.discriminator ?? null,
        avatar: user?.avatar ?? null,
        bot: user?.bot,
        publicFlags: flagged?.public_flags ?? null,
        nick: member?.nick ?? null,
        guildId,
        guildName: guild?.name ?? null,
        roles: roles.map((role) => role.name),
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? `Could not open a DM: ${cause.message}` : "Could not open a DM.",
      );
    } finally {
      setDmBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Member details"
      className={`flex w-80 flex-col overflow-hidden rounded-lg bg-panel-alt shadow-2xl ${className ?? ""}`}
    >
      <div
        className="relative h-[60px] shrink-0 bg-cover bg-center"
        style={{
          backgroundColor: accent ?? "var(--accent)",
          backgroundImage: banner ? `url(${banner})` : undefined,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card"
          className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-black/40 text-sm text-white transition-colors hover:bg-black/70"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      <div className="relative -mt-8 px-4">
        <span className="relative inline-block">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-20 w-20 rounded-full border-[6px] border-panel-alt bg-panel-alt"
            />
          ) : (
            <span className="block h-20 w-20 rounded-full border-[6px] border-panel-alt bg-raised" />
          )}
          {decoration && (
            // The frame sits over the avatar and must not swallow the clicks.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={decoration}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -top-[7px] -left-[7px] h-[94px] w-[94px] max-w-none"
            />
          )}
          {hasPresence && (
            <StatusDot
              status={presence.status}
              size={14}
              ringClassName="bg-panel-alt"
              className="absolute right-0.5 bottom-0.5"
              label={STATUS_LABEL[presence.status] ?? "Offline"}
            />
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-2">
        <div className="rounded-lg bg-ink p-3">
          <p className="flex flex-wrap items-center gap-2">
            <span
              className="text-xl leading-tight font-bold break-words text-bright"
              style={nameColor ? { color: nameColor } : undefined}
            >
              {member ? displayName(member) : (account?.global_name ?? "Unknown member")}
            </span>
            <BotTag user={flagged} />
          </p>
          <p className="text-sm text-text">
            @{user?.username ?? account?.username ?? userId}
            {user?.discriminator && user.discriminator !== "0" && (
              <span className="text-muted">#{user.discriminator}</span>
            )}
          </p>

          <div className="mt-2 border-t border-line pt-2">
            <BadgeRow badges={badges} />
            <p
              className="mt-1.5 text-[10px] leading-snug text-faint"
              title="Bios, Nitro and quest badges come from the user-profile endpoint, which only user accounts may call."
            >
              Bios and Nitro badges are not visible to bot tokens.
            </p>
          </div>

          {status && (
            <p className="mt-2 border-t border-line pt-2 text-sm break-words text-text">{status}</p>
          )}

          {hasPresence && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <StatusDot status={presence.status} size={8} ringClassName="bg-transparent" />
              {STATUS_LABEL[presence.status] ?? "Offline"}
              {devices && <span className="text-faint">· {devices}</span>}
            </p>
          )}

          {activities.map((activity, index) => (
            <Section
              key={activity.id ?? `${activity.name}-${index}`}
              title={ACTIVITY_HEADING[activity.type] ?? "Activity"}
            >
              <ul className="flex flex-col gap-3">
                <ActivityCard activity={activity} />
              </ul>
            </Section>
          ))}

          <Section title="Member since">
            <div className="grid grid-cols-2 gap-3">
              <p className="text-xs text-text">
                <span className="block text-[10px] text-muted">{guild?.name ?? "This server"}</span>
                {formatDate(member?.joined_at)}
              </p>
              <p className="text-xs text-text">
                <span className="block text-[10px] text-muted">Discord</span>
                {formatDate(snowflakeTimestamp(userId))}
              </p>
            </div>
          </Section>

          {member?.premium_since && (
            <Section title="Boosting since">
              <p className="text-xs text-amber">{formatDate(member.premium_since)}</p>
            </Section>
          )}

          {timedOut && (
            <Section title="Timed out until">
              <p className="text-xs text-danger">{formatDate(timeoutUntil)}</p>
            </Section>
          )}

          <Section title={`Roles — ${roles.length}`}>
            {roles.length === 0 ? (
              <p className="text-xs text-muted">This member has no roles.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {roles.map((role) => {
                  const color = roleColorHex(role.color);
                  return (
                    <li
                      key={role.id}
                      className="flex items-center gap-1.5 rounded bg-panel px-2 py-0.5 text-[11px] text-text"
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full bg-muted"
                        style={color ? { backgroundColor: color } : undefined}
                      />
                      <span className="max-w-32 truncate">{role.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {(isOwner || notable.length > 0) && (
            <Section title="Standing">
              <ul className="flex flex-wrap gap-1.5">
                {isOwner && (
                  <li className="rounded bg-amber/15 px-2 py-0.5 text-[11px] text-amber">
                    Server owner
                  </li>
                )}
                {notable.map((label) => (
                  <li
                    key={label}
                    className="rounded bg-panel px-2 py-0.5 text-[11px] text-muted"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="User ID">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{userId}</span>
              <button
                type="button"
                onClick={() => void copyId()}
                className="shrink-0 rounded bg-panel px-2 py-1 text-[11px] text-muted transition-colors hover:bg-raised hover:text-bright"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </Section>

          {error && <p className="mt-3 text-xs leading-relaxed text-danger">{error}</p>}
        </div>
      </div>

      <footer className="shrink-0 px-4 pt-1 pb-4">
        <button
          type="button"
          onClick={() => void handleOpenDM()}
          disabled={dmBusy}
          className="flex w-full items-center justify-center gap-2 rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {dmBusy && <Spinner size={14} />}
          {dmBusy ? "Opening…" : "Send a direct message"}
        </button>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 border-t border-line pt-2">
      <h3 className="pb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
