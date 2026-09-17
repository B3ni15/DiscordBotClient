"use client";

/** Thin client for the account and vault endpoints. Everything here is ciphertext. */

export interface AccountUser {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface WrapperSummary {
  id: string;
  kind: "passkey" | "recovery" | "passphrase";
  label: string;
  credentialId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface StoredWrapper extends WrapperSummary {
  salt: string;
  wrapped: string;
  params: { iterations?: number } | null;
}

export interface SessionInfo {
  available: boolean;
  user: AccountUser | null;
  wrappers: WrapperSummary[];
}

export interface VaultRecord {
  kind: "bot" | "dm" | "settings";
  ref: string;
  ciphertext: string;
  updatedAt: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export const vaultApi = {
  session: () => request<SessionInfo>("/api/auth/session"),

  signOut: () => request<{ ok: true }>("/api/auth/session", { method: "DELETE" }),

  deleteAccount: () => request<{ ok: true }>("/api/account", { method: "DELETE" }),

  wrappers: () => request<{ wrappers: StoredWrapper[] }>("/api/vault/wrappers"),

  addWrapper: (wrapper: {
    kind: WrapperSummary["kind"];
    label: string;
    credentialId?: string | null;
    salt: string;
    wrapped: string;
    params?: unknown;
  }) =>
    request<WrapperSummary>("/api/vault/wrappers", {
      method: "POST",
      body: JSON.stringify(wrapper),
    }),

  removeWrapper: (id: string) =>
    request<{ ok: true }>(`/api/vault/wrappers/${id}`, { method: "DELETE" }),

  touchWrapper: (id: string) =>
    request<{ ok: true }>(`/api/vault/wrappers/${id}`, { method: "PATCH" }).catch(() => undefined),

  items: () => request<{ items: VaultRecord[] }>("/api/vault/items"),

  putItems: (items: Array<{ kind: string; ref: string; ciphertext: string }>) =>
    request<{ ok: true; written: number }>("/api/vault/items", {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  removeItems: (kind: string, refs?: string[]) =>
    request<{ ok: true; removed: number }>("/api/vault/items", {
      method: "DELETE",
      body: JSON.stringify({ kind, refs }),
    }),
};
