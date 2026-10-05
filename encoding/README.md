# @stdx/encoding

[![JSR](https://jsr.io/badges/@stdx/encoding)](https://jsr.io/@stdx/encoding)
[![JSR Score](https://jsr.io/badges/@stdx/encoding/score)](https://jsr.io/@stdx/encoding)
[![Weekly downloads](https://jsr.io/badges/@stdx/encoding/weekly-downloads)](https://jsr.io/@stdx/encoding)
[![Total downloads](https://jsr.io/badges/@stdx/encoding/total-downloads)](https://jsr.io/@stdx/encoding)

Extends [@std/encoding](https://jsr.io/@std/encoding)

The encoding package contains helpers for text and binary encoding.

## Entrypoints

### Binary

The binary module contains a writer and reader for binary data, such as the
messages of network protocols: signed and unsigned integers, big integers and
floats in big or little endian byte order, raw bytes and UTF-8 strings.

```ts
import { BinaryReader, BinaryWriter } from "@stdx/encoding/binary";

const writer = new BinaryWriter({ endian: "big" });
writer.uint8(1).int32(-2).cstring("hello").float64(1.5, "little");

const reader = new BinaryReader(writer.toBytes());
reader.uint8(); // 1
reader.int32(); // -2
reader.cstring(); // "hello"
reader.float64("little"); // 1.5
```

### Hex

The hex module contains helpers for hex-encoded data such as hexdump.

```ts
import { dump } from "@stdx/encoding/hex";

const buffer = new TextEncoder().encode("Hello world!");
console.log(dump(buffer));
// 00000000  48 65 6c 6c 6f 20 77 6f  72 6c 64 21              |Hello world!|
```
