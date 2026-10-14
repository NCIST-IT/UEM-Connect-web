import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { AppError } from "../src/lib/errors.js";

const LIFETIME = 30 * 60 * 1000;
export function createContextCodec({
  key = randomBytes(32),
  now = Date.now,
} = {}) {
  const seal = (value) => {
    // Contexts cannot accidentally acquire a password or encrypted password.
    const forbidden = /"(?:password|encryptedPassword|credentials)"\s*:/i;
    const json = JSON.stringify(value);
    if (forbidden.test(json))
      throw new Error("Credentials cannot be stored in a context");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("uem-context-v1"));
    const body = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  };
  const open = (token) => {
    try {
      if (
        typeof token !== "string" ||
        token.length > 1_000_000 ||
        !/^[\w-]+$/.test(token)
      )
        throw new Error();
      const bytes = Buffer.from(token, "base64url");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from("uem-context-v1"));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const state = JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      );
      if (
        !Number.isSafeInteger(state.expiresAt) ||
        state.expiresAt <= now() ||
        state.expiresAt > now() + LIFETIME ||
        state.version !== 1
      )
        throw new Error();
      return state;
    } catch {
      throw new AppError(
        "AUTH",
        "本次流程已过期，请重新登录。",
        undefined,
        "CONTEXT_EXPIRED",
      );
    }
  };
  return {
    seal,
    open,
    fresh: (username) => ({
      version: 1,
      username,
      expiresAt: now() + LIFETIME,
      cookies: { cookies: [] },
      phase: "prepare",
    }),
  };
}
