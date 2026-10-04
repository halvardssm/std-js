import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { cacheFile, denoCacheDir, homeDir } from "./cache.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";

const TEST_FILE_URL =
  "https://raw.githubusercontent.com/halvardssm/std-js/refs/tags/0.0.1/README.md";

// `Deno.build` is read-only in the typings, and the tests mock the os
// detection by replacing it.
const denoWithWritableBuild = Deno as unknown as {
  build: typeof Deno.build;
};

const ENV_VARS = ["DENO_DIR", "HOME", "XDG_CACHE_HOME", "USERPROFILE"];

/**
 * Run a function with a mocked os and environment, restoring both afterwards.
 * All of the environment variables used for cache dir detection are cleared
 * first, and only the given ones are set.
 */
async function withMockedEnvironment(
  os: typeof Deno.build.os,
  env: Record<string, string>,
  fn: () => Promise<void> | void,
): Promise<void> {
  const originalBuild = Deno.build;
  const originalEnv = new Map(
    ENV_VARS.map((name) => [name, Deno.env.get(name)]),
  );
  try {
    for (const name of ENV_VARS) Deno.env.delete(name);
    denoWithWritableBuild.build = { ...originalBuild, os };
    for (const [name, value] of Object.entries(env)) Deno.env.set(name, value);
    await fn();
  } finally {
    denoWithWritableBuild.build = originalBuild;
    for (const [name, value] of originalEnv) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

Deno.test("denoCacheDir", async (t) => {
  await t.step(
    "returns DENO_DIR env var when set",
    async () =>
      await withMockedEnvironment(
        "linux",
        { DENO_DIR: "/custom/deno/cache" },
        async () => {
          assertEquals(await denoCacheDir(), "/custom/deno/cache");
        },
      ),
  );

  await t.step(
    "returns the default cache dir",
    async () =>
      await withMockedEnvironment("linux", { HOME: "/home/test" }, async () => {
        assertEquals(await denoCacheDir(), "/home/test/.cache/deno");
      }),
  );

  await t.step(
    "uses the deno dir directly on windows",
    async () =>
      await withMockedEnvironment(
        "windows",
        { USERPROFILE: "/users/test" },
        async () => {
          assertEquals(await denoCacheDir(), join("/users/test", "deno"));
        },
      ),
  );

  await t.step(
    "uses the application support dir on darwin",
    async () =>
      await withMockedEnvironment(
        "darwin",
        { HOME: "/home/test" },
        async () => {
          assertEquals(await denoCacheDir(), "/home/test/Library/Caches/deno");
        },
      ),
  );

  await t.step(
    "falls back to XDG_CACHE_HOME without HOME",
    async () =>
      await withMockedEnvironment(
        "linux",
        { XDG_CACHE_HOME: "/xdg/cache" },
        async () => {
          assertEquals(await denoCacheDir(), join("/xdg/cache", "deno"));
        },
      ),
  );

  await t.step(
    "creates directory when ensure option is true",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        await withMockedEnvironment("linux", { HOME: tempDir }, async () => {
          const expectedPath = join(tempDir, ".cache/deno");
          assertEquals(await denoCacheDir({ ensure: true }), expectedPath);

          assert(
            await exists(expectedPath),
            "Directory should be created when ensure option is true",
          );
        });
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  );

  await t.step(
    "throws error when throws option is true and directory doesn't exist",
    async () =>
      await withMockedEnvironment(
        "linux",
        { HOME: "/nonexistent" },
        async () => {
          await assertRejects(
            async () => {
              await denoCacheDir({ throws: true });
            },
            TypeError,
            "Cache dir not found",
          );
        },
      ),
  );
});

Deno.test("homeDir", async (t) => {
  await t.step(
    "returns HOME on posix",
    async () =>
      await withMockedEnvironment("linux", { HOME: "/home/test" }, () => {
        assertEquals(homeDir(), "/home/test");
      }),
  );

  await t.step(
    "falls back to XDG_CACHE_HOME when HOME is not set",
    async () =>
      await withMockedEnvironment(
        "linux",
        { XDG_CACHE_HOME: "/xdg/cache" },
        () => {
          assertEquals(homeDir(), "/xdg/cache");
        },
      ),
  );

  await t.step(
    "returns USERPROFILE on windows",
    async () =>
      await withMockedEnvironment(
        "windows",
        { USERPROFILE: "/users/test" },
        () => {
          assertEquals(homeDir(), "/users/test");
        },
      ),
  );

  await t.step(
    "throws when no home dir can be determined",
    async () =>
      await withMockedEnvironment("linux", {}, () => {
        assertThrows(
          () => homeDir(),
          TypeError,
          "Home dir can not be determined",
        );
      }),
  );
});

Deno.test("cacheFile", async (t) => {
  const testCacheDir = await Deno.makeTempDir();
  const testFilePath = join(testCacheDir, "README.md");

  await t.step(
    "throws error when cacheControl is 'cachedOnly' and file doesn't exist",
    async () => {
      await assertRejects(
        async () => {
          await cacheFile(TEST_FILE_URL, testFilePath, {
            cacheControl: "cachedOnly",
          });
        },
        Error,
        "No cached file found",
      );
    },
  );

  await t.step(
    "downloads and caches file when it doesn't exist",
    async () => {
      const cachedPath = await cacheFile(TEST_FILE_URL, testFilePath);

      const content = await Deno.readTextFile(cachedPath);
      assert(
        content.startsWith("# Deno Standard Library Extended"),
        "Cached file should match the readme",
      );
    },
  );

  await t.step(
    "uses existing cached file when cacheControl is 'cachedOnly'",
    async () => {
      const originalStats = await Deno.stat(testFilePath);

      await cacheFile(TEST_FILE_URL, testFilePath, {
        cacheControl: "cachedOnly",
      });

      const cachedStats = await Deno.stat(testFilePath);

      assertEquals(originalStats.ino, cachedStats.ino);
      assertEquals(originalStats.mtime, cachedStats.mtime);
    },
  );

  await t.step(
    "returns existing cached file when cacheControl is default",
    async () => {
      const originalStats = await Deno.stat(testFilePath);

      const cachedPath = await cacheFile(TEST_FILE_URL, testFilePath);

      const cachedStats = await Deno.stat(testFilePath);

      assertEquals(originalStats.ino, cachedStats.ino);
      assertEquals(originalStats.mtime, cachedStats.mtime);

      const content = await Deno.readTextFile(cachedPath);
      assert(
        content.startsWith("# Deno Standard Library Extended"),
        "Cached file should match the readme",
      );
    },
  );

  await t.step("reloads file when cacheControl is 'reload'", async () => {
    // Corrupt the cached file to prove that the reload fetches a fresh copy
    // from the remote. Inode and mtime based comparisons are unreliable here,
    // as filesystems may reuse the freed inode or share millisecond mtimes.
    await Deno.writeTextFile(testFilePath, "stale content");

    const cachedPath = await cacheFile(TEST_FILE_URL, testFilePath, {
      cacheControl: "reload",
    });

    const content = await Deno.readTextFile(cachedPath);
    assert(
      content.startsWith("# Deno Standard Library Extended"),
      "Cached file should match the readme",
    );
  });

  await t.step(
    "throws error when remote file cannot be fetched",
    async () => {
      const invalidUrl =
        "https://raw.githubusercontent.com/halvardssm/std-js/refs/tags/0.0.1/NONEXISTENT.md";
      const invalidPath = join(testCacheDir, "NONEXISTENT.md");

      await assertRejects(
        async () => {
          await cacheFile(invalidUrl, invalidPath);
        },
        Error,
        "Error fetching remote file",
      );
    },
  );
});
