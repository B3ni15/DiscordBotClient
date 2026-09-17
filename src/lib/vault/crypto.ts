/**
 * The cryptography behind the synced vault.
 *
 * One random AES-GCM key — the vault key — encrypts everything this app stores
 * on a server: bot tokens, remembered DMs, preferences. That key is generated
 * in the browser and never leaves it. What the server holds is the key itself
 * encrypted ("wrapped") by something only you can reproduce: a passkey's PRF
 * output, a recovery code, or a passphrase.
 *
 * The consequence is the point: with the database in hand and no passkey, the
 * rows are noise.
 */

const AES = "AES-GCM";
const IV_BYTES = 12;
/** OWASP's floor for PBKDF2-HMAC-SHA256 at the time of writing. */
export const PBKDF2_ITERATIONS = 600_000;

/** Byte arrays backed by a plain ArrayBuffer, which is what Web Crypto takes. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

export function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** A fresh vault key. Extractable, because every wrapper holds a copy of it. */
export function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES, length: 256 }, true, ["encrypt", "decrypt"]);
}

async function importAesKey(raw: ArrayBuffer | Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: AES }, true, ["encrypt", "decrypt"]);
}

/** iv ‖ ciphertext, base64url. The iv is fresh for every single encryption. */
export async function encrypt(key: CryptoKey, plaintext: Bytes): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: AES, iv }, key, plaintext);
  const packed = new Uint8Array(new ArrayBuffer(iv.length + ciphertext.byteLength));
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(packed);
}

export async function decrypt(key: CryptoKey, packed: string): Promise<Bytes> {
  const bytes = fromBase64Url(packed);
  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: AES, iv }, key, ciphertext);
  return new Uint8Array(plaintext) as Bytes;
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return encrypt(key, new TextEncoder().encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, packed: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decrypt(key, packed))) as T;
}

/** Wraps the vault key with a key derived from a passkey, code or passphrase. */
export async function wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", vaultKey);
  return encrypt(wrappingKey, new Uint8Array(raw));
}

export async function unwrapVaultKey(wrapped: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const raw = await decrypt(wrappingKey, wrapped);
  return importAesKey(raw);
}

/**
 * A wrapping key from a passkey's PRF output. The output is already 32 bytes of
 * high-entropy secret, so it only needs spreading with HKDF rather than a slow
 * password KDF.
 */
export async function keyFromPrf(secret: ArrayBuffer, salt: Bytes): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("disbotclient/vault"),
    },
    material,
    { name: AES, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A wrapping key from something a person types: slow on purpose. */
export async function keyFromSecretText(
  text: string,
  salt: Bytes,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(text.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: AES, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * A stable, opaque handle for one record.
 *
 * Two browsers holding the same vault key produce the same handle for the same
 * record, so they agree on which row to overwrite; the server, holding neither,
 * cannot turn a handle back into a bot id or a user id.
 */
export async function itemRef(vaultKey: CryptoKey, kind: string, id: string): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", vaultKey);
  const material = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(new ArrayBuffer(0)),
      info: new TextEncoder().encode("disbotclient/ref"),
    },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(`${kind}:${id}`),
  );
  return toBase64Url(signature).slice(0, 32);
}

/** Crockford base32 without the ambiguous letters, in groups of four. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A printable recovery code: 24 characters, 120 bits, the one thing to write down. */
export function generateRecoveryCode(): string {
  const bytes: Bytes = randomBytes(24);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

/** Codes are compared without their dashes, spaces or case. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}
