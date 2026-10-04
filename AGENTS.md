# AGENTS.md

An extension of the
[Deno Standard Library](https://github.com/denoland/std), published on JSR
under the `@stdext` scope.

## Repository layout

The repo is a Deno workspace of independently versioned and published packages.
Each top-level directory (except `_tools`, `_wasm`, `coverage`) is one package:

```
<package>/
  deno.json   # name (@stdext/<package>), version, exports map
  README.md    # package docs, follows the stdext template
  mod.ts       # root module, re-exports the package's public API
  *.test.ts    # colocated tests
  *.bench.ts   # optional benchmarks
  _wasm/       # generated wasm artifacts (committed)
```

- Public API goes in the `exports` map of the package's `deno.json`. Keep it in
  sync with the modules that exist — every public module should have a subpath
  export.
- Shared types come from the std packages being extended (`@std/xml`,
  `@std/http`, ...). Never redeclare types that an upstream std package already
  provides.
- Documentation lives in three places and must be kept in sync: the package
  `README.md`, the root `README.md` package list, and `Releases.md`.

## Commands

All commands are defined in the root `deno.json`.

```sh
deno task check          # fmt --check, lint, and deno check **/*.ts
deno task test           # full test suite with coverage
deno task fix            # format (JS + Rust) and auto-fix lint rules
deno task build:wasm     # build wasm crates into each package's _wasm/
deno task build:wasm:check  # verify committed wasm matches Rust sources
```

Run `deno task check` and `deno task test` before considering work done. If you
touched Rust code in `_wasm/`, run `deno task build:wasm` and commit the
generated artifacts; CI verifies parity with `build:wasm:check`.

## Dependencies

- JS: no third-party dependencies. Only `@std/*` and `@deno/*` packages, plus
  standard specifications (e.g. `@standard-schema/spec`) on a case-by-case
  basis.
- Rust (`_wasm/`): third-party crates are allowed case-by-case; workspace
  versions are pinned in `_wasm/Cargo.toml`.

## WASM

Wasm-backed modules are generated from the Rust workspace in `_wasm/`. Crate
names follow `<package>_<module>` (e.g. `crypto_hash_argon2`, `xml_xml`) and the
build script (`_tools/build_wasm.ts`) places output in `<package>/_wasm/` based
on that prefix. JS wrappers live in the package and are the public surface; the
`.mjs` bindings are an implementation detail.

## Conventions

- Formatting and linting are `deno fmt` and `deno lint`; Rust is `cargo fmt`.
  Never hand-format.
- New functionality needs colocated tests; aim for full line coverage of
  non-generated code.
- JSDoc examples should be valid, type-checkable code — examples are part of the
  published docs.
- Semantic versioning, sharing major versions with Deno STD. Version bumps
  happen through the `version_bump` GitHub workflow, not by hand.
- When a function is adopted by the language, web standards, or Deno STD, mark
  it `@deprecated` and record it in `DEPRECATIONS.md`. Removal happens earliest
  after 3 minor iterations.

## Commits

Conventional commits, scoped by package: `feat(crypto): ...`, `fix(xml): ...`,
`chore: ...`.
