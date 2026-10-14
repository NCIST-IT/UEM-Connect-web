import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { nativeCalendarPayload } from "../src/shortcut/native-calendar.js";

// Execute the emitted workflow's data/control wiring with simulated Calendar
// results. Deliberately include unrelated calendars to cover the reported false
// positive: a candidate result alone is not evidence of an imported course.
function simulate(
  workflow,
  payload,
  candidates,
  { calendar = { name: payload.calendarName }, failAt = null } = {},
) {
  const outputs = new Map();
  const alerts = [],
    written = [];
  let queries = 0,
    calendars = 0;
  const list = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
  function resolve(v, item) {
    if (v?.WFSerializationType === "WFTextTokenString") {
      let text = v.Value.string;
      const ranges = Object.entries(v.Value.attachmentsByRange).sort(
        ([a], [b]) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]),
      );
      for (const [range, ref] of ranges) {
        const at = Number(range.match(/\d+/)[0]);
        text = text.slice(0, at) + (resolve(ref, item) ?? "") + text.slice(at + 1);
      }
      return text;
    }
    if (v?.Value) return resolve(v.Value, item);
    if (v?.Type === "ActionOutput") return outputs.get(v.OutputUUID);
    if (v?.Type === "Variable") return v.Variable ? resolve(v.Variable, item) : item;
    return v;
  }
  const actions = workflow.WFWorkflowActions;
  function run(from, to, item) {
    let result;
    for (let i = from; i < to; i++) {
      const {
        WFWorkflowActionIdentifier: id,
        WFWorkflowActionParameters: p,
      } = actions[i];
      const kind = id.replace("is.workflow.actions.", "");
      if (p.WFControlFlowMode === 0) {
        const end = actions.findIndex(
          (a, j) => j > i &&
            a.WFWorkflowActionParameters.GroupingIdentifier === p.GroupingIdentifier &&
            a.WFWorkflowActionParameters.WFControlFlowMode === 2,
        );
        assert.ok(end > i, "balanced control flow");
        if (kind === "repeat.each") {
          result = list(resolve(p.WFInput, item)).flatMap(
            (entry) => list(run(i + 1, end, entry)),
          );
        } else {
          const input = resolve(p.WFInput, item);
          const passed = p.WFCondition === 2
            ? typeof input === "number" && input > p.WFNumberValue
            : list(input).length > 0;
          const otherwise = actions.findIndex(
            (a, j) => j > i && j < end &&
              a.WFWorkflowActionParameters.GroupingIdentifier === p.GroupingIdentifier &&
              a.WFWorkflowActionParameters.WFControlFlowMode === 1,
          );
          result = passed ? run(i + 1, otherwise, item) : run(otherwise + 1, end, item);
        }
        const uuid = actions[end].WFWorkflowActionParameters.UUID;
        if (uuid) outputs.set(uuid, result);
        i = end;
        continue;
      }
      switch (kind) {
        case "comment": continue;
        case "runjavascriptonwebpage": result = JSON.stringify(payload); break;
        case "gettext": result = resolve(p.WFTextActionText, item); break;
        case "detect.dictionary": result = JSON.parse(resolve(p.WFInput, item)); break;
        case "getvalueforkey": result = resolve(p.WFInput, item)[p.WFDictionaryKey]; break;
        case "filter.calendarevents": queries++; result = candidates; break;
        case "properties.calendarevents":
          assert.equal(p.WFContentItemPropertyName, "Calendar");
          result = resolve(p.WFInput, item).calendarName ?? ""; break;
        case "text.match": {
          const pattern = resolve(p.WFMatchTextPattern, item);
          const regex = new RegExp(pattern.replace(/^\(\?m\)/, ""), `gm${p.WFMatchTextCaseSensitive ? "" : "i"}`);
          result = resolve(p.text, item).match(regex) ?? []; break;
        }
        case "getitemfromlist": result = list(resolve(p.WFInput, item))[0]; break;
        case "nothing": result = undefined; break;
        case "count": result = list(resolve(p.Input, item)).length; break;
        case "alert": alerts.push({ title: p.WFAlertActionTitle, message: resolve(p.WFAlertActionMessage, item) }); result = undefined; break;
        case "addnewcalendar": calendars++; result = calendar; break;
        case "date": result = resolve(p.WFDateActionDate, item); break;
        case "addnewevent":
          if (written.length === failAt) throw new Error("simulated calendar write failure");
          assert.equal(resolve(p.WFCalendarDescriptor, item), calendar);
          result = { title: resolve(p.WFCalendarItemTitle, item), notes: resolve(p.WFCalendarItemNotes, item) };
          written.push(result); break;
        case "openapp": result = undefined; break;
        default: assert.fail(`unsupported simulated action: ${kind}`);
      }
      if (p.UUID) outputs.set(p.UUID, result);
    }
    return result;
  }
  run(0, actions.length);
  return { alerts, written, calendars, queries };
}

const alerts = JSON.parse(
  await readFile(new URL("../src/shortcut/alerts.json", import.meta.url), "utf8"),
);
const packages = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      `import importlib.util,json; s=importlib.util.spec_from_file_location('package','scripts/package-safari-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([m.package('test',v,a) for v in ('default','apple-maps') for a in m.ALERTS],ensure_ascii=False))`,
    ],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  ),
);
function workflow(variant, alertId) {
  return packages[
    (variant === "default" ? 0 : alerts.length) +
      alerts.findIndex((entry) => entry.id === alertId)
  ];
}

