import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createDecipheriv } from "node:crypto";
import { createApp } from "../server/app.js";
import { createContextCodec } from "../server/context.js";
import { createSchoolTransport } from "../server/transport.js";
import { CookieJar } from "../server/cookie-jar.js";
import { encryptPassword } from "../src/lib/school-crypto.js";
import { normalizeSchedule } from "../src/lib/schedule-model.js";
import { convertScheduleToIcs } from "../src/lib/timetable-to-ics.js";

const salt = "0123456789abcdef";
function mockSchool({ captcha = false } = {}) {
  const calls = [];
  const cookies = (req) =>
    Object.fromEntries(
      (req.headers.get("cookie") ?? "")
        .split("; ")
        .filter(Boolean)
        .map((s) => s.split("=")),
    );
  const reply = (body, status = 200, headers = {}) =>
    new Response(typeof body === "object" ? JSON.stringify(body) : body, {
      status,
      headers,
    });
  const fetchImpl = async (url, req) => {
    calls.push({ url, body: req.body, headers: new Headers(req.headers) });
    const u = new URL(url),
      path = u.pathname,
      c = cookies(req);
    if (u.hostname === "auth.ncist.edu.cn" && path === "/authserver/login") {
      if (req.method === "POST") {
        const form = new URLSearchParams(req.body),
          user = form.get("username");
        return reply("", 302, {
          location: `https://my1.ncist.edu.cn/login?ticket=ST-${user}`,
          "set-cookie": `CASTGC=${user}; Path=/; Secure`,
        });
      }
      if (u.searchParams.get("service") === "https://gms.ncist.edu.cn/")
        return reply("", 302, {
          location: `https://gms.ncist.edu.cn/?ticket=ST-${c.CASTGC}`,
        });
      return reply(
        `<div id="pwdFromId"><input id="pwdEncryptSalt" value="${salt}"><input id="execution" value="exec"><input id="lt" value="lt"></div><script>var captchaSwitch="2";</script>`,
        200,
        { "set-cookie": "JSESSIONID=auth; Path=/authserver; Secure" },
      );
    }
    if (path.endsWith("checkNeedCaptcha.htl"))
      return reply({ isNeed: captcha });
    if (path.endsWith("toSliderCaptcha.htl")) return reply("ok");
    if (path.endsWith("openSliderCaptcha.htl"))
      return reply({
        bigImage: "image",
        smallImage: Buffer.from("PNG" + salt).toString("base64"),
        tagWidth: 90,
        yHeight: 3,
      });
    if (path.endsWith("verifySliderCaptcha.htl"))
      return reply({ errorCode: 1 });
    if (u.hostname === "my1.ncist.edu.cn" && path === "/login") {
      const user = u.searchParams.get("ticket").slice(3);
      return reply("portal", 200, {
        "set-cookie": `portal=${user}; Path=/; Secure`,
      });
    }
    if (path === "/getLoginUser")
      return reply({
        data: {
          categoryName: c.portal === "graduate" ? "学生/研究生" : "学生/本科生",
          categoryWid: c.portal === "graduate" ? "2000002" : "2000001",
          name: c.portal,
          studentNumber: c.portal,
        },
      });
    if (u.hostname === "gms.ncist.edu.cn" && path === "/") {
      const user = u.searchParams.get("ticket").slice(3);
      return reply(
        "gms",
        200,
        new Headers([
          ["Set-Cookie", `JSESSIONID=${user}; Path=/; Secure`],
          ["Set-Cookie", "SSO_LOGIN=1; Path=/; Secure"],
          ["Set-Cookie", "Admin-Token=token; Path=/; Secure"],
        ]),
      );
    }
    if (path === "/LoginHandler.ashx")
      return reply("jwxt", 200, {
        "set-cookie": `EXESAC.SAAS.SessionId=${c.CASTGC ?? "jwxt-session"}; Path=/; Secure`,
      });
    if (path === "/Teacher/TimeTableHandler.ashx") {
      assert.ok(c["EXESAC.SAAS.SessionId"]);
      const body = new URLSearchParams(req.body);
      if (body.get("action") === "initTablePage")
        return reply({
          Sems: [
            { Id: 84, Name: "当前学期", IsSelected: true },
            { Id: 80, Name: "历史学期" },
          ],
        });
      return reply({
        // The school reports its current term even for a historical query.
        CurrentSemId: 84,
        Data: [
          {
            StartDay: body.get("semId") === "80" ? "2025-09-01" : "2026-09-07",
            LUCode: "TEST",
            LUName: "测试课程",
            FullName: "测试教师",
            Classroom: "101",
            RPDTId: 1,
            WeekStart: 1,
            WeekEnd: 1,
            WeekInterval: 0,
            TimeSlotStart: 96,
            TimeSlotEnd: 116,
            OnMonday: true,
          },
        ],
      });
    }
    if (path.startsWith("/grzxgl/enter")) return reply("<div>组件</div>");
    if (path.endsWith("getDkbJbxx4Xs"))
      return reply({
        xqbh: "g-2026",
        xqmc: "研究生当前学期",
        dqzc: 1,
        zdzc: 1,
      });
    if (path.endsWith("getDkb4Xs"))
      return reply([
        [
          { jc: "节次", z1: "2026-09-07" },
          ...Array.from({ length: 10 }, (_, i) => ({
            jc: String(i + 1),
            z1:
              i < 2
                ? JSON.stringify([
                    {
                      kch: "G1",
                      kcmc: "G1【研究生课程】",
                      rkjs: "教师",
                      js: "101",
                      jxrwId: "task",
                    },
                  ])
                : "[]",
          })),
        ],
      ]);
    throw new Error("Unexpected upstream route: " + path);
  };
  return { fetchImpl, calls };
}
async function start(t, options = {}) {
  const server = createApp(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, data, origin = base) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  return { base, post };
}
async function login(post, user) {
  const prepared = await post("auth/prepare", { username: user });
  assert.equal(prepared.status, 200);
  const logged = await post("auth/login", {
    context: prepared.data.context,
    encryptedPassword: encryptPassword(
      "synthetic-password",
      prepared.data.encryptionSalt,
    ),
  });
  assert.equal(logged.status, 200);
  return logged.data;
}
test("browser encryption matches school CBC; actual password never sent as plaintext", () => {
  const cipher = encryptPassword("synthetic-password", salt);
  const decipher = createDecipheriv(
    "aes-128-cbc",
    Buffer.from(salt),
    Buffer.alloc(16),
  );
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(cipher, "base64")),
    decipher.final(),
  ]);
  assert.equal(decoded.subarray(64).toString(), "synthetic-password");
});
test("sealed contexts are opaque, expire, reject tampering/restart, and reject credentials", () => {
  let time = 1_800_000_000_000;
  const codec = createContextCodec({ now: () => time });
  const state = codec.fresh("user");
  state.cookies.cookies = [{ name: "secret", value: "sensitive-cookie" }];
  const sealed = codec.seal(state);
  assert.ok(!sealed.includes("sensitive-cookie"));
  assert.deepEqual(codec.open(sealed), state);
  assert.throws(() => codec.open("x" + sealed), /过期/);
  assert.throws(
    () => createContextCodec({ now: () => time }).open(sealed),
    /过期/,
  );
  assert.throws(
    () => codec.seal({ ...state, encryptedPassword: "anything" }),
    /Credentials/,
  );
  time += 30 * 60 * 1000;
  assert.throws(() => codec.open(sealed), /过期/);
});
test("cookie matching enforces domain, path, Secure and cross-domain Set-Cookie restrictions", () => {
  const jar = new CookieJar();
  jar.storeResponse(
    new Response("", {
      headers: new Headers([
        ["Set-Cookie", "school=one; Path=/authserver; Secure"],
        ["Set-Cookie", "evil=one; Domain=evil.example; Path=/"],
      ]),
    }),
    "https://auth.ncist.edu.cn/authserver/login",
  );
  assert.equal(
    jar.header("https://auth.ncist.edu.cn/authserver/login"),
    "school=one",
  );
  assert.equal(jar.header("https://my1.ncist.edu.cn/authserver/login"), "");
  assert.equal(jar.header("https://auth.ncist.edu.cn/"), "");
  assert.equal(jar.header("http://auth.ncist.edu.cn/authserver/login"), "");
});
test("redirects cannot take requests or cookies outside school origins", async () => {
  let calls = 0;
  const transport = createSchoolTransport(undefined, {
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 302,
        headers: { Location: "https://evil.example/steal" },
      });
    },
  });
  await assert.rejects(
    () => transport.authFetch("https://auth.ncist.edu.cn/authserver/login"),
    /不允许/,
  );
  assert.equal(calls, 1);
});
test("complete JWXT flow isolates users, supports history and relays exact ICS without app cookies", async (t) => {
  let time = Date.now();
  const codec = createContextCodec({ now: () => time }),
    school = mockSchool();
  const { base, post } = await start(t, {
    codec,
    schoolOptions: school,
    now: () => time,
  });
  const a = await login(post, "undergraduate-a"),
    b = await login(post, "undergraduate-b");
  assert.equal(codec.open(a.context).identity.studentNumber, "undergraduate-a");
  assert.equal(codec.open(b.context).identity.studentNumber, "undergraduate-b");
  assert.ok(
    !JSON.stringify(codec.open(a.context)).includes("synthetic-password"),
  );
  const sent = school.calls.filter(
    (x) => new URL(x.url).hostname === "auth.ncist.edu.cn" && x.body,
  );
  assert.ok(sent.every((x) => !x.body.includes("synthetic-password")));
  const sem = await post("semesters", { context: a.context });
  assert.equal(sem.status, 200);
  assert.equal(sem.data.semesters.length, 2);
  const result = await post("schedule", {
    context: sem.data.context,
    semesterId: "80",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.semester.id, "80");
  assert.equal(result.data.raw.CurrentSemId, 84);
  assert.equal(
    (
      await post("schedule", {
        context: sem.data.context,
        semesterId: "unlisted",
      })
    ).status,
    400,
  );
  const model = normalizeSchedule(result.data),
    ics = convertScheduleToIcs(model).ics;
  assert.equal(model.semester.id, "80");
  assert.equal(model.currentWeek, 1);
  assert.equal(model.occurrences[0].date, "2025-09-01");
  assert.ok(ics.includes("DTSTART;TZID=Asia/Shanghai:20250901T080000"));
  const exported = await post("exports", { context: result.data.context, ics });
  assert.equal(exported.status, 200);
  const path = exported.data.url;
  assert.match(path, /^\/api\/exports\/[A-Za-z0-9_-]{43}\.ics$/);
  const head = await fetch(base + path, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("set-cookie"), null);
  assert.equal(await (await fetch(base + path)).text(), ics);
  assert.equal(await (await fetch(base + path)).text(), ics);
  assert.equal(head.headers.get("content-disposition"), null);
  const download = await fetch(base + path + "?download=1");
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.equal(await download.text(), ics);
  const downloadHead = await fetch(base + path + "?download=1", {
    method: "HEAD",
  });
  assert.equal(
    downloadHead.headers.get("content-disposition"),
    download.headers.get("content-disposition"),
  );
  time += 10 * 60 * 1000;
  assert.equal((await fetch(base + path)).status, 410);
  assert.equal((await fetch(base + path + "?download=1")).status, 410);
});
test("GMS uses its own CAS service/cookies and exposes only verified current semester", async (t) => {
  const school = mockSchool(),
    { post } = await start(t, { schoolOptions: school });
  const a = await login(post, "graduate");
  assert.equal(a.identity.studentKind, "graduate");
  const sem = await post("semesters", { context: a.context });
  assert.equal(sem.data.semesters.length, 1);
  const raw = await post("schedule", {
    context: sem.data.context,
    semesterId: "g-2026",
  });
  assert.equal(raw.status, 200);
  assert.equal(raw.data.source, "gms");
  const model = normalizeSchedule(raw.data);
  assert.equal(model.occurrences.length, 1);
  assert.equal(model.occurrences[0].end, 580);
  assert.ok(
    !school.calls.some((c) => new URL(c.url).hostname === "jw.cidp.edu.cn"),
  );
});
test("manual captcha gates login and verifies signed user trajectory without storing password", async (t) => {
  const school = mockSchool({ captcha: true }),
    { post } = await start(t, { schoolOptions: school });
  const p = await post("auth/prepare", { username: "student" });
  const encryptedPassword = encryptPassword(
    "synthetic-password",
    p.data.encryptionSalt,
  );
  assert.equal(
    (await post("auth/login", { context: p.data.context, encryptedPassword }))
      .status,
    401,
  );
  const verified = await post("auth/captcha/verify", {
    context: p.data.context,
    payload: {
      canvasLength: 280,
      moveLength: 80,
      tracks: [
        { a: 0, b: 0, c: 0 },
        { a: 80, b: 0, c: 200 },
      ],
    },
  });
  assert.equal(verified.data.verified, true);
  assert.equal(
    (
      await post("auth/login", {
        context: verified.data.context,
        encryptedPassword,
      })
    ).status,
    200,
  );
});
test("API rejects plaintext passwords, cross-site requests and malformed contexts", async (t) => {
  const { post, base } = await start(t, { schoolOptions: mockSchool() });
  assert.equal(
    (await post("auth/login", { password: "plaintext" })).status,
    400,
  );
  assert.equal(
    (await post("auth/prepare", { username: "x" }, "https://evil.example"))
      .status,
    403,
  );
  assert.equal((await post("schedule", { context: "invalid" })).status, 401);
  assert.equal(
    (await fetch(base + "/.local/timetable/sample.json")).status,
    404,
  );
});
