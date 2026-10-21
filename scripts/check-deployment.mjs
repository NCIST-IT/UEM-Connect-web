import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const routes = new Set(["navigation", "app", "downloads", "shortcut"]);

function publicUrl(value) {
  const url = new URL(value);
  assert(["https:", "http:"].includes(url.protocol), `Unsafe URL protocol: ${value}`);
  assert(!url.username && !url.password, `Credentials in URL: ${url.hostname}`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  assert(!/^(localhost|.*\.localhost)$/.test(host) && !host.endsWith(".local"), `Local hostname: ${host}`);
  if (isIP(host) === 4) {
    const [a, b, c] = host.split(".").map(Number);
    assert(
      a !== 0 && a !== 10 && a !== 127 && a < 224 &&
      !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && (b === 18 || b === 19)) &&
      !(a === 192 && b === 0 && (c === 0 || c === 2)) &&
      !(a === 198 && b === 51 && c === 100) && !(a === 203 && b === 0 && c === 113),
      `Non-public IPv4 address: ${host}`,
    );
  } else if (isIP(host) === 6) {
    assert(!/^(::|::1|::ffff:.*|f[cd].*|fe[89ab].*)$/.test(host), `Non-public IPv6 address: ${host}`);
  }
}

const resources = JSON.parse(await readFile(path.join(root, "src/data/resources.json"), "utf8"));
// sites.js imports JSON through Vite, so inspect its fixed links without executing it.
const siteSource = await readFile(path.join(root, "src/data/sites.js"), "utf8");
const unique = new Set();
for (const item of resources.items) {
  publicUrl(item.url);
  assert(!unique.has(item.url), `Duplicate directory URL: ${item.url}`);
  unique.add(item.url);
}
for (const match of siteSource.matchAll(/url: "#([^"]+)"/g)) {
  assert(routes.has(match[1]), `Unknown internal route: ${match[1]}`);
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
}

const files = await walk(dist);
const fileSet = new Set(files.map((file) => "/" + path.relative(dist, file).split(path.sep).join("/")));
for (const file of files) {
  const relative = path.relative(dist, file);
  assert(!relative.split(path.sep).some((part) => part.startsWith(".")), `Hidden file published: ${relative}`);
  assert(!/\.(?:map|pem|key|p12|pfx)$/.test(file), `Sensitive or source-map file published: ${relative}`);
  const bytes = await readFile(file);
  const text = bytes.toString("utf8");
  assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), `Private key published: ${relative}`);
  if (!/\.(?:html|css|js)$/.test(file)) continue;
  for (const match of text.matchAll(/https?:\/\/[^\s"'`<>\\)]+/g)) publicUrl(match[0]);
  for (const match of text.matchAll(/["'(](\/(?:images|assets)\/[^\s"'`)]+)["')]/g)) {
    assert(fileSet.has(match[1]), `Missing same-origin asset in ${relative}: ${match[1]}`);
  }
}
const html = await readFile(path.join(dist, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert(match[1].startsWith("/") && !match[1].startsWith("//"), `Entrypoint asset is not same-origin: ${match[1]}`);
  assert(fileSet.has(match[1]), `Missing entrypoint asset: ${match[1]}`);
}
const installers = files.filter((file) => file.endsWith(".shortcut"));
assert.equal(installers.length, 22, "Expected all 22 signed shortcut downloads");
for (const installer of installers) assert((await stat(installer)).size > 0, `Empty shortcut: ${installer}`);
console.log(`Deployment checks passed: ${unique.size} public directory URLs, 4 hash routes, ${files.length} files, 22 shortcut downloads; no local-address URLs or source maps.`);
