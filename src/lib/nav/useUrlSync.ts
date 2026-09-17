"use client";

import { useEffect, useRef } from "react";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { buildPath, parsePath } from "./urlSync";

/**
 * Keeps the address bar in sync with whatever guild, DM or channel is
 * actually open — the way Discord's own web client does — instead of
 * leaving every page view sitting on "/". This is also what lets a shared
 * or reloaded URL drop you back into the same channel, and what makes
 * page-view analytics show something more useful than the app's shell.
 */
export function useUrlSync() {
  const status = useClient((state) => state.status);
  const guildOrder = useClient((state) => state.guildOrder);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectGuild = useClient((state) => state.selectGuild);
  const selectChannel = useClient((state) => state.selectChannel);
  const dmMode = useUI((state) => state.dmMode);
  const setDmMode = useUI((state) => state.setDmMode);

  const appliedInitialRoute = useRef(false);

  // Deep-link: once the guild list has (at least started to) load, apply
  // whatever the URL asked for. Guilds trickle in one GUILD_CREATE at a
  // time, so this keeps retrying until the target guild shows up, and gives
  // up after a few seconds for a stale/invalid link.
  useEffect(() => {
    if (appliedInitialRoute.current || status !== "ready") return;

    const route = parsePath(window.location.pathname);

    const apply = () => {
      appliedInitialRoute.current = true;
      if (route.dmMode) {
        setDmMode(true);
        if (route.channelId) void selectChannel(route.channelId);
      } else if (route.guildId) {
        setDmMode(false);
        selectGuild(route.guildId);
        if (route.channelId) void selectChannel(route.channelId);
      }
    };

    if (!route.guildId && !route.dmMode) {
      appliedInitialRoute.current = true;
      return;
    }
    if (route.dmMode || guildOrder.includes(route.guildId!)) {
      apply();
      return;
    }
    const giveUp = setTimeout(() => {
      appliedInitialRoute.current = true;
    }, 5000);
    return () => clearTimeout(giveUp);
  }, [status, guildOrder, setDmMode, selectGuild, selectChannel]);

  // Reflect the current selection into the URL once it's settled.
  useEffect(() => {
    if (!appliedInitialRoute.current) return;
    const path = buildPath({ dmMode, guildId: selectedGuildId, channelId: selectedChannelId });
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, [dmMode, selectedGuildId, selectedChannelId]);

  // Back/forward navigation between channels.
  useEffect(() => {
    function onPopState() {
      const route = parsePath(window.location.pathname);
      if (route.dmMode) {
        setDmMode(true);
        if (route.channelId) void selectChannel(route.channelId);
      } else if (route.guildId) {
        setDmMode(false);
        selectGuild(route.guildId);
        if (route.channelId) void selectChannel(route.channelId);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setDmMode, selectGuild, selectChannel]);
}
