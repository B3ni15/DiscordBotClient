"use client";

import { userAvatarUrl } from "@/lib/discord/cdn";
import { useAccount, type SavedBot } from "@/lib/store/account";
import { useClient } from "@/lib/store/client";
import { useContextMenu, separator, type MenuItem } from "@/lib/store/contextMenu";
import { useUI } from "@/lib/store/ui";

/**
 * The bot the client is signed in as, and a way to become another one.
 *
 * The saved bots come from the encrypted vault, so the list is only as long as
 * what this account has stored — with no account it holds just the current bot
 * plus a way to sign in as a different one.
 */
export function useBotSwitcherMenu() {
  const status = useAccount((state) => state.status);
  const bots = useAccount((state) => state.bots);
  const removeBot = useAccount((state) => state.removeBot);
  const currentId = useClient((state) => state.user?.id);
  const login = useClient((state) => state.login);
  const logout = useClient((state) => state.logout);
  const openDialog = useUI((state) => state.openDialog);
  const toast = useUI((state) => state.toast);
  const open = useContextMenu((state) => state.open);

  return (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const items: MenuItem[] = [];

    if (status === "unlocked" && bots.length > 0) {
      items.push({ type: "heading", id: "bots", label: "Bots" });
      for (const bot of bots) {
        items.push(botItem(bot, bot.id === currentId, login, removeBot, toast));
      }
      items.push(separator("s1"));
    }

    items.push({
      type: "item",
      id: "add",
      label: "Add another bot",
      icon: "＋",
      onSelect: () => openDialog({ kind: "addBot" }),
    });

    if (status === "signedOut" || status === "unavailable") {
      items.push({
        type: "item",
        id: "sync",
        label: status === "signedOut" ? "Sign in with Discord" : "Sync unavailable here",
        icon: "🔗",
        disabled: status === "unavailable",
        reason: "This deployment has no account service.",
        /*
         * A full navigation on purpose: this endpoint does not render a page,
         * it answers with a redirect to Discord's own sign-in.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        onSelect: () => window.location.assign("/api/auth/discord"),
      });
    }
    if (status === "needsSetup") {
      items.push({
        type: "item",
        id: "setup",
        label: "Turn on sync",
        icon: "🔗",
        onSelect: () => openDialog({ kind: "accountSetup" }),
      });
    }
    if (status === "locked") {
      items.push({
        type: "item",
        id: "unlock",
        label: "Unlock your vault",
        icon: "🔑",
        onSelect: () => openDialog({ kind: "accountUnlock" }),
      });
    }
    if (status === "unlocked") {
      items.push({
        type: "item",
        id: "security",
        label: "Passkeys and recovery",
        icon: "🔑",
        onSelect: () => openDialog({ kind: "accountSecurity" }),
      });
    }

    items.push(separator("s2"), {
      type: "item",
      id: "signout",
      label: "Sign out of this bot",
      icon: "⏻",
      danger: true,
      onSelect: logout,
    });

    open(event.clientX, event.clientY, "Bots", items);
  };
}

function botItem(
  bot: SavedBot,
  active: boolean,
  login: (token: string) => Promise<void>,
  removeBot: (id: string) => Promise<void>,
  toast: (text: string, tone?: "info" | "error") => void,
): MenuItem {
  return {
    type: "submenu",
    id: bot.id,
    label: `${active ? "● " : ""}${bot.name}`,
    icon: "🤖",
    items: [
      {
        type: "item",
        id: "switch",
        label: active ? "Already signed in" : "Switch to this bot",
        icon: "→",
        disabled: active,
        onSelect: () => {
          void login(bot.token).then(() => toast(`Signed in as ${bot.name}.`));
        },
      },
      {
        type: "item",
        id: "forget",
        label: "Forget this bot",
        icon: "🗑",
        danger: true,
        onSelect: () => {
          void removeBot(bot.id).then(() => toast(`${bot.name} removed from the vault.`));
        },
      },
    ],
  };
}

/** Avatar of a saved bot, falling back to its initial. */
export function BotAvatar({ bot, size = 24 }: { bot: SavedBot; size?: number }) {
  const url = userAvatarUrl(
    { id: bot.id, avatar: bot.avatar, discriminator: bot.discriminator ?? "0" },
    64,
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
