// Explicit release command only. Never called by dev/build/test or user exports.
// Sends the reviewed program definition (no user data) to RoutineHub HubSign.
import { readFile, writeFile } from "node:fs/promises";
const directory = new URL("../.local/shortcut-packages/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("unsigned-manifest.json", directory), "utf8"),
);
if (!Array.isArray(manifest) || !manifest.length)
  throw new Error("Run pnpm shortcut:package before signing");
for (const item of manifest) {
  const shortcut = await readFile(new URL(item.unsigned, directory), "utf8");
  const response = await fetch("https://hubsign.routinehub.services/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "cherri/1.0",
      Origin: "https://routinehub.co",
      Referer: "https://routinehub.co/",
    },
    body: JSON.stringify({ shortcutName: item.name, shortcut }),
    signal: AbortSignal.timeout(30000),
  });
  const data = Buffer.from(await response.arrayBuffer());
  if (
    !response.ok ||
    data.length > 256 * 1024 ||
    data.subarray(0, 4).toString() !== "AEA1"
  )
    throw new Error(
      `Signing failed for ${item.variant}/${item.alert}: HTTP ${response.status}; no installer published`,
    );
  await writeFile(
    new URL(item.unsigned.replace(".unsigned.shortcut", ".signed.shortcut"), directory),
    data,
  );
  console.log(
    `${item.variant}/${item.alert}: signed archive received; run verify-safari-shortcut.py before publishing.`,
  );
}
