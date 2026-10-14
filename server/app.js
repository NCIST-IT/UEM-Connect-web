import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContextCodec } from "./context.js";
import { createSchoolAuth } from "./school-auth.js";
import { getSemesters, getSchedule } from "./school-schedule.js";
import { AppError } from "../src/lib/errors.js";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_BODY = 2 * 1024 * 1024;
export function createApp({
  codec = createContextCodec(),
  schoolOptions = {},
  now = Date.now,
  publicOrigin = process.env.UEM_PUBLIC_ORIGIN,
  production = false,
} = {}) {
  // This is an expiring file relay, not a user/session store.
  const exports = new Map();
  function prune() {
    for (const [key, value] of exports)
      if (value.expiresAt <= now()) exports.delete(key);
  }
  const cleanup = setInterval(prune, 60000);
  cleanup.unref();
  function send(res, status, value) {
    res.writeHead(status, {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  async function readJson(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new AppError("DATA", "请求必须使用 JSON。");
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new AppError("DATA", "请求内容过大。");
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      if (
        Object.hasOwn(value, "password") ||
        Object.hasOwn(value, "credentials")
      )
        throw new AppError("DATA", "服务器不接受明文密码。");
      return value;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("DATA", "请求内容无效。");
    }
  }
  function authenticated(state) {
    if (
      state.phase !== "authenticated" ||
      !["undergraduate", "graduate"].includes(state.identity?.studentKind)
    )
      throw new AppError(
        "AUTH",
        "请先完成本次登录。",
        undefined,
        "CONTEXT_EXPIRED",
      );
  }
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      prune();
      if (
        /^\/api\/exports\/[A-Za-z0-9_-]{43}\.ics$/.test(path) &&
        ["GET", "HEAD"].includes(req.method)
      ) {
        const item = exports.get(path);
        if (!item) {
          send(res, 410, {
            code: "EXPORT_EXPIRED",
            message: "临时日历文件已过期，请重新登录导出。",
          });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/calendar;charset=utf-8",
          ...(url.searchParams.get("download") === "1"
            ? {
                "Content-Disposition":
                  "attachment; filename=\"timetable.ics\"; filename*=UTF-8''%E8%AF%BE%E8%A1%A8.ics",
              }
            : {}),
          "Content-Length": item.body.length,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        });
        res.end(req.method === "HEAD" ? undefined : item.body);
        return;
      }
      if (path.startsWith("/api/")) {
        if (req.method !== "POST") {
          send(res, 405, { message: "请求方法不支持。" });
          return;
        }
        // No application cookies or server sessions. Still reject cross-site JSON requests.
        const allowed = publicOrigin ?? `http://${req.headers.host}`;
        if (req.headers.origin !== allowed) {
          send(res, 403, {
            code: "ORIGIN",
            message: "请从本网站页面发起操作。",
          });
          return;
        }
        if (production && new URL(allowed).protocol !== "https:") {
          send(res, 503, { message: "正式环境需要配置 HTTPS 访问地址。" });
          return;
        }
        const input = await readJson(req);
        if (path === "/api/auth/prepare") {
          const username =
            typeof input.username === "string" ? input.username.trim() : "";
          if (!username || username.length > 128)
            throw new AppError("DATA", "请输入有效的学校账号。");
          const state = codec.fresh(username);
          const auth = createSchoolAuth(state, schoolOptions);
          const prepared = await auth.prepareLogin(username);
          state.prepared = compactPrepared(prepared);
          state.cookies = auth.transport.snapshot();
          send(res, 200, {
            context: codec.seal(state),
            encryptionSalt: prepared.page.pwdEncryptSalt,
            captchaRequired: prepared.captchaRequired,
            challenge: prepared.sliderChallenge,
          });
          return;
        }
        const state = codec.open(input.context);
        const auth = createSchoolAuth(state, schoolOptions);
        if (path === "/api/auth/captcha/refresh") {
          if (state.phase !== "prepare" || !state.prepared?.captchaRequired)
            throw new AppError("DATA", "当前不需要滑块验证。");
          const challenge = await auth.refreshSlider();
          state.prepared.sliderChallenge = compactChallenge(challenge);
          state.captchaVerified = false;
          state.cookies = auth.transport.snapshot();
          send(res, 200, { challenge, context: codec.seal(state) });
          return;
        }
        if (path === "/api/auth/captcha/verify") {
          if (state.phase !== "prepare" || !state.prepared?.sliderChallenge)
            throw new AppError("DATA", "请重新取得滑块挑战。");
          const payload = input.payload;
          if (
            !payload ||
            payload.canvasLength !== 280 ||
            !Number.isInteger(payload.moveLength) ||
            payload.moveLength < 0 ||
            payload.moveLength > 240 ||
            !Array.isArray(payload.tracks) ||
            payload.tracks.length < 2 ||
            payload.tracks.length > 2000 ||
            !payload.tracks.every(
              (t) =>
                t &&
                ["a", "b", "c"].every((k) => Number.isFinite(t[k])) &&
                t.c >= 0,
            )
          )
            throw new AppError("DATA", "滑动轨迹无效，请重新拖动。");
          state.captchaVerified = await auth.verifySlider(
            state.prepared.sliderChallenge,
            payload,
          );
          state.cookies = auth.transport.snapshot();
          send(res, 200, {
            verified: state.captchaVerified,
            context: codec.seal(state),
          });
          return;
        }
        if (path === "/api/auth/login") {
          if (state.phase !== "prepare" || !state.prepared)
            throw new AppError(
              "AUTH",
              "请重新登录。",
              undefined,
              "CONTEXT_EXPIRED",
            );
          if (state.prepared.captchaRequired && !state.captchaVerified)
            throw new AppError(
              "AUTH",
              "请先手动完成滑块验证。",
              undefined,
              "SLIDER_FAILED",
            );
          const encrypted = input.encryptedPassword;
          if (
            typeof encrypted !== "string" ||
            encrypted.length > 4096 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted) ||
            Buffer.from(encrypted, "base64").length < 80 ||
            Buffer.from(encrypted, "base64").length % 16 !== 0
          )
            throw new AppError("DATA", "请使用网页加密后提交密码。");
          const session = await auth.submitLogin(
            state.prepared,
            state.username,
            encrypted,
            false,
          );
          state.identity = {
            studentKind: session.studentKind,
            studentNumber: session.portalIdentity.studentNumber,
            name: session.portalIdentity.name,
          };
          state.phase = "authenticated";
          delete state.prepared;
          delete state.captchaVerified;
          state.cookies = auth.transport.snapshot();
          send(res, 200, {
            identity: state.identity,
            context: codec.seal(state),
          });
          return;
        }
        authenticated(state);
        if (path === "/api/semesters" || path === "/api/schedule") {
          const result =
            path === "/api/semesters"
              ? await getSemesters(state, auth.transport)
              : await getSchedule(
                  state,
                  auth.transport,
                  String(input.semesterId ?? ""),
                );
          state.cookies = auth.transport.snapshot();
          send(res, 200, { ...result, context: codec.seal(state) });
          return;
        }
        if (path === "/api/exports") {
          const ics = input.ics;
          if (
            typeof ics !== "string" ||
            !ics.startsWith("BEGIN:VCALENDAR\r\n") ||
            !ics.endsWith("END:VCALENDAR\r\n") ||
            !ics.includes("\r\nBEGIN:VEVENT\r\n") ||
            Buffer.byteLength(ics) > MAX_BODY - 65536
          )
            throw new AppError("DATA", "没有有效的日历文件可以导出。");
          if (exports.size >= 100)
            throw new AppError("BACKEND", "临时文件较多，请稍后重试。");
          const downloadPath = `/api/exports/${randomBytes(32).toString("base64url")}.ics`;
          const expiresAt = now() + 10 * 60 * 1000;
          exports.set(downloadPath, { body: Buffer.from(ics), expiresAt });
          send(res, 200, { url: downloadPath, expiresAt });
          return;
        }
        send(res, 404, { message: "接口不存在。" });
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        send(res, 405, { message: "请求方法不支持。" });
        return;
      }
      const file =
        path === "/" || path === "/index.html"
          ? "index.html"
          : /^\/assets\/[\w.-]+\.(js|css|svg|png|woff2|shortcut)$/.test(path)
            ? path.slice(1)
            : path === "/favicon.svg"
              ? "favicon.svg"
              : null;
      if (!file) {
        send(res, 404, { message: "页面不存在。" });
        return;
      }
      const bytes = await readFile(resolve(root, file));
      const types = {
        ".html": "text/html;charset=utf-8",
        ".js": "text/javascript;charset=utf-8",
        ".css": "text/css;charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".shortcut": "application/x-apple-shortcut",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)],
        ...(extname(file) === ".shortcut"
          ? {
              "Content-Disposition": `attachment; filename="UEM-Safari.shortcut"; filename*=UTF-8''${encodeURIComponent(file.includes("apple-maps") ? "应大通课表导出（地图适配）.shortcut" : "应大通课表导出.shortcut")}`,
            }
          : {}),
        ...(file === "index.html" ? { "Content-Language": "zh-CN" } : {}),
        "Content-Length": bytes.length,
        "Cache-Control":
          file === "index.html"
            ? "no-store"
            : "public,max-age=31536000,immutable",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      if (error instanceof AppError)
        send(
          res,
          error.kind === "AUTH" ? 401 : error.kind === "DATA" ? 400 : 502,
          { code: error.code, message: error.message },
        );
      else
        send(res, error.code === "ENOENT" ? 404 : 500, {
          code: "SERVER",
          message: "服务暂时无法完成请求，请重试。",
        });
    }
  }).on("close", () => {
    clearInterval(cleanup);
    exports.clear();
  });
}
function compactChallenge(challenge) {
  // Only the image's signing suffix is needed after rendering the challenge.
  return {
    ...challenge,
    bigImage: "",
    smallImage: Buffer.from(challenge.smallImage, "base64")
      .subarray(-16)
      .toString("base64"),
  };
}
function compactPrepared(prepared) {
  return {
    ...prepared,
    sliderChallenge: prepared.sliderChallenge
      ? compactChallenge(prepared.sliderChallenge)
      : null,
  };
}
