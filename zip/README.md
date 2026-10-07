# @stdx/zip

[![JSR](https://jsr.io/badges/@stdx/zip)](https://jsr.io/@stdx/zip)
[![JSR Score](https://jsr.io/badges/@stdx/zip/score)](https://jsr.io/@stdx/zip)
[![Weekly downloads](https://jsr.io/badges/@stdx/zip/weekly-downloads)](https://jsr.io/@stdx/zip)
[![Total downloads](https://jsr.io/badges/@stdx/zip/total-downloads)](https://jsr.io/@stdx/zip)

The zip package contains helpers for creating and extracting zip archives, with
no dependencies other than the Deno runtime.

- `zip` and `unzip` work on in-memory archives.
- `zipDir` and `unzipDir` work on the file system.

Archives are written with the stored and deflate methods, and read with the same
two, which covers practically all archives in use. Encryption and ZIP64 (more
than 65535 entries, or sizes above 4 GiB) are not supported, and throw.

```ts
import { unzip, zip } from "@stdx/zip";

const archive = await zip([
  { path: "hello.txt", data: "Hello, world!" },
  { path: "bin/run.sh", data: "#!/bin/sh\n", mode: 0o755 },
]);

const entries = await unzip(archive);
console.log(entries.map((entry) => entry.path)); // ["hello.txt", "bin/run.sh"]
```

## Node.js compatibility

`zip` and `unzip` are pure and run in any runtime. `zipDir` and `unzipDir`
access the file system through the Deno namespace, and work in Node.js when
[`@deno/shim-deno`](https://github.com/denoland/node_shims) is installed from
npm and exposed as a global before the module is imported:

```ts
// entry file, before importing @stdx/zip
import { Deno } from "@deno/shim-deno";

globalThis.Deno = Deno;
```
