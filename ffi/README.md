# @stdx/ffi

[![JSR](https://jsr.io/badges/@stdx/ffi)](https://jsr.io/@stdx/ffi)
[![JSR Score](https://jsr.io/badges/@stdx/ffi/score)](https://jsr.io/@stdx/ffi)
[![Weekly downloads](https://jsr.io/badges/@stdx/ffi/weekly-downloads)](https://jsr.io/@stdx/ffi)
[![Total downloads](https://jsr.io/badges/@stdx/ffi/total-downloads)](https://jsr.io/@stdx/ffi)

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

## Node.js compatibility

`urlToPathSegments` and `withoutExt` are pure and run in any runtime.
`getFileOptions`, `cacheRemoteFile` and `getCachePath` access the file system
and environment through the Deno namespace, and work in Node.js when
[`@deno/shim-deno`](https://github.com/denoland/node_shims) is installed from
npm and exposed as a global before the module is imported:

```ts
// entry file, before importing @stdx/ffi
import { Deno } from "@deno/shim-deno";

globalThis.Deno = Deno;
```

`dlopen` additionally calls `Deno.dlopen`, which `@deno/shim-deno` does not
provide. Using it in Node.js requires a custom `Deno.dlopen` shim as well, for
example one backed by [koffi](https://www.npmjs.com/package/koffi):

```ts ignore
// entry file, before importing @stdx/ffi
import koffi from "koffi";
import { fileURLToPath } from "node:url";
import { Deno } from "@deno/shim-deno";

// Minimal Deno.dlopen shim backed by koffi, covering the numeric FFI types
// and opaque pointers
const types = {
  void: "void",
  u8: "uint8",
  i8: "int8",
  u16: "uint16",
  i16: "int16",
  u32: "uint32",
  i32: "int32",
  u64: "uint64",
  i64: "int64",
  f32: "float",
  f64: "double",
  pointer: "void *",
};

function dlopen(
  libFile: string,
  symbols: Record<string, { parameters?: string[]; result?: string }>,
) {
  const lib = koffi.load(
    libFile.startsWith("file:") ? fileURLToPath(libFile) : libFile,
  );
  const functions = Object.fromEntries(
    Object.entries(symbols).map(([name, def]) => [
      name,
      lib.func(
        name,
        types[def.result ?? "void"],
        (def.parameters ?? []).map((t) => types[t]),
      ),
    ]),
  );
  return { symbols: functions, close: () => lib.unload() };
}

globalThis.Deno = { ...Deno, dlopen };
```
