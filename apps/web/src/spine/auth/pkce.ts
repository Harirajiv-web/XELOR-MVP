/**
 * PKCE — Proof Key for Code Exchange (RFC 7636).
 *
 * Why this and not the simpler password grant, which the realm also allows: a password
 * grant means this application receives the user's password, which forecloses single
 * sign-on and multi-factor authentication permanently, and puts a credential in the
 * browser's memory that never needed to be there. The realm already permits the standard
 * flow, so taking the shortcut would only have to be undone later.
 *
 * The mechanism is small. Before redirecting we invent a random secret (the VERIFIER),
 * send only its SHA-256 hash (the CHALLENGE) to the authorisation endpoint, and present
 * the verifier when redeeming the code. An attacker who intercepts the authorisation code
 * — from a browser history, a referrer header, a shared machine — cannot exchange it,
 * because they never saw the verifier.
 */

const VERIFIER_KEY = "aikyantra.pkce.verifier";
const STATE_KEY = "aikyantra.pkce.state";
const RETURN_KEY = "aikyantra.pkce.return";

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength = 48): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

export interface PkceStart {
  verifier: string;
  challenge: string;
  state: string;
}

export async function beginPkce(returnTo: string): Promise<PkceStart> {
  const verifier = randomString();
  const state = randomString(16);
  const challenge = base64Url(await sha256(verifier));

  // sessionStorage, not localStorage: the verifier is worthless after this one exchange,
  // and it should not outlive the tab that created it.
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, returnTo);

  return { verifier, challenge, state };
}

export interface PkceFinish {
  verifier: string;
  returnTo: string;
}

/**
 * Redeem the stashed verifier, checking `state` first.
 *
 * The state check is not ceremony: without it, an attacker can hand a victim a link
 * carrying THEIR authorisation code, and the victim's browser silently logs in as the
 * attacker — after which everything the victim types goes into the attacker's account.
 * A mismatch is a hard failure, never a warning.
 */
export function finishPkce(returnedState: string | null): PkceFinish {
  const expected = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const returnTo = sessionStorage.getItem(RETURN_KEY) ?? "/";

  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_KEY);

  if (!expected || !returnedState || expected !== returnedState) {
    throw new Error("Sign-in could not be verified. Please try again.");
  }
  if (!verifier) {
    throw new Error("Sign-in state was lost. Please try again.");
  }
  return { verifier, returnTo };
}
