# Deno Standard Library Extended

[![JSR @stdext](https://jsr.io/badges/@stdext)](https://jsr.io/@stdext)
[![codecov](https://codecov.io/gh/halvardssm/std-js/graph/badge.svg?token=T1JEMGF8VW)](https://codecov.io/gh/halvardssm/std-js)
[![ci](https://github.com/halvardssm/std-js/actions/workflows/ci.yml/badge.svg)](https://github.com/halvardssm/std-js/actions/workflows/ci.yml)

An extension of the [Deno Standard Library](https://github.com/denoland/std).

Multiple languages such as Rust, Go and PHP offer a standard library, which
allows the reduction of third-party libraries. This project is used to extend
the Deno STD, with functions that are not accepted in the main library, but
which are provided in the standard library of other languages.

## Installation

Add the JSR package.

```
deno add @stdext/[package]
```

Example:

```
deno add @stdext/encoding
```

## Usage

Import the module or sub-module.

```ts
import { dump } from "@stdext/encoding/hex";

const buffer = new TextEncoder().encode(
  "The quick brown fox jumps over the lazy dog.",
);
console.log(dump(buffer));
// 00000000  54 68 65 20 71 75 69 63  6b 20 62 72 6f 77 6e 20  |The quick brown |
// 00000010  66 6f 78 20 6a 75 6d 70  73 20 6f 76 65 72 20 74  |fox jumps over t|
// 00000020  68 65 20 6c 61 7a 79 20  64 6f 67 2e              |he lazy dog.|
```

## Packages

- [assert](https://jsr.io/@stdext/assert): The assert package, contains
  validators and assertions
- [cli](https://jsr.io/@stdext/cli): The cli package contains a command
  framework and helpers for building command line applications
- [collections](https://jsr.io/@stdext/collections): The collections package
  contains commonly used utilities and structures
- [crypto](https://jsr.io/@stdext/crypto): The crypto package contains utility
  for crypto, hashing, HMAC and SCRAM authentication
- [database](https://jsr.io/@stdext/database): The database package contains
  interfaces and helpers for interacting with databases, and SQLite and Postgres
  drivers
- [encoding](https://jsr.io/@stdext/encoding): The encoding package contains
  utility for text and binary encoding.
- [event](https://jsr.io/@stdext/event): The event package contains extensions
  for events
- [ffi](https://jsr.io/@stdext/ffi): The FFI package contains helpers when using
  FFI
- [fs](https://jsr.io/@stdext/fs): The fs package contains helpers for the file
  system
- [http](https://jsr.io/@stdext/http): The http package contains utility for
  fetching and http servers
- [json](https://jsr.io/@stdext/json): The json package, contains helpers for
  json parsing, querying (jsonpath) and processing
- [lexer](https://jsr.io/@stdext/lexer): The lexer package contains general
  purpose lexers/tokenizers
- [types](https://jsr.io/@stdext/types): The types package, contains general
  purpose type helpers
- [validation](https://jsr.io/@stdext/validation): The validation package,
  builds schemas that implement both Standard Schema and Standard JSON Schema,
  with fully inferred types
- [xml](https://jsr.io/@stdext/xml): The xml package provides XML parsing,
  serialization, and XSD validation, backed by a WebAssembly implementation
- [zip](https://jsr.io/@stdext/zip): The zip package contains helpers for
  creating and extracting zip archives

## Platform support

The packages are primarily developed and tested on macOS and Linux. Windows
support is not guaranteed, and packages may not work as expected on Windows. If
you encounter an issue on Windows, please
[report it](https://github.com/halvardssm/std-js/issues).

## Versioning

We follow the semantic versioning scheme. We will share major versions with Deno
STD, but minor and patch versions will be separated.

## Dependencies

We allow the following dependencies for JS:

- Everything under the namespace [@deno](https://jsr.io/@deno) on JSR
- Everything under the namespace [@std](https://jsr.io/@std) on JSR

> - Imports for standard specifications will be decided on a case by case basis.
> - 3rd party libraries for testing will be decided on a case by case basis.

We allow no additional third-party dependencies for JS, thus all code must be
implemented.

For modules that use Rust to compile to WASM, we allow the usage of third-party
crates if necessary, but this will be considered on a case-by-case basis.

Allowed test dependencies:

- zod: `jsr:@zod/zod@^4`

## WASM

All wasm code is generated from the rust workspace in the [\_wasm](./_wasm)
folder.

To generate the wasm code:

```sh
deno task build:wasm
```

This will call the [build_wasm.ts](./_tools/build_wasm.ts) script and will place
each generated lib in its respective package based on its prefix. See script for
more details.

## Deprecation Policy

We follow the
[Deno STD Deprecation Policy](https://github.com/denoland/std?tab=readme-ov-file#deprecation-policy).

When functionalities are adopted either by JavaScript language APIs, new Web
Standard APIs or Deno STD, we mark the functions as deprecated, and will remove
these earliest after 3 minor iterations (sometimes can take longer).

For deprecated functions and modules, and their replacement, see the
[deprecation document](./DEPRECATIONS.md).

## Contributing

To contribute, first open an issue to describe the addition. After getting
feedback and approval, open a PR linking to the issue.

Code that is copied from other places, must be credited and is only allowed if
the license allows for it.

## Workflows

To bump versions and publish the packages to JSR, do the following:

1. Trigger the manual GitHub action
   [version bump](https://github.com/halvardssm/std-js/actions/workflows/version_bump.yml).
2. Check the created PR, verify the changes, and merge.
3. Create a [new release](https://github.com/halvardssm/std-js/releases/new),
   with the tag name `release-[date]` (e.g. `release-2024.12.29`) and auto
   generate release notes.

## Acknowledgments

This repo is an extension of the Deno STD and is therefore heavily based on it.
Code tools and setup are based on work done by the Deno Team.
