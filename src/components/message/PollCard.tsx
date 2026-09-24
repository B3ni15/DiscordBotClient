"use client";

import { useEffect, useState } from "react";
import type { APIMessage, APIPoll, APIPollMedia, APIUser } from "discord-api-types/v10";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/discord/api";
import { emojiUrl, userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** Discord's poll block: question, one bar per answer, the tally and the timer. */
export function PollCard({ message, poll }: { message: APIMessage; poll: APIPoll }) {
  const selfId = useClient((state) => state.user?.id);
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const now = useNow();
  const [ending, setEnding] = useState(false);
  const [votersFor, setVotersFor] = useState<number | null>(null);

  const expiresAt = poll.expiry ? Date.parse(poll.expiry) : null;
  const closed = poll.results?.is_finalized === true || (expiresAt !== null && expiresAt <= now);
  const counts = new Map(poll.results?.answer_counts.map((entry) => [entry.id, entry]) ?? []);
  const total = poll.answers.reduce((sum, answer) => sum + (counts.get(answer.answer_id)?.count ?? 0), 0);
  const top = Math.max(0, ...poll.answers.map((answer) => counts.get(answer.answer_id)?.count ?? 0));

  async function endPoll() {
    setEnding(true);
    try {
      await api.endPoll(getRest(), message.channel_id, message.id);
      // The closed poll comes back as MESSAGE_UPDATE.
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "The poll could not be ended.", "error");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="mt-1 w-full max-w-md rounded-lg border border-line bg-panel p-4">
      <p className="text-base leading-snug font-semibold break-words text-bright">
        <PollMediaText media={poll.question} />
      </p>
      <p className="mt-1 text-xs text-muted">
        {poll.allow_multiselect ? "Select one or more answers" : "Select one answer"}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {poll.answers.map((answer) => {
          const entry = counts.get(answer.answer_id);
          const count = entry?.count ?? 0;
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          const winner = closed && count > 0 && count === top;
          return (
            <li key={answer.answer_id}>
              <button
                type="button"
                onClick={() => setVotersFor(answer.answer_id)}
                title="Show who voted for this"
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-hover ${
                  winner ? "border-online" : entry?.me_voted ? "border-accent" : "border-line"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${
                    winner ? "bg-online/25" : "bg-accent/20"
                  }`}
                  style={{ width: `${percent}%` }}
                />
                <span className="relative min-w-0 flex-1 break-words text-text">
                  <PollMediaText media={answer.poll_media} />
                </span>
                {winner && (
                  <span aria-label="Winning answer" className="relative text-xs">
                    ✔
                  </span>
                )}
                <span className="relative shrink-0 text-xs font-semibold text-muted tabular-nums">
                  {count} · {percent}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
        <span aria-hidden>·</span>
        <span>{closed ? "Poll closed" : expiresAt ? timeLeft(expiresAt - now) : "No end date"}</span>
        {!closed && poll.results && !poll.results.is_finalized && (
          <span className="text-faint">(live count)</span>
        )}
        {!closed && message.author.id === selfId && (
          <button
            type="button"
            onClick={() => void endPoll()}
            disabled={ending}
            className="ml-auto rounded px-2 py-1 font-medium text-text transition-colors hover:bg-hover disabled:opacity-60"
          >
            {ending ? "Ending…" : "End poll now"}
          </button>
        )}
      </div>

      {votersFor !== null && (
        <PollVoters
          message={message}
          poll={poll}
          answerId={votersFor}
          onSelect={setVotersFor}
          onClose={() => setVotersFor(null)}
        />
      )}
    </div>
  );
}

/** The "Poll has closed" system line Discord posts under a finished poll. */
export function PollResultNotice({ message }: { message: APIMessage }) {
  const fields = new Map(
    message.embeds
      ?.find((embed) => embed.type === "poll_result")
      ?.fields?.map((field) => [field.name, field.value]) ?? [],
  );
  const question = fields.get("poll_question_text") ?? "A poll";
  const winner = fields.get("victor_answer_text");
  const winnerVotes = Number(fields.get("victor_answer_votes") ?? 0);
  const total = Number(fields.get("total_votes") ?? 0);
  const emojiId = fields.get("victor_answer_emoji_id");
  const emojiName = fields.get("victor_answer_emoji_name");

  return (
    <p className="flex flex-wrap items-center gap-1 text-sm text-muted">
      <span aria-hidden>📊</span>
      <span>
        The poll <span className="font-semibold text-bright">{question}</span> has closed.
      </span>
      {winner || emojiName ? (
        <span>
          Winner:{" "}
          <span className="font-semibold text-bright">
            <PollMediaText
              media={{
                text: winner,
                emoji: emojiName || emojiId ? { id: emojiId ?? null, name: emojiName ?? null } : undefined,
              }}
            />
          </span>{" "}
          ({winnerVotes}/{total} {total === 1 ? "vote" : "votes"}
          {total > 0 ? `, ${Math.round((winnerVotes / total) * 100)}%` : ""})
        </span>
      ) : (
        <span>{total === 0 ? "Nobody voted." : "It ended in a tie."}</span>
      )}
    </p>
  );
}

function PollMediaText({ media }: { media: APIPollMedia }) {
  const emoji = media.emoji;
  return (
    <>
      {emoji?.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={emojiUrl(emoji.id, emoji.animated ?? false, 32)}
          alt={`:${emoji.name ?? "emoji"}:`}
          className="mr-1 inline h-[1.2em] w-[1.2em] align-[-0.2em]"
        />
      ) : emoji?.name ? (
        <span className="mr-1">{emoji.name}</span>
      ) : null}
      {media.text}
    </>
  );
}

function PollVoters({
  message,
  poll,
  answerId,
  onSelect,
  onClose,
}: {
  message: APIMessage;
  poll: APIPoll;
  answerId: number;
  onSelect: (answerId: number) => void;
  onClose: () => void;
}) {
  const getRest = useClient((state) => state.getRest);
  const [voters, setVoters] = useState<{ answerId: number; users: APIUser[] } | null>(null);
  const [error, setError] = useState<{ answerId: number; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .pollVoters(getRest(), message.channel_id, message.id, answerId)
      .then((result) => {
        if (!cancelled) setVoters({ answerId, users: result.users });
      })
      .catch((cause) => {
        if (!cancelled) {
          setError({
            answerId,
            text: cause instanceof Error ? cause.message : "The voters could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getRest, message.channel_id, message.id, answerId]);

  const users = voters?.answerId === answerId ? voters.users : null;
  const failure = error?.answerId === answerId ? error.text : null;

  return (
    <Modal title="Poll votes" subtitle={poll.question.text} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {poll.answers.map((answer) => (
          <button
            key={answer.answer_id}
            type="button"
            onClick={() => onSelect(answer.answer_id)}
            aria-pressed={answer.answer_id === answerId}
            className={`max-w-full truncate rounded px-2.5 py-1 text-xs transition-colors ${
              answer.answer_id === answerId
                ? "bg-accent text-white"
                : "bg-panel-alt text-text hover:bg-hover"
            }`}
          >
            <PollMediaText media={answer.poll_media} />
          </button>
        ))}
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : users === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner size={14} /> Loading voters…
        </p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">Nobody picked this answer yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={userAvatarUrl(user, 32)} alt="" className="h-6 w-6 rounded-full" />
              <span className="truncate text-bright">{user.global_name ?? user.username}</span>
              <span className="truncate text-xs text-faint">{user.username}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Re-renders every half minute so the countdown and the closed state stay current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}
