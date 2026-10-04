# @stdx/zip

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
