import { assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { unzip, unzipDir } from "./unzip.ts";
import { zip, zipDir } from "./zip.ts";

const text = (data: Uint8Array) => new TextDecoder().decode(data);

Deno.test("unzip errors", async (t) => {
  const archive = await zip([{ path: "a.txt", data: "hello hello hello" }]);

  await t.step("not a zip", async () => {
    await assertRejects(
      () => unzip(new Uint8Array(100)),
      TypeError,
      "Not a zip",
    );
    await assertRejects(() => unzip(new Uint8Array()), TypeError, "Not a zip");
  });

  await t.step("corrupt data", async () => {
    const corrupt = archive.slice();
    // First byte of the file data, right after the local header and name.
    corrupt[30 + "a.txt".length] ^= 0xff;
    await assertRejects(() => unzip(corrupt), TypeError, "corrupt");
  });

  await t.step("crc mismatch on stored entry", async () => {
    const stored = await zip([{ path: "a", data: "x" }]);
    stored[30 + 1] ^= 0xff;
    await assertRejects(() => unzip(stored), TypeError, "corrupt");
  });

  await t.step("encrypted", async () => {
    const encrypted = archive.slice();
    const view = new DataView(encrypted.buffer);
    const central = view.getUint32(encrypted.length - 22 + 16, true);
    view.setUint16(central + 8, 1, true);
    await assertRejects(() => unzip(encrypted), TypeError, "encrypted");
  });

  await t.step("unsupported method", async () => {
    const other = archive.slice();
    const view = new DataView(other.buffer);
    const central = view.getUint32(other.length - 22 + 16, true);
    view.setUint16(central + 10, 12, true);
    await assertRejects(() => unzip(other), TypeError, "method 12");
  });

  await t.step("zip64", async () => {
    const zip64 = archive.slice();
    new DataView(zip64.buffer).setUint16(zip64.length - 22 + 10, 0xffff, true);
    await assertRejects(() => unzip(zip64), TypeError, "ZIP64");
  });

  await t.step("invalid central directory", async () => {
    const invalid = archive.slice();
    const view = new DataView(invalid.buffer);
    view.setUint32(invalid.length - 22 + 16, 0, true);
    await assertRejects(() => unzip(invalid), TypeError, "central directory");
  });

  await t.step("truncated", async () => {
    const truncated = archive.slice();
    const view = new DataView(truncated.buffer);
    const central = view.getUint32(truncated.length - 22 + 16, true);
    view.setUint32(central + 20, 0xfffff, true);
    await assertRejects(() => unzip(truncated), TypeError, "truncated");
  });
});

Deno.test("unzip reads archives made by other tools", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/hello.txt`, "hello\n".repeat(50));
    const result = await new Deno.Command("zip", {
      args: ["-q", "-r", "out.zip", "hello.txt"],
      cwd: dir,
      stderr: "null",
    }).output().catch(() => undefined);
    if (!result?.success) return; // zip binary not available
    const [entry] = await unzip(await Deno.readFile(`${dir}/out.zip`));
    assertEquals(entry!.path, "hello.txt");
    assertEquals(text(entry!.data), "hello\n".repeat(50));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

const isWindows = Deno.build.os === "windows";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await Deno.realPath(await Deno.makeTempDir());
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("zipDir and unzipDir roundtrip", async () => {
  await withTempDir(async (dir) => {
    const src = join(dir, "src");
    await Deno.mkdir(join(src, "sub/empty"), { recursive: true });
    await Deno.writeTextFile(join(src, "a.txt"), "a");
    await Deno.writeTextFile(join(src, "sub/b.txt"), "b".repeat(500));
    await Deno.writeTextFile(join(src, "run.sh"), "#!/bin/sh");
    if (!isWindows) {
      await Deno.chmod(join(src, "run.sh"), 0o755);
      await Deno.symlink("a.txt", join(src, "link"));
    }

    await zipDir(src, join(dir, "out.zip"));
    const paths = (await unzip(await Deno.readFile(join(dir, "out.zip"))))
      .map((e) => e.path).sort();
    assertEquals(paths, ["a.txt", "run.sh", "sub/", "sub/b.txt", "sub/empty/"]);

    const dest = join(dir, "nested/dest");
    await unzipDir(join(dir, "out.zip"), dest);
    assertEquals(await Deno.readTextFile(join(dest, "a.txt")), "a");
    assertEquals(
      await Deno.readTextFile(join(dest, "sub/b.txt")),
      "b".repeat(500),
    );
    assertEquals((await Deno.stat(join(dest, "sub/empty"))).isDirectory, true);
    if (!isWindows) {
      assertEquals(
        (await Deno.stat(join(dest, "run.sh"))).mode! & 0o777,
        0o755,
      );
    }
  });
});

Deno.test("unzipDir overwrites existing files", async () => {
  await withTempDir(async (dir) => {
    await Deno.writeFile(
      join(dir, "in.zip"),
      await zip([
        { path: "a.txt", data: "new" },
      ]),
    );
    await Deno.writeTextFile(join(dir, "a.txt"), "old");
    await unzipDir(join(dir, "in.zip"), dir);
    assertEquals(await Deno.readTextFile(join(dir, "a.txt")), "new");
  });
});

Deno.test("unzipDir restores symlinks", {
  ignore: isWindows,
}, async () => {
  await withTempDir(async (dir) => {
    const mode = 0o120000 | 0o777;
    await Deno.writeFile(
      join(dir, "in.zip"),
      await zip([
        { path: "lib.so.1", data: "lib" },
        { path: "lib.so", data: "lib.so.1", mode },
        { path: "up/" },
        { path: "up/link", data: "../lib.so.1", mode },
      ]),
    );
    await unzipDir(join(dir, "in.zip"), join(dir, "out"));
    assertEquals(await Deno.readLink(join(dir, "out/lib.so")), "lib.so.1");
    assertEquals(await Deno.readTextFile(join(dir, "out/up/link")), "lib");
  });
});

Deno.test("unzipDir rejects unsafe entries", async (t) => {
  const cases: Record<string, Parameters<typeof zip>[0]> = {
    "parent path": [{ path: "../evil.txt", data: "x" }],
    "nested parent path": [{ path: "a/../../evil.txt", data: "x" }],
    "absolute path": [{ path: "/tmp/evil.txt", data: "x" }],
    "parent directory": [{ path: "../evil/" }],
  };
  if (!isWindows) {
    const mode = 0o120777;
    Object.assign(cases, {
      "symlink outside": [{ path: "l", data: "../outside", mode }],
      "absolute symlink": [{ path: "l", data: "/etc", mode }],
      "symlink without parent": [{ path: "x/l", data: "a", mode }],
    });
  }

  for (const [name, entries] of Object.entries(cases)) {
    await t.step(name, async () => {
      await withTempDir(async (dir) => {
        await Deno.writeFile(join(dir, "in.zip"), await zip(entries));
        await assertRejects(
          () => unzipDir(join(dir, "in.zip"), join(dir, "out")),
          TypeError,
        );
        assertEquals(await exists(join(dir, "evil.txt")), false);
      });
    });
  }

  await t.step({
    name: "write through a symlinked directory",
    ignore: isWindows,
    fn: async () => {
      await withTempDir(async (dir) => {
        await Deno.mkdir(join(dir, "out"));
        await Deno.mkdir(join(dir, "outside"));
        await Deno.symlink(join(dir, "outside"), join(dir, "out/link"));
        await Deno.writeFile(
          join(dir, "in.zip"),
          await zip([{ path: "link/evil.txt", data: "x" }]),
        );
        await assertRejects(
          () => unzipDir(join(dir, "in.zip"), join(dir, "out")),
          TypeError,
          "outside of destination",
        );
        assertEquals(await exists(join(dir, "outside/evil.txt")), false);
      });
    },
  });
});
