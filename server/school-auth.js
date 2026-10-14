// Protocol port from /srv/ncist. This module receives encrypted passwords only.
import { AppError } from "../src/lib/errors.js";
import { signSliderPayload } from "../src/lib/school-crypto.js";
import {
  AUTH_ORIGIN,
  PORTAL_ORIGIN,
  JWXT_ORIGIN,
  GMS_ORIGIN,
  createSchoolTransport,
} from "./transport.js";
import { adaptPortalIdentity } from "./portal-identity.js";
export function createSchoolAuth(state, options = {}) {
  const transport = createSchoolTransport(state.cookies, options);
  const {
    authFetch,
    clearNcistSessionCookies,
    cookieNames,
    getCookieValue,
    formBody,
  } = transport;
  const fetchPortalIdentity = async (username) => {
    const r = await authFetch(`${PORTAL_ORIGIN}/getLoginUser?_t=${Date.now()}`);
    if (!r.ok)
      throw new AppError(
        "AUTH",
        "门户会话不可用",
        undefined,
        "PORTAL_SESSION_MISSING",
      );
    return adaptPortalIdentity(await r.json(), username);
  };
  const PORTAL_TARGET = `${PORTAL_ORIGIN}/xs/index.html#/`;
  const PORTAL_LOGIN_SERVICE = `${PORTAL_ORIGIN}/login?portalService=${encodeURIComponent(PORTAL_TARGET)}`;
  const UNIFIED_AUTH_URL = `${AUTH_ORIGIN}/authserver/login?service=${encodeURIComponent(PORTAL_LOGIN_SERVICE)}`;
  const GMS_LOGIN_SERVICE = `${GMS_ORIGIN}/`;
  const GMS_UNIFIED_AUTH_URL = `${AUTH_ORIGIN}/authserver/login?service=${encodeURIComponent(GMS_LOGIN_SERVICE)}`;
  const AUTH_REFERER = UNIFIED_AUTH_URL;
  const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
  const MAX_REDIRECTS = 12;
  const ALLOWED_REDIRECT_ORIGINS = new Set([
    AUTH_ORIGIN,
    PORTAL_ORIGIN,
    JWXT_ORIGIN,
    GMS_ORIGIN,
  ]);
  function decodeHtml(value) {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  function inputValue(html, id) {
    const input = html.match(
      new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"),
    )?.[0];
    if (!input) return "";
    return decodeHtml(input.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? "");
  }
  function scriptValue(html, name) {
    return decodeHtml(
      html.match(
        new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']*)["']`, "i"),
      )?.[1] ?? "",
    );
  }
  function parseLoginPage(html) {
    const pwdEncryptSalt = inputValue(html, "pwdEncryptSalt");
    const execution = inputValue(html, "execution");
    const lt = inputValue(html, "lt");
    const captchaSwitch = scriptValue(html, "captchaSwitch");
    if (!/id=["']pwdFromId["']/i.test(html) || !pwdEncryptSalt || !execution) {
      throw new AppError(
        "BACKEND",
        "统一认证页面结构已发生变化，无法读取登录会话。",
        undefined,
        "AUTH_PROTOCOL",
      );
    }
    return {
      actionUrl: UNIFIED_AUTH_URL,
      serviceUrl: PORTAL_LOGIN_SERVICE,
      pwdEncryptSalt,
      execution,
      lt,
      captchaSwitch,
    };
  }
  function parseNumber(value, fallback = 0) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  async function openSliderChallenge() {
    const bootstrap = await authFetch(
      `${AUTH_ORIGIN}/authserver/common/toSliderCaptcha.htl`,
      {
        headers: { Referer: AUTH_REFERER },
      },
    );
    if (!bootstrap.ok) {
      throw new AppError(
        "BACKEND",
        "统一认证滑块组件暂时不可用。",
        undefined,
        "SLIDER_UNAVAILABLE",
      );
    }
    await bootstrap.text();
    const response = await authFetch(
      `${AUTH_ORIGIN}/authserver/common/openSliderCaptcha.htl`,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: AUTH_REFERER,
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );
    if (!response.ok) {
      throw new AppError(
        "BACKEND",
        "无法取得统一认证滑块挑战。",
        undefined,
        "SLIDER_UNAVAILABLE",
      );
    }
    const data = await response.json();
    if (
      typeof data.bigImage !== "string" ||
      typeof data.smallImage !== "string"
    ) {
      throw new AppError(
        "DATA",
        "统一认证返回的滑块挑战无法解析。",
        undefined,
        "AUTH_PROTOCOL",
      );
    }
    return {
      bigImage: data.bigImage,
      smallImage: data.smallImage,
      tagWidth: parseNumber(data.tagWidth),
      yHeight: parseNumber(data.yHeight),
    };
  }
  async function prepareLogin(username) {
    await clearNcistSessionCookies();
    const loginResponse = await authFetch(UNIFIED_AUTH_URL, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!loginResponse.ok) {
      throw new AppError(
        "BACKEND",
        "学校统一认证系统当前不可用。",
        undefined,
        "AUTH_UNAVAILABLE",
      );
    }
    const page = parseLoginPage(await loginResponse.text());
    const captchaResponse = await authFetch(
      `${AUTH_ORIGIN}/authserver/checkNeedCaptcha.htl?username=${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: AUTH_REFERER,
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );
    if (!captchaResponse.ok) {
      throw new AppError(
        "BACKEND",
        "统一认证无法判断验证码状态。",
        undefined,
        "AUTH_UNAVAILABLE",
      );
    }
    const captchaData = await captchaResponse.json();
    const captchaRequired =
      captchaData.isNeed === true || captchaData.isNeed === "true";
    if (captchaRequired && page.captchaSwitch !== "2") {
      throw new AppError(
        "BACKEND",
        "统一认证要求了当前 App 尚不支持的验证码类型。",
        undefined,
        "AUTH_PROTOCOL",
      );
    }
    return {
      page,
      captchaRequired,
      sliderChallenge: captchaRequired ? await openSliderChallenge() : null,
    };
  }
  async function refreshSlider() {
    return openSliderChallenge();
  }
  async function verifySlider(challenge, payload) {
    const response = await authFetch(
      `${AUTH_ORIGIN}/authserver/common/verifySliderCaptcha.htl`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: AUTH_REFERER,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: formBody({
          sign: signSliderPayload(payload, challenge.smallImage),
        }),
      },
    );
    if (!response.ok) {
      throw new AppError(
        "BACKEND",
        "滑块验证服务暂时不可用。",
        undefined,
        "SLIDER_UNAVAILABLE",
      );
    }
    const data = await response.json();
    return data.errorCode === 1 || data.errorCode === "1";
  }
  function extractLoginError(html) {
    if (!/id=["']pwdFromId["']/i.test(html)) {
      return new AppError(
        "AUTH",
        "统一认证失败，请稍后重试。",
        undefined,
        "AUTH_FAILED",
      );
    }
    const candidates = [
      ...html.matchAll(/id=["']showErrorTip["'][^>]*>([\s\S]*?)<\/span>/gi),
      ...html.matchAll(
        /class=["'][^"']*form-error[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
      ),
    ];
    const rawMessage =
      candidates
        .map((match) => match[1])
        .find((value) => value.replace(/<[^>]+>/g, "").trim()) ?? "";
    const message = decodeHtml(
      rawMessage
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    const normalized = message.toLowerCase();
    if (
      /密码|password|credential|用户名|username|账号|account/.test(normalized)
    ) {
      return new AppError(
        "AUTH",
        "用户名或密码错误。",
        undefined,
        "LOGIN_CREDENTIALS",
      );
    }
    if (/验证码|captcha|滑块/.test(normalized)) {
      return new AppError(
        "AUTH",
        "滑块验证已失效，请重新完成验证。",
        undefined,
        "SLIDER_FAILED",
      );
    }
    if (/execution|session|会话|expired|过期/.test(normalized)) {
      return new AppError(
        "AUTH",
        "登录会话已失效，请重新登录。",
        undefined,
        "AUTH_SESSION_EXPIRED",
      );
    }
    return new AppError(
      "AUTH",
      message || "统一认证未接受本次登录，请稍后重试。",
      undefined,
      "AUTH_FAILED",
    );
  }
  function readLocation(response, from) {
    const location = response.headers.get("location");
    if (!location) {
      throw new AppError(
        "AUTH",
        "统一认证返回了无效的跳转。",
        undefined,
        "AUTH_FAILED",
      );
    }
    return new URL(location, from).toString();
  }
  /**
   * 手动跟随认证跳转。仅允许 HTTPS 学校来源，并限制次数，防止凭据或票据被开放重定向带走。
   */
  async function followAuthenticationRedirects(initialResponse, initialUrl) {
    let response = initialResponse;
    let currentUrl = initialUrl;
    let casTicket = "";
    const redirects = [];
    for (let count = 0; REDIRECT_STATUSES.has(response.status); count += 1) {
      if (count >= MAX_REDIRECTS) {
        throw new AppError(
          "AUTH",
          "统一认证跳转次数异常。",
          undefined,
          "AUTH_FAILED",
        );
      }
      const rawNextUrl = readLocation(response, currentUrl);
      const nextUrl = rawNextUrl.replace(
        /^http:\/\/auth\.ncist\.edu\.cn\//i,
        `${AUTH_ORIGIN}/`,
      );
      const parsedNextUrl = new URL(nextUrl);
      if (
        parsedNextUrl.protocol !== "https:" ||
        !ALLOWED_REDIRECT_ORIGINS.has(parsedNextUrl.origin)
      ) {
        throw new AppError(
          "AUTH",
          "统一认证尝试跳转到非学校域名，已安全中止。",
          undefined,
          "AUTH_FAILED",
        );
      }
      const ticket = new URL(nextUrl).searchParams.get("ticket");
      if (ticket?.startsWith("ST-")) casTicket = ticket;
      redirects.push({
        status: response.status,
        from: currentUrl,
        to: nextUrl,
      });
      currentUrl = nextUrl;
      response = await authFetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
    }
    const body = await response.text();
    return { response, redirects, casTicket, body };
  }
  /**
   * 通过门户已经验证的 SSO 交接端点建立 ASP.NET 教务 Session，禁止回退到废弃的密码接口。
   */
  async function establishJwxtSession() {
    const existing = await getCookieValue(JWXT_ORIGIN, "EXESAC.SAAS.SessionId");
    if (existing) return { sessionId: existing, redirects: [] };
    const entryUrl = `${JWXT_ORIGIN}/LoginHandler.ashx`;
    const entryResponse = await authFetch(entryUrl, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: `${PORTAL_ORIGIN}/`,
      },
    });
    const followed = await followAuthenticationRedirects(
      entryResponse,
      entryUrl,
    );
    const sessionId = await getCookieValue(
      JWXT_ORIGIN,
      "EXESAC.SAAS.SessionId",
    );
    if (
      sessionId &&
      followed.response.ok &&
      new URL(followed.response.url).hostname === "jw.cidp.edu.cn"
    ) {
      return { sessionId, redirects: followed.redirects };
    }
    throw new AppError(
      "AUTH",
      "统一认证成功，但门户没有建立教务 Session。",
      undefined,
      "JWXT_SESSION_MISSING",
    );
  }
  /** 通过门户 SSO 进入研究生系统；登录阶段只建立业务会话，不读取课表。 */
  async function establishGmsSession() {
    // GMS 不是通过直接打开 enterMain 建立身份，而是作为独立 CAS service 换取一次性 ticket。
    // 统一认证已有 CASTGC 时不会再次要求密码，回跳 GMS 根路径后才会生成业务令牌。
    const entryUrl = GMS_UNIFIED_AUTH_URL;
    const entryResponse = await authFetch(entryUrl, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: `${PORTAL_ORIGIN}/`,
      },
    });
    const followed = await followAuthenticationRedirects(
      entryResponse,
      entryUrl,
    );
    const names = await cookieNames(`${GMS_ORIGIN}/grzxgl/`);
    // 这里只确认 SSO 回跳成功且 GMS 已下发业务 Cookie；课表/学期请求只能由课表页面按需触发。
    if (
      !followed.response.ok ||
      !names.includes("JSESSIONID") ||
      !names.includes("SSO_LOGIN") ||
      !names.includes("Admin-Token")
    ) {
      throw new AppError(
        "AUTH",
        "统一认证成功，但研究生管理系统会话不可用。",
        undefined,
        "GMS_SESSION_MISSING",
      );
    }
    return { cookieNames: names };
  }
  async function submitLogin(
    prepared,
    username,
    encryptedPassword,
    rememberMe,
  ) {
    const page = prepared.page;
    const response = await authFetch(page.actionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: AUTH_ORIGIN,
        Referer: AUTH_REFERER,
      },
      body: formBody({
        username,
        password: encryptedPassword,
        captcha: "",
        _eventId: "submit",
        cllt: "userNameLogin",
        dllt: "generalLogin",
        lt: page.lt,
        execution: page.execution,
        ...(rememberMe ? { rememberMe: true } : {}),
      }),
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      throw extractLoginError(await response.text());
    }
    const followed = await followAuthenticationRedirects(
      response,
      UNIFIED_AUTH_URL,
    );
    if (!followed.response.ok || !followed.casTicket) {
      throw new AppError(
        "AUTH",
        "统一认证没有返回有效的 CAS ticket。",
        undefined,
        "CAS_TICKET_MISSING",
      );
    }
    if (new URL(followed.response.url).hostname !== "my1.ncist.edu.cn") {
      throw new AppError(
        "AUTH",
        "门户 Session 建立失败。",
        undefined,
        "PORTAL_SESSION_MISSING",
      );
    }
    const portalCookieNames = await cookieNames(PORTAL_ORIGIN);
    if (portalCookieNames.length === 0) {
      throw new AppError(
        "AUTH",
        "门户 Session 建立失败。",
        undefined,
        "PORTAL_SESSION_MISSING",
      );
    }
    const portalIdentity = await fetchPortalIdentity(username);
    if (portalIdentity.studentKind === "unknown") {
      throw new AppError(
        "AUTH",
        "已登录信息门户，但暂时无法识别账号的学生类型。",
        undefined,
        "PORTAL_STUDENT_TYPE_UNKNOWN",
      );
    }
    if (portalIdentity.studentKind === "graduate") {
      const gms = await establishGmsSession();
      return {
        finalUrl: followed.response.url,
        portalCookieNames,
        portalIdentity,
        studentKind: "graduate",
        gmsCookieNames: gms.cookieNames,
        businessApiHost: "gms.ncist.edu.cn",
      };
    }
    const jwxt = await establishJwxtSession();
    return {
      finalUrl: followed.response.url,
      portalCookieNames,
      portalIdentity,
      studentKind: "undergraduate",
      jwxtSessionId: jwxt.sessionId,
      businessApiHost: "jw.cidp.edu.cn",
    };
  }
  const ncistAuth = {
    prepareLogin,
    refreshSlider,
    verifySlider,
    submitLogin,
  };

  return { ...ncistAuth, transport };
}
