import { normalizeSchedule, dateOrdinal } from "./schedule-model.js";
// Browser-only APIs: TextEncoder, btoa, Blob, URL and document. No backend or dependencies.
const encoder = new TextEncoder();
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const CHINA_TIME_ZONE = "Asia/Shanghai";

function text(value) {
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError("文本字段必须是字符串或数字");
  }
  const result = String(value);
  // Reject RFC-disallowed controls while allowing tab and line breaks in TEXT.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    throw new TypeError("文本字段包含不允许的控制字符");
  }
  return result;
}

// RFC 5545 §3.3.11: escape TEXT values before folding content lines.
function escapeText(value) {
  return text(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// RFC 5545 §3.1: 75 UTF-8 octets including a continuation line's leading space.
// Iterate code points so folding never splits a multibyte character.
function foldLine(line) {
  const parts = [];
  let part = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      parts.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join("\r\n");
}

function integer(value, field, min, max = Number.MAX_SAFE_INTEGER) {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new TypeError(`${field} 必须是 ${min} 至 ${max} 之间的整数`);
  }
  return number;
}

function semesterMonday(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(
      "StartDay / semesterStartDate 必须为 YYYY-MM-DD 格式的第一周周一",
    );
  }
  // Parse a school calendar date without using the browser's local timezone.
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new TypeError(`无效的学期起始日期：${value}`);
  }
  if (date.getUTCFullYear() < 1 || date.getUTCDay() !== 1) {
    throw new TypeError(`学期第一周起始日期必须是周一：${value}`);
  }
  return date.getTime();
}

function utcDateTime(milliseconds) {
  const date = new Date(milliseconds);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.getUTCFullYear() > 9999
  ) {
    throw new RangeError("事件日期超出 iCalendar 可表示的范围");
  }
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

// Encode the entire stable identity, avoiding lossy hashes and secure-context requirements.
// UIDs may exceed 75 bytes; standard content-line folding handles their length.
function stableUid(identity) {
  const bytes = encoder.encode(JSON.stringify(identity));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return (
    btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") +
    "@uem-connect-web"
  );
}

/** Browser-only common writer. Prefix changes display location only, never UID. */
export function convertScheduleToIcs(snapshot, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.occurrences))
    throw new TypeError("课表模型无效");
  if (snapshot.exportErrors?.length)
    throw new Error(snapshot.exportErrors.join("；"));
  const maxEvents = integer(options.maxEvents ?? 10000, "maxEvents", 1);
  if (snapshot.occurrences.length > maxEvents)
    throw new Error(`上课次数超过 maxEvents=${maxEvents}`);
  const timestamp = options.timestamp ?? new Date();
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime()))
    throw new TypeError("timestamp 必须是有效的 Date");
  const dtstamp = utcDateTime(timestamp.getTime());
  const name = text(options.calendarName ?? "我的课表");
  const calendarId = text(options.calendarId ?? `ncist-${snapshot.source}`);
  const prefix = options.addUniversityPrefix ?? true;
  if (typeof prefix !== "boolean")
    throw new TypeError("addUniversityPrefix 必须是布尔值");
  const events = new Map();
  let duplicateEventCount = 0;
  for (const e of snapshot.occurrences) {
    const day = dateOrdinal(e.date);
    if (
      day === null ||
      !Number.isInteger(e.start) ||
      !Number.isInteger(e.end) ||
      e.start < 0 ||
      e.end > 1440 ||
      e.end <= e.start
    )
      throw new Error("课程的日期或时间无效");
    const start = day + e.start * 60000 - CHINA_OFFSET_MS;
    const end = day + e.end * 60000 - CHINA_OFFSET_MS;
    const title = text(e.name);
    const rawLocation = text(e.location);
    const location =
      prefix && rawLocation && !rawLocation.startsWith("应急管理大学 ")
        ? `应急管理大学 ${rawLocation}`
        : rawLocation;
    const uid = stableUid([
      calendarId,
      text(snapshot.semester.id),
      text(e.sourceId),
      text(e.code),
      text(e.teachingClass),
      title,
      text(e.teacher),
      text(e.delivery),
      rawLocation,
      text(e.classCodes),
      text(e.remark),
      utcDateTime(start),
      utcDateTime(end),
    ]);
    if (events.has(uid)) {
      duplicateEventCount++;
      continue;
    }
    const description = [
      e.code && `课程代码：${e.code}`,
      e.teachingClass && `教学班：${e.teachingClass}`,
      e.teacher && `教师：${e.teacher}`,
      e.delivery && `授课方式：${e.delivery}`,
      e.classCodes && `行政班：${e.classCodes}`,
      `第 ${e.week} 周`,
      e.remark && `排课说明：${e.remark}`,
    ]
      .filter(Boolean)
      .join("\n");
    const local = (n) => utcDateTime(n + CHINA_OFFSET_MS).slice(0, -1);
    events.set(uid, {
      start,
      end,
      title,
      location,
      description,
      lines: [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${CHINA_TIME_ZONE}:${local(start)}`,
        `DTEND;TZID=${CHINA_TIME_ZONE}:${local(end)}`,
        `SUMMARY:${escapeText(title)}`,
        ...(location ? [`LOCATION:${escapeText(location)}`] : []),
        `DESCRIPTION:${escapeText(description)}`,
        "END:VEVENT",
      ],
    });
  }
  const sorted = [...events.entries()].sort(
    ([a, x], [b, y]) => x.start - y.start || (a < b ? -1 : a > b ? 1 : 0),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NCIST-IT//UEM Connect Web Timetable//ZH",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${CHINA_TIME_ZONE}`,
    "BEGIN:VTIMEZONE",
    `TZID:${CHINA_TIME_ZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...sorted.flatMap(([, e]) => e.lines),
    "END:VCALENDAR",
  ];
  return {
    ics: lines.map(foldLine).join("\r\n") + "\r\n",
    eventCount: events.size,
    calendarEvents: sorted.map(([uid, event]) => ({
      uid,
      title: event.title,
      location: event.location,
      notes: event.description,
      start: new Date(event.start).toISOString().replace(".000Z", "Z"),
      end: new Date(event.end).toISOString().replace(".000Z", "Z"),
    })),
    recordCount: snapshot.recordCount,
    duplicateEventCount,
  };
}

/** Backward-compatible strict JWXT raw JSON/object wrapper. */
export function convertTimetableToIcs(input, options = {}) {
  const raw =
    typeof input === "string"
      ? JSON.parse(input.replace(/^\uFEFF/, ""))
      : input;
  if (options.semesterStartDate !== undefined)
    semesterMonday(options.semesterStartDate);
  const snapshot = normalizeSchedule(
    {
      source: "jwxt",
      semester: {
        id: text(raw?.CurrentSemId),
        name: "我的课表",
        current: true,
      },
      raw,
    },
    {
      strict: true,
      semesterStartDate: options.semesterStartDate,
      maxEvents: options.maxEvents ?? 10000,
    },
  );
  return convertScheduleToIcs(snapshot, options);
}
