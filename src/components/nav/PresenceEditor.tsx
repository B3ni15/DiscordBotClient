"use client";

import { useState } from "react";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  ACTIVITY_TYPES,
  STATUS_OPTIONS,
  type SelfPresence,
  type SelfStatus,
} from "@/lib/discord/selfPresence";
import { useClient } from "@/lib/store/client";

/** A status needs no activity text; an activity does. */
function isDirty(a: SelfPresence, b: SelfPresence) {
  return (
    a.status !== b.status ||
    a.activityType !== b.activityType ||
    a.activityName !== b.activityName ||
    a.streamUrl !== b.streamUrl ||
    a.afk !== b.afk ||
    a.mobile !== b.mobile
  );
}

/**
 * Sets the presence the bot shows to everyone else: the status dot, whatever it
 * is "playing", and whether Discord marks it as being on a phone.
 */
export function PresenceEditor() {
  const saved = useClient((state) => state.selfPresence);
  const setSelfPresence = useClient((state) => state.setSelfPresence);
  const connected = useClient((state) => state.status === "ready");

  const [draft, setDraft] = useState<SelfPresence>(saved);
  const [justSaved, setJustSaved] = useState(false);

  // A presence changed in another tab, or loaded after sign-in, wins over an
  // untouched form.
  const [lastSaved, setLastSaved] = useState(saved);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    if (!isDirty(draft, lastSaved)) setDraft(saved);
  }

  const dirty = isDirty(draft, saved);
  const needsText = draft.activityType !== null && !draft.activityName.trim();

  function patch(next: Partial<SelfPresence>) {
    setDraft((current) => ({ ...current, ...next }));
    setJustSaved(false);
  }

  function apply() {
    setSelfPresence({ ...draft, activityName: draft.activityName.trim() });
    setJustSaved(true);
  }

  return (
    <section className="mb-6">
      <h3 className="pb-2 text-xs font-bold tracking-wide text-muted uppercase">Presence</h3>

      <fieldset className="mb-3">
        <legend className="sr-only">Status</legend>
        <div className="flex flex-col gap-1">
          {STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors ${
                draft.status === option.value ? "bg-raised" : "hover:bg-hover"
              }`}
            >
              <input
                type="radio"
                name="self-status"
                value={option.value}
                checked={draft.status === option.value}
                onChange={() => patch({ status: option.value as SelfStatus })}
                className="sr-only"
              />
              <StatusDot
                status={option.value === "invisible" ? "offline" : option.value}
                size={12}
                ringClassName="bg-transparent"
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm text-text">{option.label}</span>
                <span className="block text-[11px] text-muted">{option.note}</span>
              </span>
              {draft.status === option.value && (
                <span aria-hidden className="text-xs text-accent">
                  ●
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-[11px] font-bold tracking-wide text-muted uppercase">
        Activity
        <select
          value={draft.activityType ?? ""}
          onChange={(event) =>
            patch({ activityType: event.target.value === "" ? null : Number(event.target.value) })
          }
          className="mt-1 w-full rounded bg-ink px-2 py-1.5 text-sm font-normal tracking-normal text-text normal-case outline-none focus:shadow-[0_0_0_1px_var(--accent)]"
        >
          <option value="">No activity</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      {draft.activityType !== null && (
        <div className="mt-2 animate-fade-in">
          <input
            value={draft.activityName}
            onChange={(event) => patch({ activityName: event.target.value })}
            maxLength={128}
            placeholder={
              ACTIVITY_TYPES.find((type) => type.value === draft.activityType)?.hint ?? "Text"
            }
            aria-label="Activity text"
            className="w-full rounded bg-ink px-2 py-1.5 text-sm text-text outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
          />
          {draft.activityType === 1 && (
            <input
              value={draft.streamUrl}
              onChange={(event) => patch({ streamUrl: event.target.value })}
              placeholder="https://twitch.tv/…"
              aria-label="Stream link"
              className="mt-2 w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-text outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
            />
          )}
          {draft.activityType === 1 && !draft.streamUrl.trim() && (
            <p className="mt-1 text-[11px] text-muted">
              Without a Twitch or YouTube link Discord shows this as Playing, not Streaming.
            </p>
          )}
        </div>
      )}

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-hover">
        <input
          type="checkbox"
          checked={draft.mobile}
          onChange={(event) => patch({ mobile: event.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm text-text">Show as on mobile</span>
          <span className="block text-[11px] text-muted">
            Puts the phone icon on the status dot. Reconnects the gateway, because Discord reads
            the device from the handshake, and the icon only appears while the bot is not
            invisible.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-hover">
        <input
          type="checkbox"
          checked={draft.afk}
          onChange={(event) => patch({ afk: event.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm text-text">Mark as AFK</span>
          <span className="block text-[11px] text-muted">
            Tells Discord the session is idle by inactivity rather than by choice.
          </span>
        </span>
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={!dirty || needsText}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Apply
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(saved);
              setJustSaved(false);
            }}
            className="rounded px-2 py-1.5 text-xs text-muted transition-colors hover:text-bright"
          >
            Reset
          </button>
        )}
        {justSaved && !dirty && (
          <span className="animate-fade-in text-xs text-online">Presence updated.</span>
        )}
      </div>

      {needsText && (
        <p className="mt-2 text-[11px] text-amber">
          Add the activity text, or pick “No activity”.
        </p>
      )}
      {!connected && (
        <p className="mt-2 text-[11px] text-muted">
          Saved now and published as soon as the gateway connects.
        </p>
      )}
    </section>
  );
}
