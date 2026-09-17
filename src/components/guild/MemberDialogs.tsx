"use client";

import { useState } from "react";
import { Field, Modal, ModalActions, inputClass } from "@/components/ui/Modal";
import { RoleToggleList } from "@/components/guild/RoleToggleList";
import { guildApi } from "@/lib/discord/guildApi";
import { displayName } from "@/lib/discord/roles";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** Full-size version of the role checklist, for when a submenu is too small. */
export function MemberRolesDialog({
  guildId,
  userId,
  onClose,
}: {
  guildId: string;
  userId: string;
  onClose: () => void;
}) {
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);

  return (
    <Modal
      title="Manage roles"
      subtitle={member ? displayName(member) : userId}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Done
        </button>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Changes apply immediately. A role the bot cannot reach — above its own highest role, or
        owned by an integration — stays locked.
      </p>
      <RoleToggleList guildId={guildId} userId={userId} />
    </Modal>
  );
}

export function NicknameDialog({
  guildId,
  userId,
  onClose,
}: {
  guildId: string;
  userId: string;
  onClose: () => void;
}) {
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const upsertMember = useClient((state) => state.upsertMember);
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);

  const [nick, setNick] = useState(member?.nick ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await guildApi.setNickname(
        getRest(),
        guildId,
        userId,
        nick.trim() || null,
        "Nickname changed from DiscordBotClient",
      );
      upsertMember(guildId, saved);
      toast(nick.trim() ? `Nickname set to ${nick.trim()}.` : "Nickname cleared.");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Change nickname"
      subtitle={member ? `@${member.user?.username ?? userId}` : userId}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void save()}
          confirmLabel="Save"
          busy={busy}
        />
      }
    >
      <Field label="Nickname" htmlFor="member-nick" hint="Leave empty to fall back to their name.">
        <input
          id="member-nick"
          value={nick}
          maxLength={32}
          onChange={(event) => setNick(event.target.value)}
          placeholder={member?.user?.global_name ?? member?.user?.username ?? ""}
          className={inputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** Timeout lengths Discord itself offers, in seconds. */
const TIMEOUTS: Array<{ label: string; seconds: number }> = [
  { label: "60 seconds", seconds: 60 },
  { label: "5 minutes", seconds: 5 * 60 },
  { label: "10 minutes", seconds: 10 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "1 week", seconds: 7 * 24 * 60 * 60 },
];

const BAN_HISTORY: Array<{ label: string; seconds: number }> = [
  { label: "Don't delete any", seconds: 0 },
  { label: "Previous hour", seconds: 60 * 60 },
  { label: "Previous 6 hours", seconds: 6 * 60 * 60 },
  { label: "Previous 12 hours", seconds: 12 * 60 * 60 },
  { label: "Previous 24 hours", seconds: 24 * 60 * 60 },
  { label: "Previous 3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "Previous 7 days", seconds: 7 * 24 * 60 * 60 },
];

/** Kick, ban and timeout share one dialog: a reason, an option, a red button. */
export function ModerationDialog({
  guildId,
  userId,
  action,
  onClose,
}: {
  guildId: string;
  userId: string;
  action: "kick" | "ban" | "timeout";
  onClose: () => void;
}) {
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const getRest = useClient((state) => state.getRest);
  const upsertMember = useClient((state) => state.upsertMember);
  const toast = useUI((state) => state.toast);

  /** Evaluated once per mount: only used to tell a live timeout from a past one. */
  const [mountedAt] = useState(() => Date.now());
  const timedOut =
    member?.communication_disabled_until != null &&
    Date.parse(member.communication_disabled_until) > mountedAt;

  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState(action === "ban" ? 0 : 10 * 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = member ? displayName(member) : userId;
  const title =
    action === "kick"
      ? `Kick ${name}`
      : action === "ban"
        ? `Ban ${name}`
        : timedOut
          ? `Timeout for ${name}`
          : `Time out ${name}`;

  async function run() {
    setBusy(true);
    setError(null);
    const note = reason.trim() || undefined;
    try {
      if (action === "kick") {
        await guildApi.kickMember(getRest(), guildId, userId, note);
        toast(`${name} was kicked.`);
      } else if (action === "ban") {
        await guildApi.banMember(getRest(), guildId, userId, { deleteMessageSeconds: seconds }, note);
        toast(`${name} was banned.`);
      } else {
        const until = new Date(Date.now() + seconds * 1000).toISOString();
        const saved = await guildApi.timeoutMember(getRest(), guildId, userId, until, note);
        upsertMember(guildId, saved);
        toast(`${name} is timed out.`);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the action.");
      setBusy(false);
    }
  }

  async function liftTimeout() {
    setBusy(true);
    setError(null);
    try {
      const saved = await guildApi.timeoutMember(
        getRest(),
        guildId,
        userId,
        null,
        reason.trim() || undefined,
      );
      upsertMember(guildId, saved);
      toast(`Timeout lifted for ${name}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the action.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      subtitle={member?.user ? `@${member.user.username}` : undefined}
      onClose={onClose}
      footer={
        <>
          {action === "timeout" && timedOut && (
            <button
              type="button"
              onClick={() => void liftTimeout()}
              disabled={busy}
              className="mr-auto rounded px-3 py-2 text-sm font-medium text-text transition-colors hover:underline disabled:opacity-50"
            >
              Remove timeout
            </button>
          )}
          <ModalActions
            onCancel={onClose}
            onConfirm={() => void run()}
            confirmLabel={action === "kick" ? "Kick" : action === "ban" ? "Ban" : "Time out"}
            busy={busy}
            danger={action !== "timeout"}
          />
        </>
      }
    >
      <p className="mb-4 text-sm leading-relaxed text-text">
        {action === "kick" &&
          `${name} is removed from the server but can join again with a new invite.`}
        {action === "ban" && `${name} is removed and blocked from joining again.`}
        {action === "timeout" &&
          `${name} cannot send messages, react or talk in voice until the timeout runs out.`}
      </p>

      {action === "timeout" && (
        <Field label="Duration" htmlFor="moderate-duration">
          <select
            id="moderate-duration"
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className={inputClass}
          >
            {TIMEOUTS.map((entry) => (
              <option key={entry.seconds} value={entry.seconds}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {action === "ban" && (
        <Field label="Delete recent messages" htmlFor="moderate-history">
          <select
            id="moderate-history"
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className={inputClass}
          >
            {BAN_HISTORY.map((entry) => (
              <option key={entry.seconds} value={entry.seconds}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Reason" htmlFor="moderate-reason" hint="Shown in the server's audit log.">
        <input
          id="moderate-reason"
          value={reason}
          maxLength={512}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
