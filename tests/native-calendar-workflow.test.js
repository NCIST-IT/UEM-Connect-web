import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { nativeCalendarPayload } from "../src/shortcut/native-calendar.js";

// Execute the emitted workflow's data/control wiring with simulated Calendar
// results. Deliberately include unrelated events to cover the reported false
// positive: a query result alone is not evidence of an imported course.
function simulate(
  workflow,
  payload,
  candidates,
  { calendar = { name: payload.calendarName } } = {},
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
        case "filter.calendarevents": result = queries++ === 0 ? candidates : [...candidates, ...written]; break;
        case "properties.calendarevents":
          assert.equal(p.WFContentItemPropertyName, "Notes");
          result = resolve(p.WFInput, item).notes ?? ""; break;
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
          assert.equal(resolve(p.WFCalendarDescriptor, item), calendar);
          result = { title: resolve(p.WFCalendarItemTitle, item), notes: resolve(p.WFCalendarItemNotes, item) };
          written.push(result); break;
        case "showincalendar": result = resolve(p.WFEvent, item); assert.ok(written.includes(result)); break;
        default: assert.fail(`unsupported simulated action: ${kind}`);
      }
      if (p.UUID) outputs.set(p.UUID, result);
    }
    return result;
  }
  run(0, actions.length);
  return { alerts, written, calendars };
}

const workflows = ["default", "apple-maps"].map((variant) => {
  const code = `import importlib.util,json; s=importlib.util.spec_from_file_location('package','scripts/package-safari-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.package('test','${variant}'),ensure_ascii=False))`;
  return JSON.parse(execFileSync("python3", ["-c", code], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  }));
});

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

test("empty calendars and unrelated personal/holiday events do not block import or inflate saved count", async () => {
  const payload = await sample();
  const unrelated = [
    { notes: "" }, { notes: "中国大陆节假日" },
    { notes: "[UEM-TERM:jwxt:80]" },
    { notes: `引用 ${payload.groupMarker}` },
    { notes: `${payload.groupMarker} suffix` },
  ];
  for (const workflow of workflows) for (const candidates of [[], unrelated]) {
    const result = simulate(workflow, payload, candidates);
    assert.equal(result.calendars, 1);
    assert.equal(result.written.length, payload.count);
    assert.ok(!result.alerts.some((a) => a.title.includes("已有应大通课表")));
    assert.match(result.alerts.find((a) => a.title === "课表添加结果").message, new RegExp(`系统日历已保存：${payload.count}`));
  }
});

test("a real exact term marker after unrelated candidates prevents all calendar writes", async () => {
  const payload = await sample();
  for (const workflow of workflows) {
    const result = simulate(workflow, payload, [{ notes: "个人日程" }, { notes: `课程备注\r\n${payload.groupMarker}\r\n` }]);
    assert.equal(result.calendars, 0);
    assert.equal(result.written.length, 0);
    assert.equal(result.alerts.length, 1);
    assert.match(result.alerts[0].message, /日程：1 条/);
  }
});

test("marker patterns treat brackets and metacharacters literally", async () => {
  const payload = await sample();
  const regex = new RegExp(payload.groupMarkerPattern.replace(/^\(\?m\)/, ""), "m");
  assert.ok(regex.test(payload.events[0].notes));
  assert.ok(!regex.test("U")); // An unescaped [UEM-TERM:...] is a character class.
  assert.ok(!regex.test(payload.groupMarker.replace(":84]", ":840]")));
});

test("missing calendar output still stops before writing courses", async () => {
  const payload = await sample();
  const result = simulate(workflows[0], payload, [], { calendar: null });
  assert.equal(result.written.length, 0);
  assert.ok(result.alerts.some((a) => a.title === "未取得新建的课表日历"));
});
