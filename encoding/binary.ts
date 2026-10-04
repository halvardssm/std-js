/**
 * Utilities for reading and writing binary data, such as the messages of a
 * network protocol: integers, floats and big integers in big or little
 * endian byte order, raw bytes, and UTF-8 strings.
 *
 * @example
 * ```ts
 * import { BinaryReader, BinaryWriter } from "@stdx/encoding/binary";
 * import { assertEquals } from "@std/assert";
 *
 * const writer = new BinaryWriter();
 * writer.uint8(1).int32(-2).cstring("hello").float64(1.5, "little");
 *
 * const reader = new BinaryReader(writer.toBytes());
 * assertEquals(reader.uint8(), 1);
 * assertEquals(reader.int32(), -2);
 * assertEquals(reader.cstring(), "hello");
 * assertEquals(reader.float64("little"), 1.5);
 * ```
 *
 * @module
 */

/**
 * The byte order of multi-byte values. `"big"` is also known as network byte
 * order.
 */
export type Endianness = "big" | "little";

/**
 * Options for {@linkcode BinaryWriter} and {@linkcode BinaryReader}.
 */
export interface BinaryOptions {
  /**
   * The default byte order of multi-byte values. Each method also takes the
   * byte order as an optional last argument. Defaults to `"big"`.
   */
  endian?: Endianness;
}

/**
 * Options for {@linkcode BinaryWriter}.
 */
export interface BinaryWriterOptions extends BinaryOptions {
  /**
   * The initial capacity of the buffer in bytes. The buffer grows as needed.
   * Defaults to `1024`.
   */
  capacity?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Writes binary data into a growable buffer.
 *
 * The writer has a position, which can be moved back to fill in a value
 * that is only known later, such as a length prefix.
 *
 * Integers outside of the range of the written type wrap around, as with
 * {@linkcode DataView}.
 *
 * @example Writing a length prefixed message
 * ```ts
 * import { BinaryWriter } from "@stdx/encoding/binary";
 * import { assertEquals } from "@std/assert";
 *
 * const writer = new BinaryWriter();
 * const start = writer.position;
 * writer.uint32(0); // Placeholder for the length
 * writer.string("hello");
 * const end = writer.position;
 * writer.position = start;
 * writer.uint32(end - start);
 * writer.position = end;
 *
 * assertEquals(
 *   writer.toBytes(),
 *   new Uint8Array([0, 0, 0, 9, 104, 101, 108, 108, 111]),
 * );
 * ```
 */
export class BinaryWriter {
  readonly #littleEndian: boolean;
  #buffer: Uint8Array;
  #view: DataView;
  #position = 0;
  #length = 0;

  constructor(options?: BinaryWriterOptions) {
    this.#littleEndian = options?.endian === "little";
    this.#buffer = new Uint8Array(options?.capacity ?? 1024);
    this.#view = new DataView(this.#buffer.buffer);
  }

  /**
   * The number of bytes written
   */
  get length(): number {
    return this.#length;
  }

  /**
   * The position the next value is written at. It can be set to any position
   * up to {@linkcode BinaryWriter.length}, to overwrite earlier values.
   *
   * @throws {RangeError} if the position is out of range
   */
  get position(): number {
    return this.#position;
  }

  set position(position: number) {
    if (
      !Number.isInteger(position) || position < 0 || position > this.#length
    ) {
      throw new RangeError(
        `Position must be an integer between 0 and ${this.#length}: received ${position}`,
      );
    }
    this.#position = position;
  }

  #little(endian: Endianness | undefined): boolean {
    return endian === undefined ? this.#littleEndian : endian === "little";
  }

