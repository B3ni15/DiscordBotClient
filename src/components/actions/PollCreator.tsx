"use client";

import { useState } from "react";
import { Field, Modal, ModalActions, Switch, inputClass } from "@/components/ui/Modal";
import { api } from "@/lib/discord/api";
import { useClient } from "@/lib/store/client";

const QUESTION_MAX = 300;
const ANSWER_MAX = 55;
const MAX_ANSWERS = 10;

/** The same choices Discord's own poll dialog offers, in hours. */
const DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 4, label: "4 hours" },
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
  { hours: 336, label: "2 weeks" },
];

/** Discord's "Create a poll" dialog: a question, 2–10 answers, a length and multi-select. */
export function PollCreator({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const getRest = useClient((state) => state.getRest);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [hours, setHours] = useState(24);
  const [multiselect, setMultiselect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = answers.map((answer) => answer.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 1;

  async function create() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendPoll(getRest(), channelId, {
        question: { text: question.trim() },
        answers: filled.map((text) => ({ poll_media: { text } })),
        duration: hours,
        allow_multiselect: multiselect,
      });
      // The poll message arrives over the gateway as MESSAGE_CREATE.
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The poll could not be sent.");
      setBusy(false);
    }
  }

  function setAnswer(index: number, value: string) {
    setAnswers((current) => {
      const next = current.map((answer, i) => (i === index ? value : answer));
      // Typing in the last box opens the next one, as Discord does.
      if (index === next.length - 1 && value && next.length < MAX_ANSWERS) next.push("");
      return next;
    });
  }

  return (
    <Modal
      title="Create a poll"
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void create()}
          confirmLabel="Post"
          busy={busy}
          disabled={!ready}
        />
      }
    >
      <Field label="Question" htmlFor="poll-question">
        <input
          id="poll-question"
          value={question}
          maxLength={QUESTION_MAX}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What question do you want to ask?"
          className={inputClass}
        />
      </Field>

      <Field label="Answers" hint="Empty answers are left out. Emoji can be typed straight in.">
        <ol className="flex flex-col gap-2">
          {answers.map((answer, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                value={answer}
                maxLength={ANSWER_MAX}
                onChange={(event) => setAnswer(index, event.target.value)}
                placeholder={`Answer ${index + 1}`}
                aria-label={`Answer ${index + 1}`}
                className={inputClass}
              />
              {answers.length > 2 && (
                <button
                  type="button"
                  onClick={() => setAnswers(answers.filter((_, i) => i !== index))}
                  aria-label={`Remove answer ${index + 1}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted transition-colors hover:text-danger"
                >
                  <span aria-hidden>✕</span>
                </button>
              )}
            </li>
          ))}
        </ol>
      </Field>

      <Field label="Duration" htmlFor="poll-duration">
        <select
          id="poll-duration"
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          className={inputClass}
        >
          {DURATIONS.map((duration) => (
            <option key={duration.hours} value={duration.hours}>
              {duration.label}
            </option>
          ))}
        </select>
      </Field>

      <Switch
        checked={multiselect}
        onChange={setMultiselect}
        label="Allow multiple answers"
        description="Voters may pick more than one answer."
      />

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
