"use client";

import { useState } from "react";
import { api } from "@/lib/discord/api";
import { userAvatarUrl } from "@/lib/discord/cdn";
import {
  displayName,
  memberColorHex,
  memberRoles,
  roleColorHex,
  snowflakeTimestamp,
} from "@/lib/discord/roles";
import { useClient } from "@/lib/store/client";

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

/** Details of a single guild member: identity, dates, roles and a DM shortcut. */
export function UserCard({ guildId, userId, onClose, className }: UserCardProps) {
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const guild = useClient((state) => state.guilds[guildId]);
  const getRest = useClient((state) => state.getRest);
  const selectChannel = useClient((state) => state.selectChannel);

  const [copied, setCopied] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = member?.user;
  const roles = member ? memberRoles(member, guild?.roles ?? []) : [];
  const nameColor = member ? memberColorHex(member, guild?.roles ?? []) : null;

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

  async function openDM() {
    setDmBusy(true);
    setError(null);
    try {
      const channel = await api.createDM(getRest(), userId);
      await selectChannel(channel.id);
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
      className={`flex w-72 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl ${className ?? ""}`}
    >
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        {user ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userAvatarUrl(user, 128)}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full bg-raised"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-raised" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span
              className="truncate text-sm font-semibold"
              style={nameColor ? { color: nameColor } : undefined}
            >
              {member ? displayName(member) : "Unknown member"}
            </span>
            {user?.bot && (
              <span className="shrink-0 rounded bg-accent/15 px-1 font-mono text-[10px] text-accent">
                BOT
              </span>
            )}
          </p>
          {user && <p className="truncate text-xs text-muted">@{user.username}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card"
          className="shrink-0 text-muted hover:text-text"
        >
          ✕
        </button>
      </header>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
        <section>
          <h3 className="pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            User ID
          </h3>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{userId}</span>
            <button
              type="button"
              onClick={() => void copyId()}
              className="shrink-0 rounded bg-raised px-2 py-1 text-[11px] text-muted transition-colors hover:text-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
              Joined server
            </h3>
            <p className="text-xs text-text">{formatDate(member?.joined_at)}</p>
          </div>
          <div>
            <h3 className="pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
              Account created
            </h3>
            <p className="text-xs text-text">{formatDate(snowflakeTimestamp(userId))}</p>
          </div>
        </section>

        <section>
          <h3 className="pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Roles — <span className="font-mono">{roles.length}</span>
          </h3>
          {roles.length === 0 ? (
            <p className="text-xs text-muted">This member has no roles.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {roles.map((role) => {
                const color = roleColorHex(role.color);
                return (
                  <li
                    key={role.id}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-text"
                    style={color ? { borderColor: color } : undefined}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full bg-muted"
                      style={color ? { backgroundColor: color } : undefined}
                    />
                    <span className="max-w-32 truncate">{role.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {error && <p className="text-xs leading-relaxed text-danger">{error}</p>}
      </div>

      <footer className="border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => void openDM()}
          disabled={dmBusy}
          className="w-full rounded bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {dmBusy ? "Opening…" : "Open DM"}
        </button>
      </footer>
    </div>
  );
}
