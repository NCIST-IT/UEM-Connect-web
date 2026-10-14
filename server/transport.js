import { CookieJar } from "./cookie-jar.js";
import { AppError, toAppError } from "../src/lib/errors.js";

export const AUTH_ORIGIN = "https://auth.ncist.edu.cn";
export const PORTAL_ORIGIN = "https://my1.ncist.edu.cn";
export const JWXT_ORIGIN = "https://jw.cidp.edu.cn";
export const GMS_ORIGIN = "https://gms.ncist.edu.cn";
const origins = new Set([AUTH_ORIGIN, PORTAL_ORIGIN, JWXT_ORIGIN, GMS_ORIGIN]);
const redirects = new Set([301, 302, 303, 307, 308]);
export const formBody = (values) =>
  new URLSearchParams(
    Object.entries(values).map(([k, v]) => [k, String(v)]),
  ).toString();

export function createSchoolTransport(
  snapshot,
  { fetchImpl = fetch, timeoutMs = 30000 } = {},
) {
  const jar = new CookieJar();
  for (const origin of origins) jar.restore(snapshot, origin);
  async function authFetch(input, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let url = input;
    let method = init.method ?? "GET";
    let body = init.body;
    const headers = new Headers(init.headers);
    try {
      for (let hop = 0; hop <= 12; hop++) {
        const parsed = new URL(url);
        if (
          parsed.protocol !== "https:" ||
          !origins.has(parsed.origin) ||
          parsed.username ||
          parsed.password
        ) {
          throw new AppError(
            "AUTH",
            "学校返回了不允许的地址。",
            undefined,
            "AUTH_REDIRECT",
          );
        }
        const sent = new Headers(headers);
        const cookies = jar.header(url);
        if (cookies) sent.set("Cookie", cookies);
        else sent.delete("Cookie");
        const response = await fetchImpl(url, {
          ...init,
          method,
          body,
          headers: sent,
          redirect: "manual",
          signal: controller.signal,
        });
        jar.storeResponse(response, url);
        // Buffer under the same timeout: a slow response body must not escape the deadline.
        const reader = response.body?.getReader();
        let size = 0;
        const chunks = [];
        if (reader)
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4 * 1024 * 1024) {
              await reader.cancel();
              throw new AppError("DATA", "学校响应过大，无法安全读取。");
            }
            chunks.push(value);
          }
        const bytes = Buffer.concat(chunks);
        const charset =
          response.headers
            .get("content-type")
            ?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
        const content = new TextDecoder(charset).decode(bytes);
        Object.defineProperty(response, "url", { value: url });
        response.text = async () => content;
        response.json = async () => JSON.parse(content);
        if (!redirects.has(response.status) || init.redirect === "manual")
          return response;
        if (init.redirect === "error")
          throw new AppError("AUTH", "不允许学校跳转。");
        const location = response.headers.get("location");
        if (!location) throw new AppError("AUTH", "学校跳转缺少地址。");
        url = new URL(location, url).toString();
        if (
          response.status === 303 ||
          ([301, 302].includes(response.status) && method === "POST")
        ) {
          method = "GET";
          body = undefined;
          headers.delete("Content-Type");
          headers.delete("Content-Length");
        }
      }
      throw new AppError("AUTH", "学校跳转次数过多。");
    } catch (error) {
      throw toAppError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    authFetch,
    formBody,
    jar,
    cookieNames: async (url) => jar.names(url),
    getCookieValue: async (url, name) => jar.value(url, name),
    clearNcistSessionCookies: async () => jar.clear(),
    snapshot: () => jar.exportSnapshot(),
  };
}
