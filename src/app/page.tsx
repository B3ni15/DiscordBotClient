"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { TokenGate } from "@/components/TokenGate";
import { useClient } from "@/lib/store/client";

export default function Home() {
  const token = useClient((state) => state.token);
  const restore = useClient((state) => state.restore);

  // Reconnect with the token kept in this browser, if there is one.
  useEffect(() => {
    restore();
  }, [restore]);

  return token ? <AppShell /> : <TokenGate />;
}
