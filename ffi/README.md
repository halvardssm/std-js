# @stdx/ffi

The FFI package contains helpers when using FFI.

## Entrypoints

### Dlopen

The dlopen module loads a dynamic library for the current operating system and
architecture. The library can be a local file, or a file or zip archive that is
downloaded from a URL and cached locally.

```ts ignore
import { dlopen } from "@stdx/ffi/dlopen";

const dylib = await dlopen(
  { add: { parameters: ["isize", "isize"], result: "isize" } },
  {
    filename: {
      darwin: {
        aarch64: { url: "https://example.com/darwin-aarch64.dylib" },
      },
      linux: {
        x86_64: { url: "./local_lib.so" },
        aarch64: {
          url: "https://example.com/some_archive.zip",
          type: "zip",
          archivePath: "path/to/lib/in/zip",
        },
      },
    },
    // Optional, see the cache options of @stdx/fs
    cacheOptions: { cacheControl: "default", path: "./custom/cache/path" },
  },
);

dylib.symbols.add(1, 2);
dylib.close();
```

It throws if no file is configured for the current operating system and
architecture.
