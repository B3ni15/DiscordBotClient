"use client";

import { useEffect } from "react";
import {
  ApplicationCommandType,
  InteractionType,
  type APIInteraction,
} from "discord-api-types/v10";
import { subscribeDispatch } from "@/lib/notifications/dispatch";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";
import { claimInteraction } from "./claim";
import { runCommandScript } from "./runner";
import { getScript } from "./scriptStore";
import { patchInteraction, recordInteraction, snowflakeTimestamp } from "./useInteractions";

/**
 * An interaction this old is a replay — Discord re-sends what a resumed session
 * missed — and can no longer be answered. Generous on purpose, so a computer
 * clock that is somewhat off does not make fresh interactions look stale.
 */
const STALE_AFTER_MS = 15_000;

/**
 * How long a command without a script here is left for anything else that
 * answers for this bot (its own backend, say) before this client steps in.
 * Discord allows three seconds.
 */
const UNHANDLED_GRACE_MS = 1_800;
const EPHEMERAL = 1 << 6;

/**
 * A command with no script (or a switched-off one) still gets an answer, so
 * nobody ever sees "The application did not respond". If something else has
 * answered in the meantime, Discord refuses this one and nothing changes.
 */
function answerUnhandled(
  interaction: Extract<APIInteraction, { type: InteractionType.ApplicationCommand }>,
  reason: "off" | "missing",
  receivedAt: number,
) {
  if (receivedAt - snowflakeTimestamp(interaction.id) > STALE_AFTER_MS) return;
  const content =
    reason === "off"
      ? `\`/${interaction.data.name}\` is switched off right now.`
      : `\`/${interaction.data.name}\` is not set up yet.`;
  setTimeout(() => {
    void claimInteraction(interaction.id).then(async (mine) => {
      if (!mine) return;
      try {
        await commandApi.respond(useClient.getState().getRest(), interaction.id, interaction.token, {
          content,
          flags: EPHEMERAL,
        });
        patchInteraction(
          interaction.id,
          "answered",
          reason === "off" ? "Its script is switched off; told the user." : "No script; told the user.",
        );
      } catch {
        // Already answered elsewhere, or the token expired: nothing to add.
      }
    });
  }, UNHANDLED_GRACE_MS);
}

/**
 * Listens for INTERACTION_CREATE for the whole session: every interaction is
 * filed in the inbox, and a slash command with an enabled script is answered by
 * running it; one without gets a short private answer instead of silence.
 * Mounted once, by the app shell.
 */
export function useCommandRunner() {
  useEffect(
    () =>
      // Follows the gateway across logins and bot switches by itself.
      subscribeDispatch((event, data) => {
        if (event !== "INTERACTION_CREATE") return;
        const receivedAt = Date.now();
        const interaction = data as APIInteraction;
        if (interaction.type === InteractionType.Ping) return;
        recordInteraction(interaction);

        if (
          interaction.type !== InteractionType.ApplicationCommand ||
          interaction.data.type !== ApplicationCommandType.ChatInput
        ) {
          return;
        }
        const { user, getRest } = useClient.getState();
        if (!user) return;
        const script = getScript(user.id, interaction.data.name);
        if (!script?.enabled || !script.code.trim()) {
          answerUnhandled(interaction, script ? "off" : "missing", receivedAt);
          return;
        }

        if (receivedAt - snowflakeTimestamp(interaction.id) > STALE_AFTER_MS) {
          patchInteraction(
            interaction.id,
            "failed",
            "Arrived too late to answer (replayed after a reconnect); its script was not run.",
          );
          return;
        }

        void claimInteraction(interaction.id).then((mine) => {
          if (!mine) {
            patchInteraction(interaction.id, "answered", "Handled by the script in another tab.");
            return;
          }
          return runCommandScript({
            rest: getRest(),
            botId: user.id,
            name: script.name,
            code: script.code,
            interaction,
            receivedAt,
          });
        });
      }),
    [],
  );
}
