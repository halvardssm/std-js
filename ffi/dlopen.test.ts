import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  cacheRemoteFile,
  getCachePath,
  getFileOptions,
  urlToPathSegments,
  withoutExt,
} from "./dlopen.ts";
import { join } from "@std/path";

const TEST_FILE_URL =
  "https://raw.githubusercontent.com/halvardssm/std-js/refs/tags/0.0.1/README.md";
const TEST_ZIP_URL =
  "https://github.com/halvardssm/std-js/archive/refs/tags/0.0.1.zip";

// `Deno.build` is read-only in the typings, and the tests mock the os
// detection by replacing it.
const denoWithWritableBuild = Deno as unknown as {
  build: typeof Deno.build;
};

Deno.test("getFileOptions", async (t) => {
  await t.step("returns correct file options for current os/arch", () => {
    const result = getFileOptions({
      darwin: {
        x86_64: { url: "https://example.com/lib" },
        aarch64: { url: "https://example.com/lib" },
      },
      linux: {
        x86_64: { url: "https://example.com/lib" },
        aarch64: { url: "https://example.com/lib" },
      },
      windows: {
        x86_64: { url: "https://example.com/lib" },
        aarch64: { url: "https://example.com/lib" },
      },
    });

    assertEquals(result?.url?.toString(), "https://example.com/lib");
  });

  await t.step("throws error when os/arch not found", () => {
    assertThrows(
      () => {
        getFileOptions({});
      },
      TypeError,
      `File options for current os/arch '${Deno.build.os}/${Deno.build.arch}' not provided`,
    );
  });
});

Deno.test("cacheRemoteFile", async (t) => {
  await t.step("caches remote file successfully", async () => {
    const testCacheDir = await Deno.makeTempDir();

    const result = await cacheRemoteFile(
      {
        url: TEST_FILE_URL,
        type: "lib",
      },
      {
        path: testCacheDir,
        cacheControl: "reload",
      },
    );

    const content = await Deno.readTextFile(result);
    assert(
      content.startsWith("# Deno Standard Library Extended"),
      "Cached file should match the readme",
    );
  });

  await t.step("handles zip files and extracts them", async () => {
    const testCacheDir = await Deno.makeTempDir();

    const result = await cacheRemoteFile({
      url: TEST_ZIP_URL,
      type: "zip",
      archivePath: "stdext-0.0.1/README.md",
    }, {
      path: testCacheDir,
      cacheControl: "reload",
    });

    const content = await Deno.readTextFile(result);
    assert(
      content.startsWith("# Deno Standard Library Extended"),
      "Cached file should match the readme",
    );
  });

  await t.step("extracts archives with the default cache control", async () => {
    const testCacheDir = await Deno.makeTempDir();

    const result = await cacheRemoteFile({
      url: TEST_ZIP_URL,
      type: "zip",
      archivePath: "stdext-0.0.1/README.md",
    }, {
      path: testCacheDir,
    });

    const content = await Deno.readTextFile(result);
    assert(
      content.startsWith("# Deno Standard Library Extended"),
      "The file within the extracted archive should be returned",
    );

    await Deno.remove(testCacheDir, { recursive: true });
  });

  await t.step("reuses the extracted archive on later calls", async () => {
    const testCacheDir = await Deno.makeTempDir();

    const first = await cacheRemoteFile({
      url: TEST_ZIP_URL,
      type: "zip",
      archivePath: "stdext-0.0.1/README.md",
    }, {
      path: testCacheDir,
    });
    const second = await cacheRemoteFile({
      url: TEST_ZIP_URL,
      type: "zip",
      archivePath: "stdext-0.0.1/README.md",
    }, {
      path: testCacheDir,
    });

    assertEquals(first, second);
    const content = await Deno.readTextFile(second);
    assert(
      content.startsWith("# Deno Standard Library Extended"),
      "The file within the extracted archive should be returned",
    );

    await Deno.remove(testCacheDir, { recursive: true });
  });

  await t.step("throws error when zip file missing path", async () => {
    await assertRejects(
      async () => {
        await cacheRemoteFile({
          url: TEST_ZIP_URL,
          type: "zip" as const,
          // path is missing
        }, {
          cacheControl: "reload" as const,
        });
      },
      TypeError,
      "When using file type zip, path needs to be provided",
    );
  });

  await t.step("throws error when file not found in archive", async () => {
    const testCacheDir = await Deno.makeTempDir();

    await assertRejects(
      async () => {
        await cacheRemoteFile({
          url: TEST_ZIP_URL,
          type: "zip" as const,
          archivePath: "nonexistent/file.txt",
        }, {
          path: testCacheDir,
          cacheControl: "reload" as const,
        });
      },
      TypeError,
      "Library not found in archive",
    );
  });
});

Deno.test("getCachePath", async (t) => {
  await t.step("returns custom path when provided", async () => {
    const customPath = "/custom/cache/path";
    const result = await getCachePath(customPath);
    assertEquals(result, customPath);
  });

  await t.step("returns default cache path when no custom path", async () => {
    const originalDenoDir = Deno.env.get("DENO_DIR");
    const originalHome = Deno.env.get("HOME");
    const originalBuild = Deno.build;

    try {
      // Mock environment with a real temporary directory
      const tempDir = await Deno.makeTempDir();
      Deno.env.delete("DENO_DIR");
      Deno.env.set("HOME", tempDir);

      // Override os detection
      denoWithWritableBuild.build = { ...originalBuild, os: "linux" };

      const result = await getCachePath();
      assertEquals(result, join(tempDir, ".cache/deno/stdext_dlopen_cache"));
    } finally {
      // Restore environment
      if (originalDenoDir) {
        Deno.env.set("DENO_DIR", originalDenoDir);
      }
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      }
      denoWithWritableBuild.build = originalBuild;
    }
  });
});

Deno.test("urlToPathSegments", () => {
  const url = new URL(
    "https://user:pass@sub.github.com:123/halvardssm/std-js/blob/0.0.1/README.md?t=a&b=2#asdf",
  );
  const result = urlToPathSegments(url);
  assertEquals(
    result,
    "https/sub.github.com/halvardssm/std-js/blob/0.0.1/README.md",
  );
});

Deno.test("withoutExt", () => {
  assertEquals(withoutExt("/path/to/file.txt"), "/path/to/file");
  assertEquals(withoutExt("/path/to/file.txt.ts"), "/path/to/file.txt");
  assertEquals(withoutExt("/path/to.path/file"), "/path/to.path/file");
  assertEquals(withoutExt("/path/to.path/file..txt"), "/path/to.path/file");
});
