const DAY = 86400000;
const FIELDS = [
  "OnMonday",
  "OnTuesday",
  "OnWednesday",
  "OnThursday",
  "OnFriday",
  "OnSaturday",
  "OnSunday",
];
const SLOTS = [
  [96, 105],
  [107, 116],
  [122, 131],
  [133, 142],
  [168, 177],
  [179, 188],
  [194, 203],
  [205, 214],
  [228, 237],
  [239, 248],
];
export const DEFAULT_PERIODS = SLOTS.map(([start, end], i) => ({
  number: i + 1,
  start: start * 5,
  end: end * 5,
}));
const string = (v) => {
  if (v == null) return "";
  if (!["string", "number"].includes(typeof v))
    throw new Error("文本字段格式无效");
  const result = String(v);
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result))
    throw new Error("文本字段包含控制字符");
  return result;
};
export const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function dateOrdinal(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const n = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value
    ? n
    : null;
}
export const dateString = (n) => new Date(n).toISOString().slice(0, 10);
export function chinaToday(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
function integer(v, label, min, max = Number.MAX_SAFE_INTEGER) {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`${label} 无效`);
  return n;
}
function flag(v, field) {
  if ([true, 1, "1", "true"].includes(v)) return true;
  if ([false, 0, "0", "false", null, undefined].includes(v)) return false;
  throw new Error(`${field} 无效`);
}
function finish(snapshot, now) {
  snapshot.totalWeeks = Math.max(
    snapshot.totalWeeks || 20,
    ...snapshot.occurrences.map((x) => x.week),
    1,
  );
  const monday = dateOrdinal(snapshot.semesterStartDate);
  const today = dateOrdinal(chinaToday(now));
  snapshot.currentWeek =
    snapshot.semester.current && monday !== null
      ? Math.max(
          1,
          Math.min(
            snapshot.totalWeeks,
            Math.floor((today - monday) / (7 * DAY)) + 1,
          ),
        )
      : 1;
  snapshot.exportErrors = [...new Set(snapshot.exportErrors)];
  return snapshot;
}

