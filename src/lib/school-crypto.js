import { cbc } from "@noble/ciphers/aes.js";
const getRandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));
const AES_CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const textEncoder = new TextEncoder();
function randomString(length) {
  const random = getRandomBytes(length);
  let value = "";
  for (const byte of random) {
    value += AES_CHARS[byte % AES_CHARS.length];
  }
  return value;
}
function bytesToBase64(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const value = (a << 16) | (b << 8) | c;
    output += BASE64_CHARS[(value >> 18) & 63];
    output += BASE64_CHARS[(value >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_CHARS[(value >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_CHARS[value & 63] : "=";
  }
  return output;
}
function base64ToBytes(value) {
  const normalized = value.replace(/\s+/g, "").replace(/=+$/, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const index = BASE64_CHARS.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
export function encryptPassword(value, salt) {
  const key = textEncoder.encode(salt.trim());
  if (key.length !== 16) {
    throw new Error("The authentication server supplied an invalid AES key.");
  }
  const iv = textEncoder.encode(randomString(16));
  const plaintext = textEncoder.encode(`${randomString(64)}${value}`);
  return bytesToBase64(cbc(key, iv).encrypt(plaintext));
}
export function sliderKeyFromImage(smallImage) {
  const bytes = base64ToBytes(smallImage);
  if (bytes.length < 16) {
    throw new Error("The slider challenge did not contain a signing key.");
  }
  return Array.from(bytes.slice(-16), (byte) => String.fromCharCode(byte)).join(
    "",
  );
}
export function signSliderPayload(payload, smallImage) {
  return encryptPassword(
    JSON.stringify(payload),
    sliderKeyFromImage(smallImage),
  );
}
