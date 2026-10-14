import { test } from "node:test";
import assert from "node:assert/strict";
import {
  academicSemesterKey,
  readPageSemesters,
  resolveJwxtSemester,
} from "../src/shortcut/jwxt-semester.js";
import { createSafariCalendar } from "../src/shortcut/safari-calendar.js";

const origin = "https://jw.cidp.edu.cn";
const list = {
  Sems: [
    { Id: 84, Name: "2026-2027学年度第一学期" },
    { Id: 80, Name: "2025-2026学年度第一学期" },
    { Id: 83, Name: "2025-2026学年度第二学期" },
  ],
};
const pageDoc = (text) => ({
  location: { origin },
  body: { innerText: text },
  querySelectorAll: () => [],
});
const pageFor = (text) => readPageSemesters(pageDoc(text), origin);

test("Jwxt matches the screenshot's visible academic semester without a selected flag", () => {
  const page = pageFor(
    "学期 2026-2027学年度第一学期 选择\n周次 全学期 选择\n显示内容",
  );
  assert.deepEqual(page.labels, ["2026-2027学年度第一学期"]);
  assert.equal(resolveJwxtSemester(list, { page }).Id, 84);
  assert.equal(
    resolveJwxtSemester({ ...list, Sems: [...list.Sems].reverse() }, { page })
      .Id,
    84,
  );
});
test("Jwxt academic names normalize spacing, dash style and numbered API labels", () => {
  for (const name of [
    "2026-2027学年度第一学期",
    "2026 – 2027 学年 第 1 学期",
    "2026-2027-1",
    "2026-2027_1",
    "2026-2027(1)",
  ]) {
    assert.equal(academicSemesterKey(name), "2026-2027-1");
  }
  assert.equal(academicSemesterKey("2026-2028学年度第一学期"), null);
  assert.equal(
    resolveJwxtSemester(
      { Sems: [{ Id: 84, Name: "2026-2027-1" }, list.Sems[1]] },
      { page: pageFor("学期 2026-2027学年度第一学期 选择") },
    ).Id,
    84,
  );
});
test("Jwxt page-selected historical semester overrides the school's current marker", () => {
  const init = {
    CurrentSemId: 84,
    Sems: list.Sems.map((s) => ({ ...s, IsSelected: s.Id === 84 })),
  };
  assert.equal(
    resolveJwxtSemester(init, {
      page: pageFor("学期 2025-2026学年度第一学期 选择"),
    }).Id,
    80,
  );
  assert.equal(
    resolveJwxtSemester(init, {
      semesterId: "83",
      page: pageFor("学期 2026-2027学年度第一学期 选择"),
    }).Id,
    83,
  );
});
test("Jwxt visible semester controls use allowlisted IDs and ignore week selector values", () => {
  const doc = {
    body: { innerText: "" },
    querySelectorAll: (selector) =>
      selector === "select"
        ? [
            {
              id: "semester",
              selectedOptions: [{ value: "80", textContent: "历史学期" }],
            },
            {
              id: "week",
              selectedOptions: [{ value: "84", textContent: "第84周" }],
            },
          ]
        : [],
  };
  assert.equal(
    resolveJwxtSemester(list, { page: readPageSemesters(doc, origin) }).Id,
    80,
  );
  assert.throws(() => resolveJwxtSemester(list, { semesterId: "999" }), /列表/);
});
test("Jwxt reads a same-origin visible iframe but never reads cookies or cross-origin documents", () => {
  let cookieReads = 0;
  const child = pageDoc("学期 2026-2027学年度第一学期 选择");
  Object.defineProperty(child, "cookie", {
    get() {
      cookieReads++;
      throw new Error("no cookies");
    },
  });
  const doc = {
    body: { innerText: "导航" },
    querySelectorAll: (selector) =>
      selector === "iframe"
        ? [
            { contentDocument: child },
            {
              get contentDocument() {
                throw new Error("cross origin");
              },
            },
          ]
        : [],
  };
  assert.equal(
    resolveJwxtSemester(list, { page: readPageSemesters(doc, origin) }).Id,
    84,
  );
  assert.equal(cookieReads, 0);
});
test("Jwxt refuses contradictory page labels and reports missing metadata without guessing", () => {
  assert.throws(
    () =>
      resolveJwxtSemester(list, {
        page: pageFor("2026-2027学年度第一学期 2025-2026学年度第一学期"),
      }),
    /多个学期/,
  );
  assert.throws(
    () =>
      resolveJwxtSemester(list, { page: pageFor("2024-2025学年度第一学期") }),
    /未匹配/,
  );
  assert.throws(() => resolveJwxtSemester(list), /3 项/);
  assert.throws(
    () =>
      resolveJwxtSemester({
        Result: false,
        Message: "private",
        password: "secret",
      }),
    (error) =>
      error.message.includes("Result") &&
      !error.message.includes("secret") &&
      !error.message.includes("private"),
  );
  assert.equal(
    resolveJwxtSemester({
      Sems: [{ ...list.Sems[0], IsSelected: " TRUE " }, list.Sems[1]],
    }).Id,
    84,
  );
  assert.equal(resolveJwxtSemester({ ...list, CurrentSemId: 84 }).Id, 84);
});
test("Safari page-selected academic semester reaches the request and produces the full term ICS", async () => {
  let requested;
  const result = await createSafariCalendar({
    origin,
    documentImpl: pageDoc("学期 2026-2027学年度第一学期 选择\n周次 全学期"),
    fetchImpl: async (_url, init) => {
      const params = new URLSearchParams(init.body);
      if (params.get("action") === "initTablePage")
        return new Response(JSON.stringify(list));
      requested = params.get("semId");
      return new Response(
        JSON.stringify({
          CurrentSemId: 84,
          Data: [
            {
              StartDay: "2026-09-07",
              LUName: "回归样例",
              LUCode: "TEST",
              FullName: "测试教师",
              Campus: "中区",
              Building: "教学楼",
              Classroom: "101",
              WeekStart: 1,
              WeekEnd: 3,
              WeekInterval: 0,
              TimeSlotStart: 96,
              TimeSlotEnd: 116,
              OnMonday: true,
            },
          ],
        }),
      );
    },
  });
  assert.equal(requested, "84");
  assert.equal(result.eventCount, 3);
  assert.ok(result.ics.includes("DTSTART;TZID=Asia/Shanghai:20260921T080000"));
});
