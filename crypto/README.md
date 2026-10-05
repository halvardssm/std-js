# @stdx/crypto

[![JSR](https://jsr.io/badges/@stdx/crypto)](https://jsr.io/@stdx/crypto)
[![JSR Score](https://jsr.io/badges/@stdx/crypto/score)](https://jsr.io/@stdx/crypto)
[![Weekly downloads](https://jsr.io/badges/@stdx/crypto/weekly-downloads)](https://jsr.io/@stdx/crypto)
[![Total downloads](https://jsr.io/badges/@stdx/crypto/total-downloads)](https://jsr.io/@stdx/crypto)

Extends [@std/crypto](https://jsr.io/@std/crypto)

The Crypto package contains utilities for password hashing, message
authentication, authentication mechanisms and one-time passwords.

## Conventions

The modules share the same shape:

- Required arguments come first, followed by an optional options object, e.g.
  `hash(data, options?)`, `generateHotp(key, counter, options?)` and
  `generateTotp(key, options?)`.
- Verification takes the value to verify first, followed by what it is verified
  against: `verify(data, hash)`, `verifyHotp(otp, key, counter)` and
  `verifyTotp(otp, key)`. One-time passwords and signatures are compared in
  constant time.
- Hash functions are named as in the Web Crypto API (`"SHA-1"`, `"SHA-256"`,
  ...).
- The password hashes are backed by WebAssembly and synchronous; everything
  backed by the Web Crypto API (HMAC, SCRAM, HOTP, TOTP) is asynchronous.

## Entrypoints

### Hash

The hash module contains helpers and implementations for password hashing.

> The hash methods are written in Rust and compiled to WASM.

The following algorithms are provided:

- Argon2
- Bcrypt
- Scrypt

```ts
import { AlgorithmName, hash, verify } from "@stdx/crypto/hash";

// By name, using default options
const h = hash("argon2", "password");
verify("argon2", "password", h);

// With options
const hWithOptions = hash({ name: "argon2", algorithm: "argon2i" }, "password");
verify(
  { name: AlgorithmName.Argon2, algorithm: "argon2i" },
  "password",
  hWithOptions,
);
```

Hashes can also be imported individually, although this should not be needed if
tree shaking is available in your build process.

```ts
import { hash, verify } from "@stdx/crypto/hash/argon2";

const h = hash("password", { memoryCost: 8192 });
verify("password", h);
```

### HMAC

Keyed-hash message authentication codes, using the Web Crypto API.

```ts
import { hmac } from "@stdx/crypto/hmac";

const mac = await hmac("SHA-256", "key", "message");
```

### SCRAM

The client side of the Salted Challenge Response Authentication Mechanism
(SCRAM-SHA-1, SCRAM-SHA-256 and SCRAM-SHA-512), as used by SASL authentication
in for example Postgres, MongoDB, Kafka, IMAP and XMPP.

```ts ignore
import { ScramClient } from "@stdx/crypto/scram";

const scram = new ScramClient({ user: "user", password: "pencil" });
// Send scram.mechanism and scram.clientFirst() to the server
const clientFinal = await scram.clientFinal(serverFirst);
// Send clientFinal to the server
await scram.verify(serverFinal);
```

### HOTP (HMAC One-Time Password)

```ts
import { generateHotp, verifyHotp } from "@stdx/crypto/hotp";
import { generateSecret } from "@stdx/crypto/utils";

const secret = generateSecret();
const hotp = await generateHotp(secret, 42);
const isValid = await verifyHotp(hotp, secret, 42);

// 8 digits with HMAC-SHA-256
const options = { digits: 8, hash: "SHA-256" } as const;
const hotp8 = await generateHotp(secret, 42, options);
await verifyHotp(hotp8, secret, 42, options);
```

### TOTP (Time-based One-Time Password)

```ts
import { generateTotp, verifyTotp } from "@stdx/crypto/totp";
import { generateSecret } from "@stdx/crypto/utils";

const secret = generateSecret();
const totp = await generateTotp(secret);
const isValid = await verifyTotp(totp, secret);

// For a specific time, with 60 second time steps
const options = { time: Date.UTC(2024, 0, 1), period: 60 };
const totpAt = await generateTotp(secret, options);
await verifyTotp(totpAt, secret, options);
```

### Utils

```ts
import { generateSecretBytes } from "@stdx/crypto/utils";
const secretBytes = generateSecretBytes();
// You can select your own encoding
const encodedSecret = secretBytes.toBase64();
```
