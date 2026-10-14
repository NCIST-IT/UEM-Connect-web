// Ported from UEM Connect; one jar per request, never a global user session.
function domainMatches(hostname, domain, hostOnly) {
  return hostname === domain || (!hostOnly && hostname.endsWith(`.${domain}`));
}
function pathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}
function defaultPath(pathname) {
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}
function splitSetCookieHeader(header) {
  return header
    .split(/,(?=\s*[^=;,\s]+=)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}
function setCookieHeaders(response) {
  const rawHeaders = response._rawHeaders
    ?.filter(([name]) => name.toLowerCase() === "set-cookie")
    .flatMap(([, value]) => splitSetCookieHeader(value));
  if (rawHeaders?.length) return rawHeaders;
  const headers = response.headers;
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie.call(headers)
      : [];
  if (values?.length) return values.flatMap(splitSetCookieHeader);
  const combined = response.headers.get("set-cookie");
  return combined ? splitSetCookieHeader(combined) : [];
}
export class CookieJar {
  cookies = new Map();
  sequence = 0;
  /** 删除 Jar 内全部 Cookie。 */
  exportSnapshot() {
    return {
      cookies: [...this.cookies.values()].map((cookie) => ({ ...cookie })),
    };
  }
  clear() {
    this.cookies.clear();
  }
  /** 导出指定域可用的 Cookie，供安全存储后恢复 GMS 会话。 */
  snapshot(url) {
    return { cookies: this.matching(url).map((cookie) => ({ ...cookie })) };
  }
  /** 从受信任的安全存储恢复指定域 Cookie。 */
  restore(snapshot, allowedOrigin) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !Array.isArray(snapshot.cookies)
    )
      return;
    const origin = new URL(allowedOrigin);
    for (const value of snapshot.cookies) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.name !== "string" ||
        typeof value.value !== "string"
      )
        continue;
      if (
        typeof value.domain !== "string" ||
        !domainMatches(origin.hostname, value.domain, value.hostOnly !== false)
      )
        continue;
      if (typeof value.path !== "string" || !value.path.startsWith("/"))
        continue;
      if (value.secure && origin.protocol !== "https:") continue;
      if (value.expiresAt !== null && typeof value.expiresAt !== "number")
        continue;
      const key = `${value.domain}\t${value.path}\t${value.name}`;
      this.cookies.set(key, { ...value, createdAt: this.sequence++ });
    }
  }
  /** 从响应的全部 Set-Cookie 头更新 Jar，并使用请求地址补全缺失范围。 */
  storeResponse(response, requestUrl) {
    // 手动跟随跳转时 Android expo/fetch 的 Response.url 可能保留上一跳；
    // requestUrl 才是实际收到 Set-Cookie 的请求地址，必须用它确定域和默认路径。
    const responseUrl = requestUrl;
    for (const header of setCookieHeaders(response)) {
      this.store(header, responseUrl);
    }
  }
  /** 返回指定地址可发送的 Cookie 名称，去重并排序。 */
  names(url) {
    return [...new Set(this.matching(url).map((cookie) => cookie.name))].sort();
  }
  /** 返回指定地址下某个 Cookie 的首个匹配值。 */
  value(url, name) {
    return (
      this.matching(url).find((cookie) => cookie.name === name)?.value ?? null
    );
  }
  /** 按路径长度和创建顺序生成符合请求范围的 Cookie 请求头。 */
  header(url) {
    return this.matching(url)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }
  /** 清理过期项，并按 Secure、域名和路径规则筛选可发送项。 */
  matching(url) {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const now = Date.now();
    const matching = [];
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (cookie.secure && parsedUrl.protocol !== "https:") continue;
      if (!domainMatches(hostname, cookie.domain, cookie.hostOnly)) continue;
      if (!pathMatches(parsedUrl.pathname || "/", cookie.path)) continue;
      matching.push(cookie);
    }
    return matching.sort(
      (left, right) =>
        right.path.length - left.path.length ||
        left.createdAt - right.createdAt,
    );
  }
  /** 解析并保存单条 Set-Cookie；拒绝跨域设置并处理过期删除语义。 */
  store(header, responseUrl) {
    const url = new URL(responseUrl);
    const parts = header.split(";");
    const nameValue = parts.shift()?.trim() ?? "";
    const separator = nameValue.indexOf("=");
    if (separator <= 0) return;
    const name = nameValue.slice(0, separator).trim();
    const value = nameValue.slice(separator + 1).trim();
    if (!name) return;
    const attributes = new Map();
    for (const part of parts) {
      const attribute = part.trim();
      if (!attribute) continue;
      const attributeSeparator = attribute.indexOf("=");
      if (attributeSeparator < 0) {
        attributes.set(attribute.toLowerCase(), "");
      } else {
        attributes.set(
          attribute.slice(0, attributeSeparator).trim().toLowerCase(),
          attribute.slice(attributeSeparator + 1).trim(),
        );
      }
    }
    const responseHost = url.hostname.toLowerCase();
    const domainAttribute = attributes
      .get("domain")
      ?.replace(/^\./, "")
      .toLowerCase();
    const domain = domainAttribute || responseHost;
    const hostOnly = !domainAttribute;
    if (!domainMatches(responseHost, domain, false)) return;
    const pathAttribute = attributes.get("path");
    const path = pathAttribute?.startsWith("/")
      ? pathAttribute
      : defaultPath(url.pathname);
    const maxAge = attributes.get("max-age");
    const expires = attributes.get("expires");
    let expiresAt = null;
    if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) {
      const seconds = Number(maxAge);
      expiresAt = seconds <= 0 ? 0 : Date.now() + seconds * 1000;
    } else if (expires) {
      const parsedExpires = Date.parse(expires);
      if (!Number.isNaN(parsedExpires)) expiresAt = parsedExpires;
    }
    const key = `${domain}\t${path}\t${name}`;
    if (expiresAt !== null && expiresAt <= Date.now()) {
      this.cookies.delete(key);
      return;
    }
    const previous = this.cookies.get(key);
    this.cookies.set(key, {
      name,
      value,
      domain,
      path,
      hostOnly,
      secure: attributes.has("secure"),
      expiresAt,
      createdAt: previous?.createdAt ?? this.sequence++,
    });
  }
}
