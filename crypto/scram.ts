/**
 * The client side of the Salted Challenge Response Authentication Mechanism
 * (SCRAM), as used by SASL authentication in for example Postgres, MongoDB,
 * Kafka, IMAP and XMPP.
 *
 * The client does not support channel binding (the `-PLUS` mechanisms).
 *
 * @example
 * ```ts
 * import { ScramClient } from "@stdx/crypto/scram";
 *
 * const scram = new ScramClient({ hash: "SHA-256", user: "user", password: "pencil" });
 * // 1. Send `scram.mechanism` and `scram.clientFirst()` to the server
 * // 2. Send `await scram.clientFinal(serverFirst)` to the server
 * // 3. Verify the server with `await scram.verify(serverFinal)`
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc5802 | RFC 5802: SCRAM}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7677 | RFC 7677: SCRAM-SHA-256}
 *
 * @module
 */
import { timingSafeEqual } from "@std/crypto/timing-safe-equal";
import { hmac } from "./hmac.ts";

/**
 * The hash functions supported for SCRAM
 */
export type ScramHash = "SHA-1" | "SHA-256" | "SHA-512";

/**
 * Options for {@linkcode ScramClient}
 */
export interface ScramClientOptions {
  /**
   * The password. It is normalized with NFKC, which approximates the SASLprep
   * profile required by the specification for most passwords.
   */
  password: string;
  /**
   * The user name. Some protocols, such as Postgres, send the user name
   * separately and leave it empty here. Defaults to `""`.
   */
  user?: string;
  /**
   * The hash function. Defaults to `"SHA-256"`.
   */
  hash?: ScramHash;
  /**
   * The client nonce. Defaults to 18 random bytes in base64. Only set this
   * for testing.
   */
  nonce?: string;
}

/**
 * The error thrown when the server responds with an invalid or failed SCRAM
 * message.
 */
export class ScramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScramError";
  }
}

const encoder = new TextEncoder();

const KEY_LENGTHS: Record<ScramHash, number> = {
  "SHA-1": 160,
  "SHA-256": 256,
  "SHA-512": 512,
};

function parseAttributes(message: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const part of message.split(",")) {
    const index = part.indexOf("=");
    if (index > 0) attributes.set(part.slice(0, index), part.slice(index + 1));
  }
  return attributes;
}

/** Escape a user name as a SCRAM `saslname` */
function escapeName(name: string): string {
  return name.replaceAll("=", "=3D").replaceAll(",", "=2C");
}

/**
 * The client side of a SCRAM authentication exchange, without channel
 * binding:
 *
 * 1. {@linkcode ScramClient.clientFirst} creates the client-first-message.
 * 2. {@linkcode ScramClient.clientFinal} creates the client-final-message,
 *    including the proof of the password, from the server-first-message.
 * 3. {@linkcode ScramClient.verify} verifies the signature of the server in
 *    the server-final-message, which proves that the server knows the
 *    password too.
 *
 * @example RFC 7677 test vector
 * ```ts
 * import { ScramClient } from "@stdx/crypto/scram";
 * import { assertEquals } from "@std/assert";
 *
 * const scram = new ScramClient({
 *   user: "user",
 *   password: "pencil",
 *   nonce: "rOprNGfwEbeRWgbNEkqO",
 * });
 * assertEquals(scram.mechanism, "SCRAM-SHA-256");
 * assertEquals(scram.clientFirst(), "n,,n=user,r=rOprNGfwEbeRWgbNEkqO");
 * assertEquals(
 *   await scram.clientFinal(
 *     "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096",
 *   ),
 *   "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=",
 * );
 * await scram.verify("v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=");
 * ```
 */
export class ScramClient {
  readonly #hash: ScramHash;
  readonly #password: string;
  readonly #nonce: string;
  readonly #clientFirstBare: string;
  #authMessage?: string;
  #saltedPassword?: Uint8Array<ArrayBuffer>;

  constructor(options: ScramClientOptions) {
    this.#hash = options.hash ?? "SHA-256";
    this.#password = options.password;
    this.#nonce = options.nonce ??
      crypto.getRandomValues(new Uint8Array(18)).toBase64();
    this.#clientFirstBare = `n=${
      escapeName(options.user ?? "")
    },r=${this.#nonce}`;
  }

  /**
   * The SASL mechanism name, such as `SCRAM-SHA-256`
   */
  get mechanism(): string {
    return `SCRAM-${this.#hash}`;
  }

  /**
   * The client-first-message, sent to start the exchange
   */
  clientFirst(): string {
    return `n,,${this.#clientFirstBare}`;
  }

  /**
   * Compute the client-final-message from the server-first-message
   *
   * @param serverFirst the server-first-message
   * @returns the client-final-message
   * @throws {ScramError} if the server-first-message is invalid
   */
  async clientFinal(serverFirst: string): Promise<string> {
    const attributes = parseAttributes(serverFirst);
    const nonce = attributes.get("r");
    const salt = attributes.get("s");
    const iterations = Number(attributes.get("i"));
    if (
      !nonce?.startsWith(this.#nonce) || !salt ||
      !Number.isInteger(iterations) || iterations < 1
    ) {
      throw new ScramError("Invalid SCRAM server-first-message");
    }

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.#password.normalize("NFKC")),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    this.#saltedPassword = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: this.#hash,
          salt: Uint8Array.fromBase64(salt),
          iterations,
        },
        key,
        KEY_LENGTHS[this.#hash],
      ),
    );

    const clientFinalWithoutProof = `c=biws,r=${nonce}`;
    this.#authMessage =
      `${this.#clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
    const clientKey = await hmac(
      this.#hash,
      this.#saltedPassword,
      "Client Key",
    );
    const storedKey = await crypto.subtle.digest(this.#hash, clientKey);
    const signature = await hmac(this.#hash, storedKey, this.#authMessage);
    const proof = clientKey.map((byte, i) => byte ^ signature[i]);
    return `${clientFinalWithoutProof},p=${proof.toBase64()}`;
  }

  /**
   * Verify the server signature of the server-final-message
   *
   * @param serverFinal the server-final-message
   * @throws {ScramError} if the server reports an error, or the signature is
   * invalid
   */
  async verify(serverFinal: string): Promise<void> {
    const attributes = parseAttributes(serverFinal);
    const error = attributes.get("e");
    if (error) {
      throw new ScramError(`SCRAM authentication failed: ${error}`);
    }
    if (!this.#saltedPassword || !this.#authMessage) {
      throw new ScramError(
        "The client-final-message must be computed before verifying",
      );
    }
    const serverKey = await hmac(
      this.#hash,
      this.#saltedPassword,
      "Server Key",
    );
    const expected = await hmac(this.#hash, serverKey, this.#authMessage);
    let actual: Uint8Array;
    try {
      actual = Uint8Array.fromBase64(attributes.get("v") ?? "");
    } catch {
      actual = new Uint8Array();
    }
    if (
      actual.length !== expected.length || !timingSafeEqual(actual, expected)
    ) {
      throw new ScramError("Invalid SCRAM server signature");
    }
  }
}