function sample() {
  return nativeCalendarPayload({
    source: "jwxt",
    semester: { id: "84", name: "测试学期", current: true },
    raw: { Data: [{
      StartDay: "2026-09-07", RPDTId: 1, LUCode: "TEST", LUName: "测试课程",
      WeekStart: 1, WeekEnd: 3, WeekInterval: 0,
      TimeSlotStart: 96, TimeSlotEnd: 116, OnMonday: true,
    }] },
  });
}

test("unrelated calendars and empty results do not block import or inflate counts", () => {
  const payload = sample();
  const unrelated = [
    { calendarName: "个人" },
    { calendarName: "中国大陆节假日" },
    { calendarName: "工作" },
  ];
  for (const variant of ["default", "apple-maps"]) {
    for (const candidates of [[], unrelated]) {
      const result = simulate(workflow(variant, "none"), payload, candidates);
      assert.equal(result.calendars, 1);
      assert.equal(result.queries, 1, "only the pre-add same-name check runs");
      assert.equal(result.written.length, payload.count);
      assert.ok(!result.alerts.some((a) => a.title.includes("同名")));
      assert.match(
        result.alerts.find((a) => a.title === "课表添加结果").message,
        new RegExp(`本次添加日程：${payload.count}`),
      );
    }
  }
});

test("a same-named calendar after unrelated candidates prevents all writes", () => {
  const payload = sample();
  for (const variant of ["default", "apple-maps"]) {
    const result = simulate(workflow(variant, "none"), payload, [
      { calendarName: "个人" },
      { calendarName: payload.calendarName },
    ]);
    assert.equal(result.calendars, 0);
    assert.equal(result.written.length, 0);
    assert.equal(result.alerts.length, 1);
    assert.match(result.alerts[0].title, /已存在同名课表日历/);
    assert.match(result.alerts[0].message, /应大通课表 · 测试学期/);
  }
});

test("alert options are applied to every created event", () => {
  for (const alert of alerts) {
    const target = workflow("default", alert.id);
    const event = target.WFWorkflowActions.find(
      (a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.addnewevent",
    ).WFWorkflowActionParameters;
    if (!alert.alertTime) {
      assert.ok(!Object.hasOwn(event, "WFAlertTime"));
      assert.ok(!Object.hasOwn(event, "WFAlertCustomTime"));
      continue;
    }
    assert.equal(event.WFAlertTime, alert.alertTime);
    if (alert.alertTime !== "Custom") {
      assert.ok(!Object.hasOwn(event, "WFAlertCustomTime"));
      continue;
    }
    const attachment =
      event.WFAlertCustomTime.Value.attachmentsByRange["{0, 1}"];
    const alertField = target.WFWorkflowActions.find(
      (a) => a.WFWorkflowActionParameters.WFDictionaryKey === "alert",
    );
    assert.equal(attachment.OutputUUID, alertField.WFWorkflowActionParameters.UUID);
  }
});

test("payload carries the ten-minute alert time and no longer ships marker scan fields", () => {
  const payload = sample();
  assert.equal(payload.version, 10);
  const first = payload.events[0];
  assert.equal(
    Date.parse(first.alert),
    Date.parse(first.start) - 10 * 60 * 1000,
  );
  assert.ok(first.notes.includes("[UEM-TERM:jwxt:84]"));
  assert.ok(!Object.hasOwn(payload, "groupMarker"));
  assert.ok(!Object.hasOwn(payload, "groupMarkerPattern"));
});

test("calendar name pattern matches only the exact calendar name", () => {
  const payload = sample();
  const regex = new RegExp(
    payload.calendarNamePattern.replace(/^\(\?m\)/, ""),
    "m",
  );
  assert.ok(regex.test(payload.calendarName));
  assert.ok(!regex.test(payload.calendarName.replace("·", "x")));
  assert.ok(!regex.test(payload.calendarName.replace("测试学期", "其他学期")));
});

test("286 successful additions report 286 from the add loop", () => {
  const payload = sample();
  payload.events = Array.from({ length: 286 }, (_, index) => ({
    ...payload.events[index % payload.events.length],
    title: `测试课程 ${index + 1}`,
  }));
  payload.count = 286;
  for (const variant of ["default", "apple-maps"]) {
    const result = simulate(workflow(variant, "none"), payload, []);
    assert.equal(result.written.length, 286);
    assert.match(
      result.alerts.find((a) => a.title === "课表添加结果").message,
      /计划课程次数：286\n本次添加日程：286/,
    );
  }
});

test("a failed addition stops the workflow instead of reporting the planned total", () => {
  for (const variant of ["default", "apple-maps"]) {
    assert.throws(
      () => simulate(workflow(variant, "none"), sample(), [], { failAt: 1 }),
      /calendar write failure/,
    );
  }
});

test("missing calendar output still stops before writing courses", () => {
  const payload = sample();
  const result = simulate(workflow("default", "none"), payload, [], {
    calendar: null,
  });
  assert.equal(result.written.length, 0);
  assert.ok(result.alerts.some((a) => a.title === "未取得新建的课表日历"));
});

test("the success path opens the Calendar app instead of an event", () => {
  for (const variant of ["default", "apple-maps"]) {
    const target = workflow(variant, "none");
    const open = target.WFWorkflowActions.find(
      (a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.openapp",
    ).WFWorkflowActionParameters;
    assert.deepEqual(open, {
      WFAppIdentifier: "com.apple.mobilecal",
      WFAppName: "Calendar",
    });
    assert.ok(
      !target.WFWorkflowActions.some((a) =>
        /showincalendar/.test(a.WFWorkflowActionIdentifier),
      ),
    );
  }
});
