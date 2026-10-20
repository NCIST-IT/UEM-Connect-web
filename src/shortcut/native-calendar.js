import { normalizeSchedule } from "../lib/schedule-model.js";
import { convertScheduleToIcs } from "../lib/timetable-to-ics.js";
import { collectSafariSchedule } from "./safari-calendar.js";

// The "10 minutes before" option uses the native Custom alert with an absolute
// alert time; every event carries it so one shared script covers that variant.
const CUSTOM_ALERT_OFFSET_MS = 10 * 60 * 1000;

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function nativeCalendarPayload(
  packet,
  { addUniversitySuffix = false } = {},
) {
  const snapshot = normalizeSchedule(packet);
  const calendarName = `应大通课表 · ${snapshot.semester.name}`;
  const result = convertScheduleToIcs(snapshot, {
    addUniversitySuffix,
    calendarName,
  });
  if (!result.eventCount) throw new Error("该学期没有可添加的已排课日程。");
  const groupMarker = `[UEM-TERM:${snapshot.source}:${snapshot.semester.id}]`;
  const events = result.calendarEvents.map((event) => ({
    start: event.start,
    end: event.end,
    alert: new Date(Date.parse(event.start) - CUSTOM_ALERT_OFFSET_MS)
      .toISOString()
      .replace(".000Z", "Z"),
    title: event.title.replace(/[\r\n]+/g, " "),
    location: event.location.replace(/[\r\n]+/g, " "),
    notes: `${event.notes}\n\n${groupMarker}`,
  }));
  return {
    version: 10,
    ok: true,
    calendarName,
    calendarNamePattern: `(?m)^${escapePattern(calendarName)}\\r?$`,
    events,
    count: events.length,
    unscheduledCount: snapshot.unscheduled.length,
    summary: `将新建独立日历“${calendarName}”，添加整个学期的 ${events.length} 次课程。\n${snapshot.unscheduled.length} 条未排课记录没有时间，不添加。课程时间按北京时间计算。\n\n确认后批量写入，不会逐条弹出编辑窗口。若中断，已写入的课程会保留；删除本次课表日历后可以重新添加。`,
  };
}

export async function collectNativeCalendar(options = {}) {
  return nativeCalendarPayload(await collectSafariSchedule(options), options);
}
