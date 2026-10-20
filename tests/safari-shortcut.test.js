import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  collectSafariSchedule,
  createSafariCalendar,
} from "../src/shortcut/safari-calendar.js";
import { createShortcutSource } from "../src/shortcut/source.js";

const origin = "https://jw.cidp.edu.cn";
const course = {
  StartDay: "2026-09-07",
  RPDTId: 1,
  LUCode: "TEST",
  LUName: "测试课程",
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
};
function school({
  raw = { CurrentSemId: 84, Data: [course] },
  unselected = false,
} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      assert.equal(new URL(url).origin, origin);
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).get("Cookie"), null);
      assert.equal(new Headers(init.headers).get("Authorization"), null);
      const params = new URLSearchParams(init.body);
      if (params.get("action") === "initTablePage")
        return new Response(
          JSON.stringify({
            Sems: [
              { Id: 84, Name: "当前学期", IsSelected: !unselected },
              { Id: 80, Name: "历史学期", IsSelected: false },
            ],
          }),
        );
      assert.equal(params.get("action"), "getTeacherTimeTable");
      assert.equal(params.get("isShowStudent"), "1");
      return new Response(
        JSON.stringify(
          params.get("semId") === "80"
            ? {
                ...raw,
                Data: raw.Data.map((x) => ({ ...x, StartDay: "2025-09-01" })),
              }
            : raw,
        ),
      );
    },
  };
}
test("Safari uses only same-origin session requests and generates current-semester ICS locally", async () => {
  const mock = school();
  const result = await createSafariCalendar({ origin, ...mock });
  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 3);
  assert.equal(result.filename, "课表.ics");
  assert.equal(mock.calls.length, 2);
  assert.ok(result.ics.includes("DTSTART;TZID=Asia/Shanghai:20260907T080000"));
  assert.ok(result.ics.includes("LOCATION:中区 教学楼 101"));
  assert.ok(!result.ics.includes("LOCATION:应急管理大学"));
});
test("Safari allowlisted semesters retain requested history instead of raw CurrentSemId", async () => {
  const mock = school();
  const packet = await collectSafariSchedule({
    origin,
    ...mock,
    semesterId: "80",
  });
  assert.equal(packet.semester.id, "80");
  assert.equal(packet.raw.CurrentSemId, 84);
  assert.equal(packet.raw.Data[0].StartDay, "2025-09-01");
  await assert.rejects(
    () => collectSafariSchedule({ origin, ...school(), semesterId: "999" }),
    /学期/,
  );
  await assert.rejects(
    () => collectSafariSchedule({ origin, ...school({ unselected: true }) }),
    /学期/,
  );
});
test("Safari suffix repair leaves UIDs unchanged and can be disabled", async () => {
  const plain = await createSafariCalendar({ origin, ...school() });
  const repaired = await createSafariCalendar({
    origin,
    ...school(),
    addUniversitySuffix: true,
  });
  const uids = (s) =>
    s
      .replaceAll("\r\n ", "")
      .split("\r\n")
      .filter((x) => x.startsWith("UID:"));
  assert.deepEqual(uids(plain.ics), uids(repaired.ics));
  assert.ok(repaired.ics.includes("LOCATION:中区 教学楼 101 应急管理大学"));
});
test("Safari GMS reads only the school current-semester metadata and complete week cells", async () => {
  const calls = [];
  const result = await createSafariCalendar({
    origin: "https://gms.ncist.edu.cn",
    fetchImpl: async (url, init) => {
      calls.push(new URL(url).pathname);
      assert.equal(init.credentials, "same-origin");
      assert.equal(new URL(url).origin, "https://gms.ncist.edu.cn");
      if (url.endsWith("getDkbJbxx4Xs"))
        return new Response(
          JSON.stringify({ xqbh: "g1", xqmc: "研究生当前学期", zdzc: 1 }),
        );
      if (url.endsWith("getDkb4Xs"))
        return new Response(
          JSON.stringify([
            [
              { jc: "节次", z1: "周一(2026-09-07)" },
              ...Array.from({ length: 10 }, (_, i) => ({
                jc: String(i + 1),
                z1:
                  i < 2
                    ? [
                        {
                          kch: "G1",
                          kcmc: "G1【研究课程】",
                          rkjs: "教师",
                          js: "101",
                          jxrwId: "task",
                        },
                      ]
                    : [],
              })),
            ],
          ]),
        );
      return new Response("page");
    },
  });
  assert.equal(result.eventCount, 1);
  assert.ok(result.ics.includes("DTEND;TZID=Asia/Shanghai:20260907T094000"));
  assert.deepEqual(calls, [
    "/grzxgl/enterGrzx",
    "/grzxgl/enterDkb4Xs",
    "/grzxgl/getDkbJbxx4Xs",
    "/grzxgl/enterDkb4Xs",
    "/grzxgl/getDkb4Xs",
  ]);
});
test("Safari refuses portal/tool/non-school origins before any request", async () => {
  for (const page of [
    "https://my1.ncist.edu.cn",
    "https://auth.ncist.edu.cn",
    "http://192.168.1.3:5177",
    "https://jw.cidp.edu.cn.evil.test",
    "http://jw.cidp.edu.cn",
  ]) {
    let calls = 0;
    await assert.rejects(
      () =>
        collectSafariSchedule({
          origin: page,
          fetchImpl: async () => {
            calls++;
          },
        }),
      /Safari/,
    );
    assert.equal(calls, 0);
  }
});
test("Safari expires or times out visibly and blocks calendars with unknown dates", async () => {
  await assert.rejects(
    () =>
      createSafariCalendar({
        origin,
        fetchImpl: async () => new Response("logintimeout"),
      }),
    /失效/,
  );
  await assert.rejects(
    () =>
      createSafariCalendar({
        origin,
        fetchImpl: async () => new Response('<input id="pwdEncryptSalt">'),
      }),
    /失效/,
  );
  await assert.rejects(
    () =>
      createSafariCalendar({
        origin,
        ...school({ raw: { Data: [{ ...course, StartDay: undefined }] } }),
      }),
    /日期/,
  );
  await assert.rejects(
    () =>
      collectSafariSchedule({
        origin,
        timeoutMs: 5,
        fetchImpl: (_url, { signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      }),
    /超时/,
  );
});
test("standalone Shortcuts bundle calls completion once, needs no cookie access, module loader or tool backend", async () => {
  const bundle = await readFile(
    new URL("../src/generated/safari-shortcut.txt", import.meta.url),
    "utf8",
  );
  const source = createShortcutSource(bundle);
  let resolve;
  const done = new Promise((r) => {
    resolve = r;
  });
  const results = [];
  const fakeDocument = {
    get cookie() {
      throw new Error("Cookies must never be read");
    },
  };
  vm.runInNewContext(source, {
    location: { origin },
    fetch: school().fetchImpl,
    document: fakeDocument,
    completion: (result) => {
      results.push(result);
      resolve(result);
    },
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    btoa,
  });
  const result = await done;
  assert.equal(typeof result, "string");
  const payload = JSON.parse(result);
  assert.equal(payload.version, 10);
  assert.equal(payload.events.length, 3);
  assert.equal(payload.events[0].start, "2026-09-07T00:00:00Z");
  assert.equal(results.length, 1);
  assert.ok(!source.includes("document.cookie"));
  assert.ok(!/\bimport\s/.test(source));
  assert.ok(!source.includes("/api/"));
});

test("downloadable standalone scripts preserve their selected navigation repair setting", async () => {
  for (const [name, repair] of [
    ["safari-default.js", false],
    ["safari-apple-maps.js", true],
  ]) {
    const source = await readFile(
      new URL(`../src/generated/${name}`, import.meta.url),
      "utf8",
    );
    let finish;
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    vm.runInNewContext(source, {
      location: { origin },
      fetch: school().fetchImpl,
      completion: finish,
      URL,
      URLSearchParams,
      AbortController,
      setTimeout,
      clearTimeout,
      TextEncoder,
      TextDecoder,
      btoa,
    });
    const result = await done;
    assert.equal(typeof result, "string");
    const payload = JSON.parse(result);
    assert.ok(
      payload.events.every(
        (event) =>
          event.location ===
          (repair ? "中区 教学楼 101 应急管理大学" : "中区 教学楼 101"),
      ),
    );
  }
});

test("signed installers are pinned to the current reviewed script and expected package type", async () => {
  const { createHash } = await import("node:crypto");
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const directory = new URL("../src/shortcut/install/", import.meta.url);
  const alerts = JSON.parse(
    await readFile(
      new URL("../src/shortcut/alerts.json", import.meta.url),
      "utf8",
    ),
  );
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", directory), "utf8"),
  );
  assert.equal(manifest.length, alerts.length * 2);
  assert.deepEqual(
    manifest.map((item) => `${item.variant}/${item.alert}`).sort(),
    ["default", "apple-maps"]
      .flatMap((variant) => alerts.map((alert) => `${variant}/${alert.id}`))
      .sort(),
  );
  for (const item of manifest) {
    const signed = await readFile(new URL(item.file, directory));
    const script = await readFile(
      new URL(`../src/generated/safari-${item.variant}.js`, import.meta.url),
    );
    assert.equal(signed.subarray(0, 4).toString(), "AEA1");
    assert.equal(sha256(signed), item.signedSha256);
    assert.equal(sha256(script), item.scriptSha256);
    assert.equal(item.payloadCompared, true);
  }
});

test("v12 standalone failures return a nonempty string with the failing school step", async () => {
  const source = await readFile(
    new URL("../src/generated/safari-default.js", import.meta.url),
    "utf8",
  );
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  vm.runInNewContext(source, {
    location: { origin },
    fetch: async () => new Response("unavailable", { status: 503 }),
    completion: finish,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    btoa,
  });
  const result = await done;
  assert.equal(typeof result, "string");
  const payload = JSON.parse(result);
  assert.equal(payload.version, 10);
  assert.deepEqual(payload.events, []);
  assert.match(payload.error, /读取本科学期/);
  assert.match(payload.error, /HTTP 503/);
});

test("native workflow confirms and writes only into a newly created calendar, counting returned events", async () => {
  const { execFileSync } = await import("node:child_process");
  const script = `import importlib.util,json; s=importlib.util.spec_from_file_location('package','scripts/package-safari-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.package('standalone-test-script','default'),ensure_ascii=False))`;
  const native = JSON.parse(
    execFileSync("python3", ["-c", script], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    }),
  );
  const actions = native.WFWorkflowActions;
  const get = (name) =>
    actions.find(
      (a) => a.WFWorkflowActionIdentifier === `is.workflow.actions.${name}`,
    ).WFWorkflowActionParameters;
  assert.ok(
    !actions.some((a) =>
      /previewdocument|base64encode|setitemname|share$/.test(
        a.WFWorkflowActionIdentifier,
      ),
    ),
  );
  const run = get("runjavascriptonwebpage"),
    text = get("gettext"),
    dictionary = get("detect.dictionary");
  assert.equal(
    Object.values(text.WFTextActionText.Value.attachmentsByRange)[0].OutputUUID,
    run.UUID,
  );
  assert.equal(dictionary.WFInput.Value.OutputUUID, text.UUID);
  const calendar = get("addnewcalendar"),
    event = get("addnewevent");
  assert.equal(event.WFCalendarDescriptor.Value.OutputUUID, calendar.UUID);
  assert.equal(event.ShowWhenRun, false);
  assert.equal(event.WFCalendarItemAllDay, false);
  assert.ok(!Object.hasOwn(event, "WFCalendarItemCalendar"));
  const confirmation = actions.findIndex(
    (a) => a.WFWorkflowActionParameters.WFAlertActionTitle === "确认添加课表",
  );
  const creation = actions.findIndex((a) =>
    a.WFWorkflowActionIdentifier.endsWith("addnewcalendar"),
  );
  assert.ok(confirmation < creation);
  assert.equal(
    actions[confirmation].WFWorkflowActionParameters
      .WFAlertActionCancelButtonShown,
    true,
  );
  const filters = actions
    .filter((a) =>
      a.WFWorkflowActionIdentifier.endsWith("filter.calendarevents"),
    )
    .map((a) => a.WFWorkflowActionParameters);
  assert.equal(filters.length, 1);
  assert.equal(filters[0].WFContentItemInputParameter, "Library");
  assert.equal(filters[0].WFContentItemLimitEnabled, true);
  assert.equal(filters[0].WFContentItemLimitNumber, 1);
  const predicate =
    filters[0].WFContentItemFilter.Value.WFActionParameterFilterTemplates[0];
  assert.equal(predicate.Property, "Calendar");
  assert.equal(predicate.Operator, 4);
  assert.equal(
    predicate.Values.Enumeration.WFSerializationType,
    "WFStringSubstitutableState",
  );
  const nameField = actions.find(
    (a) => a.WFWorkflowActionParameters.WFDictionaryKey === "calendarName",
  );
  assert.equal(
    predicate.Values.Enumeration.Value.Value.OutputUUID,
    nameField.WFWorkflowActionParameters.UUID,
  );
  const details = actions.filter((a) =>
    a.WFWorkflowActionIdentifier.endsWith("properties.calendarevents"),
  );
  assert.equal(details.length, 1);
  assert.equal(
    details[0].WFWorkflowActionParameters.WFContentItemPropertyName,
    "Calendar",
  );
  const patternField = actions.find(
    (a) =>
      a.WFWorkflowActionParameters.WFDictionaryKey === "calendarNamePattern",
  );
  const match = actions.find((a) =>
    a.WFWorkflowActionIdentifier.endsWith("text.match"),
  );
  assert.equal(
    match.WFWorkflowActionParameters.WFMatchTextPattern.Value
      .attachmentsByRange["{0, 1}"].OutputUUID,
    patternField.WFWorkflowActionParameters.UUID,
  );
  const counts = actions.filter((a) =>
    a.WFWorkflowActionIdentifier.endsWith(".count"),
  );
  assert.equal(counts.length, 2);
  for (const count of counts) {
    assert.ok(!Object.hasOwn(count.WFWorkflowActionParameters, "WFInput"));
    const verified = actions.find(
      (a) =>
        a.WFWorkflowActionParameters.UUID ===
        count.WFWorkflowActionParameters.Input.Value.OutputUUID,
    );
    assert.equal(
      verified.WFWorkflowActionIdentifier,
      "is.workflow.actions.repeat.each",
    );
    assert.equal(verified.WFWorkflowActionParameters.WFControlFlowMode, 2);
  }
  const writeRepeat =
    actions[
      actions.findIndex(
        (a) =>
          a.WFWorkflowActionIdentifier === "is.workflow.actions.addnewevent",
      ) + 1
    ];
  assert.equal(
    writeRepeat.WFWorkflowActionIdentifier,
    "is.workflow.actions.repeat.each",
  );
  assert.equal(
    counts[1].WFWorkflowActionParameters.Input.Value.OutputUUID,
    writeRepeat.WFWorkflowActionParameters.UUID,
  );
  const dates = actions
    .filter((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.date")
    .map((a) => a.WFWorkflowActionParameters);
  assert.equal(dates.length, 2);
  for (const [field, sourceDate] of [
    [event.WFCalendarItemStartDate, dates[0]],
    [event.WFCalendarItemEndDate, dates[1]],
  ]) {
    assert.equal(field.WFSerializationType, "WFTextTokenString");
    assert.equal(field.Value.string, "\uFFFC");
    const attachment = field.Value.attachmentsByRange["{0, 1}"];
    assert.equal(attachment.OutputUUID, sourceDate.UUID);
    assert.deepEqual(attachment.Aggrandizements, [
      {
        Type: "WFDateFormatVariableAggrandizement",
        WFDateFormatStyle: "ISO 8601",
        WFISO8601IncludeTime: true,
      },
    ]);
  }
  assert.ok(dates.every((a) => a.WFDateActionMode === "Specified Date"));
  const itemFields = actions.filter(
    (a) =>
      a.WFWorkflowActionIdentifier.endsWith("getvalueforkey") &&
      a.WFWorkflowActionParameters.WFInput.Value.Type === "Variable",
  );
  assert.equal(itemFields.length, 5);
  assert.ok(
    itemFields.every(
      (a) =>
        a.WFWorkflowActionParameters.WFInput.Value.VariableName ===
        "Repeat Item",
    ),
  );
  for (const a of actions.filter(
    (a) =>
      a.WFWorkflowActionIdentifier.endsWith("conditional") &&
      a.WFWorkflowActionParameters.WFControlFlowMode === 0,
  )) {
    const params = a.WFWorkflowActionParameters;
    if (
      counts.some(
        (count) =>
          count.WFWorkflowActionParameters.UUID ===
          params.WFInput.Variable.Value.OutputUUID,
      )
    ) {
      assert.equal(params.WFCondition, 2);
      assert.equal(params.WFNumberValue, 0);
    } else {
      assert.equal(params.WFCondition, 100);
    }
    assert.ok(
      !Object.hasOwn(a.WFWorkflowActionParameters, "WFConditionalActionString"),
    );
  }
  function validateTokens(value) {
    if (!value || typeof value !== "object") return;
    if (value.WFSerializationType === "WFTextTokenString")
      for (const range of Object.keys(value.Value.attachmentsByRange)) {
        const [index, length] = range.match(/\d+/g).map(Number);
        assert.equal(length, 1);
        assert.equal(value.Value.string.slice(index, index + length), "\uFFFC");
      }
    for (const nested of Object.values(value)) validateTokens(nested);
  }
  validateTokens(native);
});

test("native calendar write keys are grounded in iOS 27 and missing calendar output is guarded", async () => {
  const { execFileSync } = await import("node:child_process");
  const code = `import importlib.util,json; s=importlib.util.spec_from_file_location('package','scripts/package-safari-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.package('test','default'),ensure_ascii=False))`;
  const workflow = JSON.parse(
    execFileSync("python3", ["-c", code], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    }),
  );
  const schema = JSON.parse(
    await readFile(
      new URL("./fixtures/ios27-calendar-schema.json", import.meta.url),
      "utf8",
    ),
  );
  const actions = workflow.WFWorkflowActions;
  for (const action of actions) {
    const tool = schema.tools[action.WFWorkflowActionIdentifier];
    if (!tool) continue;
    assert.ok(tool.platforms.includes("iOS 27 Simulator"));
    const allowed = new Set([
      "UUID",
      "CustomOutputName",
      ...tool.parameters.map((p) => p.key),
    ]);
    for (const key of Object.keys(action.WFWorkflowActionParameters))
      assert.ok(
        allowed.has(key),
        `${action.WFWorkflowActionIdentifier}: ${key}`,
      );
  }
  const created = actions.find((a) =>
    a.WFWorkflowActionIdentifier.endsWith("addnewcalendar"),
  ).WFWorkflowActionParameters.UUID;
  const guard = actions.findIndex(
    (a) =>
      a.WFWorkflowActionIdentifier.endsWith("conditional") &&
      a.WFWorkflowActionParameters.WFControlFlowMode === 0 &&
      a.WFWorkflowActionParameters.WFInput.Variable.Value.OutputUUID ===
        created,
  );
  const write = actions.findIndex((a) =>
    a.WFWorkflowActionIdentifier.endsWith("addnewevent"),
  );
  assert.ok(guard > 0 && guard < write);
  assert.equal(actions[guard].WFWorkflowActionParameters.WFCondition, 100);
});
