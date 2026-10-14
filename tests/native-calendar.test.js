import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeCalendarPayload } from "../src/shortcut/native-calendar.js";
import { normalizeSchedule } from "../src/lib/schedule-model.js";
import { convertScheduleToIcs } from "../src/lib/timetable-to-ics.js";

const row = {
  StartDay: "2026-09-07",
  RPDTId: 1,
  LUName: "测试课程",
  LUCode: "TEST",
  FullName: "教师",
  Campus: "中区",
  Building: "教学楼",
  Classroom: "101",
  WeekStart: 1,
  WeekEnd: 3,
  WeekInterval: 0,
  TimeSlotStart: 96,
  TimeSlotEnd: 116,
  OnMonday: true,
};
const packet = (rows) => ({
  source: "jwxt",
  semester: { id: "84", name: "2026-2027学年度第一学期", current: true },
  raw: { Data: rows },
});

test("native calendar writes exactly the same deduplicated occurrences and absolute times as ICS", () => {
  const p = packet([row, { ...row }]);
  const payload = nativeCalendarPayload(p);
  const ics = convertScheduleToIcs(normalizeSchedule(p), {
    addUniversityPrefix: false,
  });
  assert.equal(payload.count, ics.eventCount);
  assert.equal(payload.events.length, 3);
  assert.equal(payload.events[0].start, "2026-09-07T00:00:00Z");
  assert.equal(payload.events[0].end, "2026-09-07T01:40:00Z");
  assert.deepEqual(
    payload.events.map((e) => e.start),
    ics.calendarEvents.map((e) => e.start),
  );
  assert.ok(payload.calendarName.includes("2026-2027学年度第一学期"));
  assert.ok(payload.summary.includes("3 次课程"));
  assert.ok(payload.events.every((e) => e.notes.includes(payload.groupMarker)));
});
test("native prefix only changes locations and cannot bypass the semester duplicate marker", () => {
  const plain = nativeCalendarPayload(packet([row]));
  const maps = nativeCalendarPayload(packet([row]), {
    addUniversityPrefix: true,
  });
  assert.equal(plain.groupMarker, maps.groupMarker);
  assert.equal(plain.calendarName, maps.calendarName);
  for (let i = 0; i < plain.events.length; i++)
    assert.deepEqual(
      { ...maps.events[i], location: plain.events[i].location },
      plain.events[i],
    );
  assert.equal(maps.events[0].location, "应急管理大学 中区 教学楼 101");
});
test("native dates respect midnight across years and block unknown school dates", () => {
  const p = packet([
    {
      ...row,
      StartDay: "2025-12-29",
      WeekStart: 1,
      WeekEnd: 1,
      OnMonday: false,
      OnWednesday: true,
      TimeSlotStart: 284,
      TimeSlotEnd: 288,
    },
  ]);
  const event = nativeCalendarPayload(p).events[0];
  assert.equal(event.start, "2025-12-31T15:40:00Z");
  assert.equal(event.end, "2025-12-31T16:00:00Z");
  assert.throws(
    () => nativeCalendarPayload(packet([{ ...row, StartDay: null }])),
    /日期/,
  );
});
test("native summary exposes unscheduled courses and does not include credentials or raw school response", () => {
  const p = packet([row, { ...row, OnMonday: false }]);
  p.raw.password = "never include";
  p.raw.cookie = "never include";
  const payload = nativeCalendarPayload(p);
  assert.equal(payload.unscheduledCount, 1);
  assert.ok(payload.summary.includes("1 条未排课"));
  assert.ok(!JSON.stringify(payload).includes("never include"));
  assert.deepEqual(Object.keys(payload.events[0]).sort(), [
    "end",
    "location",
    "notes",
    "start",
    "title",
  ]);
});
