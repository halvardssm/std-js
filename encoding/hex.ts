/**
 * Utilities for hex encoded data.
 *
 * @example
 * ```ts
 * import { dump } from "@stdx/encoding/hex";
 * import { assertEquals } from "@std/assert";
 *
 * const buffer = new TextEncoder().encode("Hello world!");
 * assertEquals(
 *   dump(buffer),
 *   `00000000  48 65 6c 6c 6f 20 77 6f  72 6c 64 21              |Hello world!|`,
 * );
 * ```
 *
 * @module
 */

/**
 * Convert a buffer to a hexdump string, in the style of `xxd`: 16 bytes
 * per line, each with its address, hex values and printable-ASCII view
 * (non-printable bytes are shown as `.`).
 *
 * @param bufferView The buffer to dump. Can be any `ArrayBufferView` or an
 * `ArrayBuffer`.
 * @returns The hexdump, one line per 16 bytes, without a trailing newline.
 *
 * @example
 * ```ts
 * import { dump } from "@stdx/encoding/hex";
 *
 * const buffer = new TextEncoder().encode("The quick brown fox jumps over the lazy dog.");
 * console.log(dump(buffer));
 * // 00000000  54 68 65 20 71 75 69 63  6b 20 62 72 6f 77 6e 20  |The quick brown |
 * // 00000010  66 6f 78 20 6a 75 6d 70  73 20 6f 76 65 72 20 74  |fox jumps over t|
 * // 00000020  68 65 20 6c 61 7a 79 20  64 6f 67 2e              |he lazy dog.|
 * ```
 */
export function dump(bufferView: ArrayBufferView | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (ArrayBuffer.isView(bufferView)) {
    bytes = new Uint8Array(bufferView.buffer);
  } else {
    bytes = new Uint8Array(bufferView);
  }

  const lines = [];

  for (let i = 0; i < bytes.length; i += 16) {
    const address = i.toString(16).padStart(8, "0");
    const block = bytes.slice(i, i + 16);
    const hexArray = [];
    const asciiArray = [];
    let padding = "";

    for (const value of block) {
      hexArray.push(value.toString(16).padStart(2, "0"));
      asciiArray.push(
        value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : ".",
      );
    }

    if (hexArray.length < 16) {
      const space = 16 - hexArray.length;
      padding = " ".repeat(space * 2 + space + (hexArray.length < 9 ? 1 : 0));
    }

    const hexString = hexArray.length > 8
      ? hexArray.slice(0, 8).join(" ") + "  " + hexArray.slice(8).join(" ")
      : hexArray.join(" ");

    const asciiString = asciiArray.join("");
    const line = `${address}  ${hexString}  ${padding}|${asciiString}|`;

    lines.push(line);
  }

  return lines.join("\n");
}
