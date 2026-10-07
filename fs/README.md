# @stdx/fs

[![JSR](https://jsr.io/badges/@stdx/fs)](https://jsr.io/@stdx/fs)
[![JSR Score](https://jsr.io/badges/@stdx/fs/score)](https://jsr.io/@stdx/fs)
[![Weekly downloads](https://jsr.io/badges/@stdx/fs/weekly-downloads)](https://jsr.io/@stdx/fs)
[![Total downloads](https://jsr.io/badges/@stdx/fs/total-downloads)](https://jsr.io/@stdx/fs)

Extends [@std/fs](https://jsr.io/@std/fs)

The fs package contains helpers for the file system.

## Entrypoints

### Cache

The cache module downloads remote files into a local cache, and locates the Deno
cache directory.

- `cacheFile` downloads a file once and reuses it. The `cacheControl` option is
  `"default"` (download if missing), `"cachedOnly"` (throw if not cached) or
  `"reload"` (always download again).
- `denoCacheDir` resolves the Deno cache directory, from `DENO_DIR` or the
  platform default.
- `homeDir` resolves the user's home directory.

```ts ignore
import { cacheFile, denoCacheDir } from "@stdx/fs/cache";

// Downloads the file on the first call, and reuses it afterwards.
const path = await cacheFile(
  "https://example.com/README.md",
  "./cache/README.md",
);

// Force a fresh download
await cacheFile("https://example.com/README.md", "./cache/README.md", {
  cacheControl: "reload",
});

const denoDir = await denoCacheDir({ ensure: true });
```

## Node.js compatibility

All exports (`cacheFile`, `denoCacheDir` and `homeDir`) access the file system
and environment through the Deno namespace. They work in Node.js when
[`@deno/shim-deno`](https://github.com/denoland/node_shims) is installed from
npm and exposed as a global before the module is imported:

```ts
// entry file, before importing @stdx/fs
import { Deno } from "@deno/shim-deno";

globalThis.Deno = Deno;
```
