"use client";

import { fromBase64Url, randomBytes, toBase64Url, type Bytes } from "./crypto";

/**
 * Passkeys as the key to the vault, through WebAuthn's PRF extension.
 *
 * PRF asks the authenticator for a secret that is derived from the credential
 * and a salt we choose: the same passkey and the same salt always give the same
 * 32 bytes, and nothing else can produce them. That secret never leaves the
 * browser, so it makes a perfect key-encryption key.
 *
 * The passkey is not used to prove who you are — the Discord session already
 * does that — so there is no assertion for a server to verify here, and no
 * WebAuthn library on the server side. It exists purely to hold a key.
 */

export class PasskeyError extends Error {
  constructor(
    message: string,
    /** True when the browser or authenticator simply cannot do PRF. */
    readonly unsupported = false,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

export function passkeysAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Whether this device has a built-in authenticator (Touch ID, Windows Hello). */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeysAvailable()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface NewPasskey {
  credentialId: string;
  salt: string;
  secret: ArrayBuffer;
  label: string;
}

/**
 * Creates a passkey for this account and returns the PRF secret behind it.
 *
 * Authenticators do not hand out the PRF result while the credential is being
 * created, so this registers the passkey and then immediately uses it once.
 */
export async function createPasskey(user: {
  id: string;
  name: string;
  displayName: string;
}): Promise<NewPasskey> {
  if (!passkeysAvailable()) {
    throw new PasskeyError("This browser does not support passkeys.", true);
  }

  const salt = randomBytes(32);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "disbotclient", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.name,
          displayName: user.displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        timeout: 120_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (cause) {
    throw new PasskeyError(describe(cause, "The passkey was not created."));
  }

  if (!credential) throw new PasskeyError("The passkey was not created.");

  const extensions = credential.getClientExtensionResults();
  if (!extensions.prf?.enabled) {
    throw new PasskeyError(
      "This passkey cannot hold an encryption key: the authenticator does not support the PRF extension. " +
        "Try a different device or use the recovery code instead.",
      true,
    );
  }

  const credentialId = toBase64Url(credential.rawId);
  // Using it straight away is what actually yields the secret.
  const secret = await evaluatePrf(credentialId, salt);

  return {
    credentialId,
    salt: toBase64Url(salt),
    secret,
    label: defaultLabel(),
  };
}

/** Asks an existing passkey for its PRF secret. */
export async function evaluatePrf(
  credentialId: string,
  salt: Bytes | string,
): Promise<ArrayBuffer> {
  const saltBytes = typeof salt === "string" ? fromBase64Url(salt) : salt;

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
        userVerification: "preferred",
        timeout: 120_000,
        extensions: { prf: { eval: { first: saltBytes } } },
      },
    })) as PublicKeyCredential | null;
  } catch (cause) {
    throw new PasskeyError(describe(cause, "The passkey was not used."));
  }

  if (!assertion) throw new PasskeyError("The passkey was not used.");
  const result = assertion.getClientExtensionResults().prf?.results?.first;
  if (!result) {
    throw new PasskeyError(
      "This passkey did not return an encryption key. Unlock with your recovery code instead.",
      true,
    );
  }
  if (result instanceof ArrayBuffer) return result;
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}

/** Something recognisable in the list of unlock methods. */
function defaultLabel(): string {
  const agent = navigator.userAgent;
  if (/iPhone|iPad/.test(agent)) return "iPhone or iPad";
  if (/Android/.test(agent)) return "Android device";
  if (/Macintosh/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows device";
  if (/Linux/.test(agent)) return "Linux device";
  return "This device";
}

function describe(cause: unknown, fallback: string): string {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError") return "The passkey prompt was dismissed.";
    if (cause.name === "InvalidStateError") return "This device already has a passkey for this account.";
    if (cause.name === "SecurityError") {
      return "Passkeys need a secure origin (https, or localhost during development).";
    }
    return cause.message || fallback;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
