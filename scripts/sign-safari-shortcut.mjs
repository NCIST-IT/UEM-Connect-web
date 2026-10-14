// Explicit release command only. Never called by dev/build/test or user exports.
// Sends the reviewed program definition (no user data) to RoutineHub HubSign.
import { readFile, writeFile } from "node:fs/promises";
const directory = new URL("../.local/shortcut-packages/", import.meta.url);
for (const variant of ["default", "apple-maps"]) {
  const shortcut = await readFile(
    new URL(`safari-${variant}.unsigned.shortcut`, directory),
    "utf8",
  );
  const shortcutName =
    variant === "default" ? "应大通课表导出" : "应大通课表导出（地图适配）";
  const response = await fetch("https://hubsign.routinehub.services/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "cherri/1.0",
      Origin: "https://routinehub.co",
      Referer: "https://routinehub.co/",
    },
    body: JSON.stringify({ shortcutName, shortcut }),
    signal: AbortSignal.timeout(30000),
  });
  const data = Buffer.from(await response.arrayBuffer());
  if (
    !response.ok ||
    data.length > 256 * 1024 ||
    data.subarray(0, 4).toString() !== "AEA1"
  )
    throw new Error(
      `Signing failed: HTTP ${response.status}; no installer published`,
    );
  await writeFile(
    new URL(`safari-${variant}.signed.shortcut`, directory),
    data,
  );
  console.log(
    `${variant}: signed archive received; run verify-safari-shortcut.py before publishing.`,
  );
}
