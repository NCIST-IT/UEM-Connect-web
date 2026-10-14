import assert from "node:assert/strict";
import { test } from "node:test";
import { convertTimetableToIcs } from "../src/lib/timetable-to-ics.js";

const timestamp = new Date("2026-10-08T15:00:00Z");
const row = {
  StartDay: "2026-09-07",
  RPDTId: 123,
  LUCode: "TEST-001",
  LUName: "示例课程",
  DCSN: "01",
  FullName: "示例教师",
  Campus: "中区",
  Building: "示例楼",
  Classroom: "101",
  WeekStart: 1,
  WeekEnd: 3,
  WeekInterval: 0,
  TimeSlotStart: 96,
  TimeSlotEnd: 116,
  OnMonday: true,
};
const source = (rows = [row]) => ({ CurrentSemId: 84, Data: rows });
const convert = (rows = [row], options = {}) =>
  convertTimetableToIcs(source(rows), { timestamp, ...options });
const unfolded = (ics) => ics.replace(/\r\n[ \t]/g, "");
const values = (ics, property) =>
  (unfolded(ics).match(/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT/g) ?? [])
    .flatMap((event) => event.split("\r\n"))
    .filter(
      (line) =>
        line.startsWith(`${property}:`) || line.startsWith(`${property};`),
    )
    .map((line) => line.slice(line.indexOf(":") + 1));

test("school 08:00–09:40 stays 08:00–09:40 in explicitly fixed UTC+8", () => {
  const { ics, eventCount } = convert();
  assert.equal(eventCount, 3);
  assert.deepEqual(values(ics, "DTSTART"), [
    "20260907T080000",
    "20260914T080000",
    "20260921T080000",
  ]);
  assert.deepEqual(values(ics, "DTEND"), [
    "20260907T094000",
    "20260914T094000",
    "20260921T094000",
  ]);
  assert.ok(ics.includes("DTSTART;TZID=Asia/Shanghai:20260907T080000\r\n"));
  assert.ok(ics.includes("TZID:Asia/Shanghai\r\nBEGIN:STANDARD\r\n"));
  assert.ok(ics.includes("TZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\n"));
  assert.ok(!ics.includes("GMT"));
  assert.ok(
    values(ics, "DTSTAMP").every((date) => date === "20261008T150000Z"),
  );
});

test("alternating odd/even weeks and multiple weekdays have precise occurrences", () => {
  const odd = {
    ...row,
    WeekEnd: 5,
    WeekInterval: 1,
    OnMonday: false,
    OnFriday: true,
  };
  const even = {
    ...odd,
    RPDTId: 124,
    WeekStart: 2,
    WeekEnd: 6,
    OnTuesday: true,
  };
  assert.deepEqual(values(convert([odd]).ics, "DTSTART"), [
    "20260911T080000",
    "20260925T080000",
    "20261009T080000",
  ]);
  assert.deepEqual(values(convert([even]).ics, "DTSTART"), [
    "20260915T080000",
    "20260918T080000",
    "20260929T080000",
    "20261002T080000",
    "20261013T080000",
    "20261016T080000",
  ]);
});

test("Sunday and an end at midnight cross month/year boundaries correctly", () => {
  const late = {
    ...row,
    StartDay: "2026-12-28",
    WeekEnd: 1,
    OnMonday: false,
    OnSunday: true,
    TimeSlotStart: 276,
    TimeSlotEnd: 288,
  };
  const { ics } = convert([late]);
  assert.deepEqual(values(ics, "DTSTART"), ["20270103T230000"]);
  assert.deepEqual(values(ics, "DTEND"), ["20270104T000000"]);
});

test("UTF-8 folding is at most 75 bytes, preserves emoji, and escapes text injection", () => {
  const title = "中文😀".repeat(40) + "\\,;\r\nEND:VEVENT";
  const { ics } = convert([{ ...row, LUName: title, WeekEnd: 1 }]);
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75);
    assert.ok(!line.includes("\uFFFD"));
  }
  assert.ok(!ics.replaceAll("\r\n", "").includes("\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((ics.match(/\r\nEND:VEVENT\r\n/g) ?? []).length, 1);
  assert.equal(
    values(ics, "SUMMARY")[0],
    "中文😀".repeat(40) + "\\\\\\,\\;\\nEND:VEVENT",
  );
});

test("UIDs are stable across export time and source order; exact duplicate events merge", () => {
  const second = { ...row, RPDTId: 124, OnMonday: false, OnTuesday: true };
  const first = convert([row, second]);
  const reordered = convert([second, row], {
    timestamp: new Date("2026-11-01T00:00:00Z"),
  });
  assert.deepEqual(values(first.ics, "UID"), values(reordered.ics, "UID"));
  const duplicated = convert([row, row]);
  assert.equal(duplicated.eventCount, 3);
  assert.equal(duplicated.duplicateEventCount, 3);
  const otherAccount = convert([row], { calendarId: "another-account" });
  assert.notEqual(
    values(first.ics, "UID")[0],
    values(otherAccount.ics, "UID")[0],
  );
});

test("object and BOM-prefixed JSON text produce identical calendars without mutating input", () => {
  const input = source();
  const before = JSON.stringify(input);
  assert.deepEqual(
    convertTimetableToIcs("\uFEFF" + before, { timestamp }),
    convertTimetableToIcs(input, { timestamp }),
  );
  assert.equal(JSON.stringify(input), before);
});

test("an explicit Monday can replace missing/bad source StartDay", () => {
  const { ics } = convert([{ ...row, StartDay: undefined, WeekEnd: 1 }], {
    semesterStartDate: "2026-09-14",
  });
  assert.deepEqual(values(ics, "DTSTART"), ["20260914T080000"]);
});

test("empty semester yields a valid empty calendar", () => {
  const { ics, eventCount } = convert([]);
  assert.equal(eventCount, 0);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("invalid/unscheduled records report their index instead of being dropped", () => {
  const invalid = [
    { StartDay: "2026-02-30" },
    { StartDay: "2026-09-08" },
    { StartDay: "" },
    { WeekStart: null },
    { WeekStart: 0 },
    { WeekEnd: 0 },
    { WeekInterval: -1 },
    { TimeSlotStart: "" },
    { TimeSlotEnd: 96 },
    { TimeSlotEnd: 289 },
    { OnMonday: false },
    { OnMonday: "perhaps" },
    { LUName: "" },
    { LUName: "title\u0000" },
  ];
  for (const fields of invalid) {
    assert.throws(() => convert([row, { ...row, ...fields }]), /Data\[1\]/);
  }
  assert.throws(() => convertTimetableToIcs({ Data: null }), /Data 数组/);
  assert.throws(
    () => convert(undefined, { timestamp: new Date("invalid") }),
    /timestamp/,
  );
  assert.throws(
    () => convert([{ ...row, WeekEnd: 1000000 }], { maxEvents: 5 }),
    /maxEvents=5/,
  );
});

test("documented numeric-string and boolean-number representations are accepted", () => {
  const alternate = {
    ...row,
    WeekStart: "1",
    WeekEnd: "3",
    WeekInterval: "0",
    TimeSlotStart: "96",
    TimeSlotEnd: "116",
    OnMonday: "1",
    OnSunday: 0,
  };
  assert.equal(convert([alternate]).ics, convert([row]).ics);
});
