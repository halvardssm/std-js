import { assertEquals, assertRejects } from "@std/assert";
import { unzip } from "./unzip.ts";
import { zip } from "./zip.ts";

const text = (data: Uint8Array) => new TextDecoder().decode(data);

Deno.test("zip and unzip roundtrip", async (t) => {
  await t.step("files, directories and metadata", async () => {
    const lastModified = new Date(2024, 5, 15, 12, 30, 44);
    const archive = await zip([
      { path: "dir/", mode: 0o750, lastModified },
      { path: "dir/a.txt", data: "a".repeat(1000), lastModified },
      { path: "run.sh", data: new Uint8Array([1, 2, 3]), mode: 0o755 },
      { path: "ünï/çödé.txt", data: "unicode" },
      { path: "empty" },
    ]);

    const entries = await unzip(archive);
    assertEquals(entries.map((e) => e.path), [
      "dir/",
      "dir/a.txt",
      "run.sh",
      "ünï/çödé.txt",
      "empty",
    ]);
    assertEquals(entries[0]!.isDirectory, true);
    assertEquals(entries[0]!.mode! & 0o777, 0o750);
    assertEquals(entries[0]!.lastModified, lastModified);
    assertEquals(text(entries[1]!.data), "a".repeat(1000));
    assertEquals(entries[2]!.data, new Uint8Array([1, 2, 3]));
    assertEquals(entries[2]!.mode! & 0o777, 0o755);
    assertEquals(entries[2]!.isDirectory, false);
    assertEquals(text(entries[3]!.data), "unicode");
    assertEquals(entries[4]!.data.length, 0);
  });

  await t.step("compresses only when it helps", async () => {
    const compressible = await zip([{ path: "a", data: "a".repeat(10000) }]);
    assertEquals(compressible.length < 1000, true);
    // Method is stored for incompressible and empty data.
    const stored = await zip([{ path: "a", data: "x" }]);
    assertEquals(new DataView(stored.buffer).getUint16(8, true), 0);
  });

  await t.step("empty archive", async () => {
    assertEquals(await unzip(await zip([])), []);
  });

  await t.step("throws on ZIP64 sized names", async () => {
    await assertRejects(
      () => zip([{ path: "a".repeat(0x10000) }]),
      RangeError,
      "ZIP64",
    );
  });
});

Deno.test("zip output is readable by unzip", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeFile(
      `${dir}/out.zip`,
      await zip([{ path: "a/b.txt", data: "content" }]),
    );
    const result = await new Deno.Command("unzip", {
      args: ["-tq", "out.zip"],
      cwd: dir,
      stdout: "null",
      stderr: "null",
    }).output().catch(() => undefined);
    if (result) assertEquals(result.success, true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
