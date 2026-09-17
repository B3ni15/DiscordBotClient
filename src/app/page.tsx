"use client";

import { useEffect } from "react";
import { AccountDialogs } from "@/components/account/AccountDialogs";
import { AppShell } from "@/components/AppShell";
import { TokenGate } from "@/components/TokenGate";
import { Toasts } from "@/components/ui/Toasts";
import { useAccount } from "@/lib/store/account";
import { useClient } from "@/lib/store/client";

export default function Home() {
  const token = useClient((state) => state.token);
  const restore = useClient((state) => state.restore);
  const refreshAccount = useAccount((state) => state.refresh);

  // Reconnect with the token kept in this browser, if there is one.
  useEffect(() => {
    restore();
  }, [restore]);

  // And find out whether this deployment has an account waiting for us.
  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  return (
    <>
      {token ? <AppShell /> : <TokenGate />}
      {/* Both the client and the sign-in screen need these. */}
      <AccountDialogs />
      <Toasts />
    </>
  );
}
