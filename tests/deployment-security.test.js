import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { preview } from "vite";
import { productionHeaders } from "../config/security-headers.js";

let server;
let origin;

before(async () => {
  server = await preview({
    preview: { host: "0.0.0.0", port: 0, open: false },
  });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});

after(async () => {
  await server?.close();
});

function withHost(host) {
  return new Promise((resolve, reject) => {
    const req = request(origin, { headers: { Host: host } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

test("foreign origins receive no CORS permissions on pages or preflights", async () => {
  for (const method of ["GET", "OPTIONS"]) {
    const response = await fetch(origin, {
      method,
      headers: {
        Origin: "https://unrelated.example",
        ...(method === "OPTIONS" ? { "Access-Control-Request-Method": "GET" } : {}),
      },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    await response.arrayBuffer();
  }
});

test("unknown Host headers are rejected while the configured public host works", async () => {
  assert.equal(await withHost("unrelated.example"), 403);
  assert.equal(await withHost("nixos.tailbc211e.ts.net:8443"), 200);
});

test("preview and production nginx carry the same security policy", async () => {
  const response = await fetch(origin);
  for (const [name, value] of Object.entries(productionHeaders)) {
    assert.equal(response.headers.get(name), value);
  }
  await response.arrayBuffer();
  const nginx = await readFile(new URL("../deploy/nginx.conf", import.meta.url), "utf8");
  for (const [name, value] of Object.entries(productionHeaders)) {
    assert(nginx.includes(`add_header ${name} "${value}" always;`), `Nginx is missing ${name}`);
  }
  assert(!/^\s*add_header\s+Access-Control-Allow-/im.test(nginx));
});
