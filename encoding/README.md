# @stdx/encoding

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
