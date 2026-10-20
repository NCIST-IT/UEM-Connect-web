import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSchedule } from "../src/lib/schedule-model.js";
import {
  convertScheduleToIcs,
  convertTimetableToIcs,
} from "../src/lib/timetable-to-ics.js";

const semester = { id: "84", name: "测试学期", current: true };
const row = {
  StartDay: "2026-09-07",
  RPDTId: 1,
  LUCode: "TEST",
  LUName: "测试课程",
  FullName: "测试教师",
  Campus: "中区",
  Building: "楼宇",
  Classroom: "101",
  WeekStart: 1,
  WeekEnd: 3,
  WeekInterval: 0,
  TimeSlotStart: 96,
  TimeSlotEnd: 116,
  OnMonday: true,
};
const jwxt = (rows) => ({
  source: "jwxt",
  semester,
  raw: { CurrentSemId: 84, Data: rows },
});
function gmsWeek(wi, periods, encoding = "array") {
  const monday = new Date(Date.UTC(2026, 8, 7 + wi * 7))
    .toISOString()
    .slice(0, 10);
  const item = {
    kch: "G1",
    kcmc: "G1【测试课程】",
    rkjs: "测试教师",
    js: "测试教室",
    jxrwId: "task",
  };
  return [
    { jc: "节次", z1: `周一(${monday})` },
    ...Array.from({ length: 10 }, (_, i) => ({
      jc: String(i + 1),
      z1: periods.includes(i + 1)
        ? encoding === "object"
          ? item
          : encoding === "json"
            ? JSON.stringify([item])
            : [item]
        : [],
    })),
  ];
}
test("JWXT conversion preserves occurrences and suffix repair changes only LOCATION", () => {
  const snapshot = normalizeSchedule(jwxt([row]), {
    now: new Date("2026-09-21T00:00:00Z"),
  });
  assert.equal(snapshot.currentWeek, 3);
  assert.equal(snapshot.occurrences.length, 3);
  const stamp = new Date("2026-10-08T00:00:00Z");
  const plain = convertScheduleToIcs(snapshot, {
    timestamp: stamp,
    addUniversitySuffix: false,
  }).ics;
  const added = convertScheduleToIcs(snapshot, {
    timestamp: stamp,
    addUniversitySuffix: true,
  }).ics;
  const unfold = (s) => s.replace(/\r\n /g, "");
  assert.equal(
    unfold(added).replaceAll(" 应急管理大学\r\n", "\r\n"),
    unfold(plain),
  );
  const legacy = convertTimetableToIcs(jwxt([row]).raw, {
    timestamp: stamp,
    addUniversitySuffix: false,
  }).ics;
  assert.equal(plain, legacy);
});
test("historical semester starts at week 1 independent of server CurrentWeekIndex", () => {
  const data = jwxt([row]);
  data.semester = { ...semester, current: false };
  data.raw.CurrentWeekIndex = 23;
  assert.equal(normalizeSchedule(data).currentWeek, 1);
});
test("missing school dates block export; unscheduled classes are explicitly shown", () => {
  const model = normalizeSchedule(
    jwxt([
      { ...row, StartDay: undefined },
      { ...row, LUName: "未排课", OnMonday: false },
    ]),
  );
  assert.equal(model.unscheduled.length, 1);
  assert.equal(model.semesterStartDate, null);
  assert.throws(() => convertScheduleToIcs(model), /起始日期/);
});
test("overlapping classes remain distinct calendar events", () => {
  const model = normalizeSchedule(
    jwxt([row, { ...row, RPDTId: 2, LUName: "第二门课", TimeSlotEnd: 105 }]),
  );
  const { calendarEvents } = convertScheduleToIcs(model);
  assert.equal(calendarEvents.length, 6);
  const firstDay = calendarEvents.filter((event) =>
    event.start.startsWith("2026-09-07"),
  );
  assert.equal(firstDay.length, 2);
  assert.equal(firstDay[0].start, firstDay[1].start);
  assert.notEqual(firstDay[0].uid, firstDay[1].uid);
});
for (const encoding of ["array", "object", "json"])
  test(`GMS ${encoding}: merges adjacent periods within each exact week, never unions weeks`, () => {
    const model = normalizeSchedule({
      source: "gms",
      semester: { id: "g-1", name: "研究生", current: true },
      meta: { xqbh: "g-1", zdzc: 3 },
      raw: [
        gmsWeek(0, [1, 2], encoding),
        gmsWeek(1, [2], encoding),
        gmsWeek(2, [3, 4], encoding),
      ],
    });
    assert.equal(model.occurrences.length, 3);
    assert.deepEqual(
      model.occurrences.map((e) => [e.date, e.start, e.end]),
      [
        ["2026-09-07", 480, 580],
        ["2026-09-14", 535, 580],
        ["2026-09-21", 610, 710],
      ],
    );
    assert.equal(convertScheduleToIcs(model).eventCount, 3);
  });
test("GMS declared period wall times are respected", () => {
  const raw = [gmsWeek(0, [7])];
  raw[0][7].jc = "7(15:50-16:35)";
  const model = normalizeSchedule({
    source: "gms",
    semester,
    meta: { zdzc: 1 },
    raw,
  });
  assert.equal(model.occurrences[0].start, 950);
  assert.ok(
    convertScheduleToIcs(model).ics.includes(
      "DTSTART;TZID=Asia/Shanghai:20260907T155000",
    ),
  );
});
test("GMS malformed JSON and conflicting dates are not silently dropped", () => {
  const raw = [gmsWeek(0, [1])];
  raw[0][1].z1 = "[broken]";
  assert.throws(
    () =>
      normalizeSchedule({ source: "gms", semester, meta: { zdzc: 1 }, raw }),
    /无法解析/,
  );
  const bad = [gmsWeek(0, [1]), gmsWeek(0, [2])];
  const model = normalizeSchedule({
    source: "gms",
    semester,
    meta: { zdzc: 2 },
    raw: bad,
  });
  assert.throws(() => convertScheduleToIcs(model), /日期与周次/);
});
