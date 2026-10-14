import { build } from "vite";
import { createHash } from "node:crypto";
import { createShortcutSource } from "../src/shortcut/source.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const result = await build({
  configFile: false,
  envDir: false,
  logLevel: "error",
  build: {
    write: false,
    target: "safari16.4",
    minify: false,
    lib: {
      entry: fileURLToPath(
        new URL("../src/shortcut/entry.js", import.meta.url),
      ),
      name: "UemSafariShortcut",
      formats: ["iife"],
    },
  },
});
const output = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
const chunk = output.find((item) => item.type === "chunk" && item.isEntry);
if (!chunk || output.filter((item) => item.type === "chunk").length !== 1)
  throw new Error("Shortcut must be a single standalone script");
const directory = new URL("../src/generated/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("safari-shortcut.txt", directory), chunk.code);

await writeFile(
  new URL("safari-default.js", directory),
  createShortcutSource(chunk.code),
);
await writeFile(
  new URL("safari-apple-maps.js", directory),
  createShortcutSource(chunk.code, { addUniversityPrefix: true }),
);

if (process.argv.includes("--verify-installers")) {
  const sha256 = (data) => createHash("sha256").update(data).digest("hex");
  const install = new URL("../src/shortcut/install/", import.meta.url);
  const alerts = JSON.parse(
    await readFile(new URL("../src/shortcut/alerts.json", import.meta.url), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", install), "utf8"),
  );
  if (manifest.length !== alerts.length * 2)
    throw new Error("Missing reviewed Safari installers");
  for (const variant of ["default", "apple-maps"]) {
    for (const alert of alerts) {
      const item = manifest.find(
        (entry) => entry.variant === variant && entry.alert === alert.id,
      );
      if (!item) throw new Error(`Missing reviewed installer ${variant}/${alert.id}`);
      const script = await readFile(
        new URL(`safari-${variant}.js`, directory),
      );
      const signed = await readFile(new URL(item.file, install));
      if (
        sha256(script) !== item.scriptSha256 ||
        sha256(signed) !== item.signedSha256 ||
        signed.subarray(0, 4).toString() !== "AEA1" ||
        !item.payloadCompared
      ) {
        throw new Error(
          "Safari shortcut source changed: repackage, sign, and compare the installer before deployment.",
        );
      }
    }
  }
}
