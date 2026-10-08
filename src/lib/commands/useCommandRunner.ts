"use client";

import { useEffect } from "react";
import {
  ApplicationCommandType,
  InteractionType,
  type APIInteraction,
} from "discord-api-types/v10";
import { useClient } from "@/lib/store/client";
import { runCommandScript } from "./runner";
import { getScript } from "./scriptStore";
import { recordInteraction } from "./useInteractions";

/**
 * Listens for INTERACTION_CREATE for the whole session: every interaction is
 * filed in the inbox, and a slash command with an enabled script is answered by
 * running it. Mounted once, by the app shell.
 */
export function useCommandRunner() {
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  useEffect(() => {
    const gateway = getGateway();
    if (!gateway) return;
    return gateway.on("dispatch", (event, data) => {
      if (event !== "INTERACTION_CREATE") return;
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
      if (!script?.enabled || !script.code.trim()) return;
      void runCommandScript({
        rest: getRest(),
        botId: user.id,
        name: script.name,
        code: script.code,
        interaction,
      });
    });
    // `status` is the signal that a gateway instance exists after a login.
  }, [getGateway, status]);
}