  /**
   * Reserve `size` bytes at the position, and move the position past them.
   * The buffer may be replaced, so callers must read `#view` and `#buffer`
   * after calling this.
   */
  #advance(size: number): number {
    const offset = this.#position;
    const end = offset + size;
    if (end > this.#buffer.length) {
      const buffer = new Uint8Array(Math.max(this.#buffer.length * 2, end));
      buffer.set(this.#buffer.subarray(0, this.#length));
      this.#buffer = buffer;
      this.#view = new DataView(buffer.buffer);
    }
    this.#position = end;
    if (end > this.#length) this.#length = end;
    return offset;
  }

  /** Write a signed 8-bit integer */
  int8(value: number): this {
    const offset = this.#advance(1);
    this.#view.setInt8(offset, value);
    return this;
  }

  /** Write an unsigned 8-bit integer */
  uint8(value: number): this {
    const offset = this.#advance(1);
    this.#view.setUint8(offset, value);
    return this;
  }

  /** Write a signed 16-bit integer */
  int16(value: number, endian?: Endianness): this {
    const offset = this.#advance(2);
    this.#view.setInt16(offset, value, this.#little(endian));
    return this;
  }

  /** Write an unsigned 16-bit integer */
  uint16(value: number, endian?: Endianness): this {
    const offset = this.#advance(2);
    this.#view.setUint16(offset, value, this.#little(endian));
    return this;
  }

  /** Write a signed 32-bit integer */
  int32(value: number, endian?: Endianness): this {
    const offset = this.#advance(4);
    this.#view.setInt32(offset, value, this.#little(endian));
    return this;
  }

  /** Write an unsigned 32-bit integer */
  uint32(value: number, endian?: Endianness): this {
    const offset = this.#advance(4);
    this.#view.setUint32(offset, value, this.#little(endian));
    return this;
  }

  /** Write a signed 64-bit integer */
  bigInt64(value: bigint, endian?: Endianness): this {
    const offset = this.#advance(8);
    this.#view.setBigInt64(offset, value, this.#little(endian));
    return this;
  }

  /** Write an unsigned 64-bit integer */
  bigUint64(value: bigint, endian?: Endianness): this {
    const offset = this.#advance(8);
    this.#view.setBigUint64(offset, value, this.#little(endian));
    return this;
  }

  /** Write a 32-bit float */
  float32(value: number, endian?: Endianness): this {
    const offset = this.#advance(4);
    this.#view.setFloat32(offset, value, this.#little(endian));
    return this;
  }

  /** Write a 64-bit float */
  float64(value: number, endian?: Endianness): this {
    const offset = this.#advance(8);
    this.#view.setFloat64(offset, value, this.#little(endian));
    return this;
  }

  /** Write raw bytes */
  bytes(value: Uint8Array): this {
    const offset = this.#advance(value.length);
    this.#buffer.set(value, offset);
    return this;
  }

  /** Write a string as UTF-8, without a terminator or length */
  string(value: string): this {
    return this.bytes(encoder.encode(value));
  }

  /** Write a string as UTF-8, followed by a null terminator */
  cstring(value: string): this {
    return this.string(value).uint8(0);
  }

  /** A copy of the written bytes */
  toBytes(): Uint8Array {
    return this.#buffer.slice(0, this.#length);
  }

  /** Discard the written bytes, keeping the allocated buffer */
  reset(): this {
    this.#position = 0;
    this.#length = 0;
    return this;
  }
}

/**
 * Reads binary data from a byte array.
 *
 * Reading beyond the end of the data throws a {@linkcode RangeError}.
 *
 * @example
 * ```ts
 * import { BinaryReader } from "@stdx/encoding/binary";
 * import { assertEquals } from "@std/assert";
 *
 * const reader = new BinaryReader(new Uint8Array([0, 1, 2, 0, 104, 105, 0]));
 * assertEquals(reader.uint16(), 1);
 * assertEquals(reader.uint16("little"), 2);
 * assertEquals(reader.cstring(), "hi");
 * assertEquals(reader.remaining, 0);
 * ```
 */
export class BinaryReader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  readonly #littleEndian: boolean;
  #position = 0;

  constructor(bytes: Uint8Array, options?: BinaryOptions) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#littleEndian = options?.endian === "little";
  }

  /**
   * The position the next value is read from
   *
   * @throws {RangeError} if the position is out of range
   */
  get position(): number {
    return this.#position;
  }

  set position(position: number) {
    if (
      !Number.isInteger(position) || position < 0 ||
      position > this.#bytes.length
    ) {
      throw new RangeError(
        `Position must be an integer between 0 and ${this.#bytes.length}: received ${position}`,
      );
    }
    this.#position = position;
  }

  /** The number of bytes left to read */
  get remaining(): number {
    return this.#bytes.length - this.#position;
  }

  #little(endian: Endianness | undefined): boolean {
    return endian === undefined ? this.#littleEndian : endian === "little";
  }

  /** Move the position past `size` bytes, returning their offset */
  #advance(size: number): number {
    if (size > this.remaining) {
      throw new RangeError(
        `Cannot read ${size} bytes: only ${this.remaining} bytes remaining`,
      );
    }
    const offset = this.#position;
    this.#position += size;
    return offset;
  }

  /** Read a signed 8-bit integer */
  int8(): number {
    return this.#view.getInt8(this.#advance(1));
  }

  /** Read an unsigned 8-bit integer */
  uint8(): number {
    return this.#view.getUint8(this.#advance(1));
  }

  /** Read a signed 16-bit integer */
  int16(endian?: Endianness): number {
    return this.#view.getInt16(this.#advance(2), this.#little(endian));
  }

  /** Read an unsigned 16-bit integer */
  uint16(endian?: Endianness): number {
    return this.#view.getUint16(this.#advance(2), this.#little(endian));
  }

  /** Read a signed 32-bit integer */
  int32(endian?: Endianness): number {
    return this.#view.getInt32(this.#advance(4), this.#little(endian));
  }

  /** Read an unsigned 32-bit integer */
  uint32(endian?: Endianness): number {
    return this.#view.getUint32(this.#advance(4), this.#little(endian));
  }

  /** Read a signed 64-bit integer */
  bigInt64(endian?: Endianness): bigint {
    return this.#view.getBigInt64(this.#advance(8), this.#little(endian));
  }

  /** Read an unsigned 64-bit integer */
  bigUint64(endian?: Endianness): bigint {
    return this.#view.getBigUint64(this.#advance(8), this.#little(endian));
  }

  /** Read a 32-bit float */
  float32(endian?: Endianness): number {
    return this.#view.getFloat32(this.#advance(4), this.#little(endian));
  }

  /** Read a 64-bit float */
  float64(endian?: Endianness): number {
    return this.#view.getFloat64(this.#advance(8), this.#little(endian));
  }

  /**
   * Read raw bytes. The returned array is a view on the underlying data, not
   * a copy.
   */
  bytes(length: number): Uint8Array {
    const offset = this.#advance(length);
    return this.#bytes.subarray(offset, offset + length);
  }

  /** Read the remaining bytes, as a view on the underlying data */
  rest(): Uint8Array {
    return this.bytes(this.remaining);
  }

  /** Read `length` bytes as a UTF-8 string */
  string(length: number): string {
    return decoder.decode(this.bytes(length));
  }

  /**
   * Read a null terminated UTF-8 string, and move the position past the
   * terminator
   *
   * @throws {RangeError} if there is no null terminator
   */
  cstring(): string {
    const end = this.#bytes.indexOf(0, this.#position);
    if (end === -1) {
      throw new RangeError("Cannot read string: no null terminator");
    }
    const value = this.string(end - this.#position);
    this.#position++;
    return value;
  }
}