/** Browser model shared by weekly preview and iCalendar. No guessed dates or network requests. */
export function normalizeSchedule(
  { source, semester, raw, meta },
  {
    strict = false,
    semesterStartDate,
    maxEvents = 10000,
    now = new Date(),
  } = {},
) {
  if (!["jwxt", "gms"].includes(source)) throw new Error("未知课表来源");
  const snapshot = {
    source,
    semester,
    periods: DEFAULT_PERIODS,
    semesterStartDate: null,
    totalWeeks: 0,
    occurrences: [],
    unscheduled: [],
    exportErrors: [],
    recordCount: 0,
  };
  if (source === "jwxt") {
    if (!Array.isArray(raw?.Data))
      throw new TypeError("课表必须包含 Data 数组");
    snapshot.recordCount = raw.Data.length;
    const patterns = raw.ClassTimePatterns;
    if (
      Array.isArray(patterns) &&
      patterns.length &&
      patterns.every(
        (p) =>
          Number.isInteger(p.StartTimeSlot) &&
          Number.isInteger(p.EndTimeSlot) &&
          p.StartTimeSlot >= 0 &&
          p.EndTimeSlot <= 288 &&
          p.EndTimeSlot > p.StartTimeSlot,
      )
    ) {
      snapshot.periods = patterns.map((p, i) => ({
        number: i + 1,
        start: p.StartTimeSlot * 5,
        end: p.EndTimeSlot * 5,
      }));
    }
    const starts = new Set();
    raw.Data.forEach((row, index) => {
      try {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw new Error("课程记录必须是对象");
        const course = {
          name: string(row.LUName),
          code: string(row.LUCode),
          teacher: string(row.FullName),
          location: [row.Campus, row.Building, row.Classroom]
            .map(string)
            .filter(Boolean)
            .join(" "),
          teachingClass: string(row.DCSN),
          delivery: string(row.DelymethodName),
          classCodes: string(row.ClassCodes),
          remark: string(row.Remark),
          sourceId: string(row.RPDTId),
        };
        if (!course.name.trim()) throw new Error("缺少课程名称");
        const first = integer(row.WeekStart, "WeekStart", 1);
        const last = integer(row.WeekEnd, "WeekEnd", first);
        const skip = integer(
          row.WeekInterval ?? 0,
          "WeekInterval",
          0,
          Number.MAX_SAFE_INTEGER - 1,
        );
        const start = integer(row.TimeSlotStart, "TimeSlotStart", 0, 287) * 5;
        const end =
          integer(row.TimeSlotEnd, "TimeSlotEnd", start / 5 + 1, 288) * 5;
        const days = FIELDS.flatMap((f, i) => (flag(row[f], f) ? [i + 1] : []));
        if (!days.length) throw new Error("未提供上课星期");
        if (
          snapshot.occurrences.length +
            (Math.floor((last - first) / (skip + 1)) + 1) * days.length >
          maxEvents
        )
          throw new Error(`上课次数超过 maxEvents=${maxEvents}`);
        const startDate = semesterStartDate ?? row.StartDay;
        const monday = dateOrdinal(startDate);
        if (monday === null || new Date(monday).getUTCDay() !== 1) {
          if (strict) throw new Error("学期起始日期必须是有效的第一周周一");
          snapshot.exportErrors.push(`${course.name}缺少可核实的学期起始日期`);
        } else starts.add(startDate);
        for (let week = first; week <= last; week += skip + 1)
          for (const day of days) {
            snapshot.occurrences.push({
              ...course,
              id: `jwxt:${index}:${week}:${day}`,
              date:
                monday === null
                  ? null
                  : dateString(monday + ((week - 1) * 7 + day - 1) * DAY),
              week,
              day,
              start,
              end,
            });
          }
        snapshot.totalWeeks = Math.max(snapshot.totalWeeks, last);
      } catch (error) {
        if (strict || /maxEvents/.test(error.message))
          throw new Error(
            `Data[${index}]（第 ${index + 1} 条课程）：${error.message}`,
          );
        snapshot.unscheduled.push({
          name: string(row?.LUName) || "信息不完整的课程",
          code: string(row?.LUCode),
          teacher: string(row?.FullName),
          reason: error.message,
        });
      }
    });
    if (starts.size > 1)
      snapshot.exportErrors.push(
        "学校返回了不一致的学期起始日期，请重新获取核对",
      );
    snapshot.semesterStartDate = starts.values().next().value ?? null;
    snapshot.totalWeeks = Math.max(
      snapshot.totalWeeks,
      Number(raw.TotalWeeks) || 20,
    );
  } else {
    if (!Array.isArray(raw) || !meta || raw.length !== Number(meta.zdzc))
      throw new Error("研究生大课表周数不完整");
    snapshot.totalWeeks = Number(meta.zdzc);
    let anchor = null;
    const parsedWeeks = raw.map((rows, wi) => {
      if (!Array.isArray(rows) || rows.length < 11)
        throw new Error(`研究生第 ${wi + 1} 周课表行数不完整`);
      const dates = Array.from({ length: 7 }, (_, di) => {
        const date = string(rows[0][`z${di + 1}`]).match(
          /\d{4}-\d{2}-\d{2}/,
        )?.[0];
        const ordinal = dateOrdinal(date);
        if (ordinal !== null) {
          const monday = ordinal - (wi * 7 + di) * DAY;
          if (
            new Date(monday).getUTCDay() !== 1 ||
            (anchor !== null && anchor !== monday)
          )
            snapshot.exportErrors.push("研究生课表日期与周次不一致");
          else anchor = monday;
        }
        return dateOrdinal(date) !== null ? date : null;
      });
      return { rows, dates };
    });
    snapshot.semesterStartDate = anchor === null ? null : dateString(anchor);
    if (anchor === null)
      snapshot.exportErrors.push("研究生课表没有返回可核实的日期");
    parsedWeeks.forEach(({ rows, dates }, wi) => {
      const groups = new Map();
      for (let ri = 1; ri < rows.length; ri++) {
        const row = rows[ri];
        const number = Number(string(row.jc).match(/^\s*(\d+)/)?.[1]);
        const defaultPeriod = DEFAULT_PERIODS[number - 1];
        const times = string(row.jc).match(
          /(\d{1,2}):(\d{2})\s*[-–~至]\s*(\d{1,2}):(\d{2})/,
        );
        const period = times
          ? {
              number,
              start: Number(times[1]) * 60 + Number(times[2]),
              end: Number(times[3]) * 60 + Number(times[4]),
            }
          : defaultPeriod;
        if (
          period &&
          (period.start < 0 || period.end > 1440 || period.end <= period.start)
        )
          throw new Error("研究生作息时间无效");
        if (wi === 0 && period)
          snapshot.periods = snapshot.periods.map((p) =>
            p.number === number ? period : p,
          );
        for (let day = 1; day <= 7; day++) {
          for (const item of parseGmsCell(row[`z${day}`])) {
            snapshot.recordCount++;
            const code = string(item.kch);
            const title = string(item.kcmc) || code || "未提供课程名称";
            const name =
              title.match(/[【[](.+?)[】\]]/)?.[1] ??
              title.replace(code, "").trim();
            const course = {
              code,
              name,
              teacher: string(item.rkjs),
              location: string(item.js),
              sourceId: string(item.jxrwId),
              teachingClass: "",
              delivery: "",
              classCodes: "",
              remark: "",
            };
            if (!period) {
              snapshot.unscheduled.push({
                ...course,
                reason: "未提供可用节次",
              });
              continue;
            }
            const key = JSON.stringify([
              day,
              course.sourceId,
              code,
              name,
              course.teacher,
              course.location,
            ]);
            const group = groups.get(key) ?? {
              course,
              day,
              periods: new Map(),
            };
            group.periods.set(number, period);
            groups.set(key, group);
          }
        }
      }
      // Merge only within THIS exact week/day. Never union distinct weeks' period sets.
      for (const group of groups.values()) {
        const periods = [...group.periods.values()].sort(
          (a, b) => a.number - b.number,
        );
        let run = [];
        const emit = () => {
          if (!run.length) return;
          const day = group.day;
          const date =
            dates[day - 1] ??
            (anchor === null
              ? null
              : dateString(anchor + (wi * 7 + day - 1) * DAY));
          snapshot.occurrences.push({
            ...group.course,
            id: `gms:${wi}:${day}:${JSON.stringify(group.course)}:${run[0].number}`,
            date,
            week: wi + 1,
            day,
            start: run[0].start,
            end: run.at(-1).end,
          });
        };
        for (const p of periods) {
          if (run.length && p.number !== run.at(-1).number + 1) {
            emit();
            run = [];
          }
          run.push(p);
        }
        emit();
      }
    });
    if (snapshot.occurrences.length > maxEvents)
      throw new Error(`上课次数超过 maxEvents=${maxEvents}`);
  }
  return finish(snapshot, now);
}
export function parseGmsCell(value) {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    if (!value.trim() || value.trim() === "null") return [];
    try {
      return parseGmsCell(JSON.parse(value));
    } catch {
      throw new Error("研究生课程单元格无法解析");
    }
  }
  if (Array.isArray(value))
    return value.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (typeof value === "object") return [value];
  throw new Error("研究生课程单元格格式不支持");
}

export function weekBlocks(snapshot, week) {
  const blocks = snapshot.occurrences
    .filter((e) => e.week === week)
    .map((e) => ({ ...e, lane: 0, laneCount: 1 }));
  for (let day = 1; day <= 7; day++) {
    const items = blocks
      .filter((e) => e.day === day)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let group = [];
    let maxEnd = 0;
    const layout = () => {
      const ends = [];
      for (const e of group) {
        let lane = ends.findIndex((n) => n <= e.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = e.end;
        e.lane = lane;
      }
      for (const e of group) e.laneCount = ends.length;
    };
    for (const e of items) {
      if (group.length && e.start >= maxEnd) {
        layout();
        group = [];
        maxEnd = 0;
      }
      group.push(e);
      maxEnd = Math.max(maxEnd, e.end);
    }
    layout();
  }
  return blocks;
}
