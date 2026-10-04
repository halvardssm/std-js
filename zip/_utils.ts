export const LOCAL_SIGNATURE = 0x04034b50;
export const CENTRAL_SIGNATURE = 0x02014b50;
export const END_SIGNATURE = 0x06054b50;
export const LOCAL_HEADER_SIZE = 30;
export const CENTRAL_HEADER_SIZE = 46;
export const END_SIZE = 22;
export const METHOD_STORED = 0;
export const METHOD_DEFLATE = 8;
export const MAX_U16 = 0xffff;
export const MAX_U32 = 0xffffffff;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const source = new Blob([data as BlobPart]).stream();
  const result = await new Response(source.pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(result);
}
