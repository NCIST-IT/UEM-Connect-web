import {
  readPageSemesters,
  resolveJwxtSemester,
  isSelectedSemester,
} from "./jwxt-semester.js";
import { normalizeSchedule } from "../lib/schedule-model.js";
import { convertScheduleToIcs } from "../lib/timetable-to-ics.js";

const ORIGINS = new Map([
  ["https://jw.cidp.edu.cn", "jwxt"],
  ["https://gms.ncist.edu.cn", "gms"],
]);

// Runs in the active school page. Never reads, serializes or forwards cookies.
export async function collectSafariSchedule({
  origin = globalThis.location?.origin,
  fetchImpl,
  semesterId,
  documentImpl = globalThis.document,
  timeoutMs = 15000,
} = {}) {
  const source = ORIGINS.get(origin);
  if (!source)
    throw new Error(
      `当前页面来源：${origin || "无法取得"}。请先从信息门户进入 jw.cidp.edu.cn 的本科课表或 gms.ncist.edu.cn 的研究生课表，再通过 Safari 分享菜单运行。`,
    );
  fetchImpl ??= globalThis.fetch?.bind(globalThis);
  if (!fetchImpl)
    throw new Error(
      "当前网页脚本环境没有 fetch，无法读取学校接口。请从 Safari 课表页的分享菜单运行。",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  async function post(path, values = {}, asJson = true) {
    const stage =
      values.action === "initTablePage"
        ? "读取本科学期"
        : values.action === "getTeacherTimeTable"
          ? "读取本科课表"
          : path.endsWith("getDkbJbxx4Xs")
            ? "读取研究生学期"
            : path.endsWith("getDkb4Xs")
              ? "读取研究生课表"
              : "打开研究生课表";
    let response;
    try {
      response = await fetchImpl(origin + path, {
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams(
          Object.entries(values).map(([k, v]) => [k, String(v)]),
        ).toString(),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("读取课表超时，请确认学校课表页面可以正常打开后重试。");
      throw new Error(
        `${stage}失败：${error?.name || "网络错误"}。请求可能被网页限制或发生跳转；请确认从信息门户进入课表页面后重试。`,
      );
    }
    if (
      !response.ok ||
      (response.url && new URL(response.url).origin !== origin)
    )
      throw new Error(
        `${stage}失败：HTTP ${response.status}。请从信息门户重新进入课表页面。`,
      );
    const body = await response.text();
    if (new TextEncoder().encode(body).length > 4 * 1024 * 1024)
      throw new Error("学校响应过大，已停止读取。");
    if (
      /^(logintimeout|nopermission)$/i.test(body.trim()) ||
      /pwdEncryptSalt|<title>[^<]*登录/i.test(body)
    )
      throw new Error(
        `${stage}返回登录失效提示。请从信息门户重新进入课表页面。`,
      );
    if (!asJson) return;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(
        `${stage}没有返回 JSON（HTTP ${response.status}）。请确认已打开学校课表页面。`,
      );
    }
    if (
      data?.type === "sessionout" ||
      (data?.success === false && data.loginUrl)
    )
      throw new Error(
        `${stage}返回登录失效提示。请从信息门户重新进入课表页面。`,
      );
    return data;
  }
  try {
    if (source === "jwxt") {
      const init = await post("/Teacher/TimeTableHandler.ashx", {
        action: "initTablePage",
        isPublic: 1,
      });
      const selected = resolveJwxtSemester(init, {
        semesterId,
        page: readPageSemesters(documentImpl, origin),
      });
      const raw = await post("/Teacher/TimeTableHandler.ashx", {
        action: "getTeacherTimeTable",
        semId: Number(selected.Id),
        isShowStudent: 1,
        testTeacherTimeTablePublishStatus: 1,
      });
      if (!Array.isArray(raw?.Data))
        throw new Error("学校未返回有效的本科课表记录。");
      return {
        source,
        semester: {
          id: String(selected.Id),
          name: String(selected.Name ?? selected.Id),
          current: isSelectedSemester(selected.IsSelected),
        },
        raw,
      };
    }
    await post("/grzxgl/enterGrzx", {}, false);
    await post("/grzxgl/enterDkb4Xs", {}, false);
    const meta = await post("/grzxgl/getDkbJbxx4Xs");
    if (
      !meta.xqbh ||
      !Number.isInteger(Number(meta.zdzc)) ||
      Number(meta.zdzc) < 1 ||
      Number(meta.zdzc) > 60
    )
      throw new Error("学校返回的研究生学期信息不完整。");
    if (semesterId && String(meta.xqbh) !== String(semesterId))
      throw new Error("研究生系统仅支持已核实的当前学期。");
    await post("/grzxgl/enterDkb4Xs", {}, false);
    const raw = await post("/grzxgl/getDkb4Xs", {
      xqbh: meta.xqbh,
      zdzc: meta.zdzc,
    });
    return {
      source,
      semester: {
        id: String(meta.xqbh),
        name: String(meta.xqmc ?? "研究生当前学期"),
        current: true,
      },
      raw,
      meta,
    };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("读取课表超时，请确认学校课表页面可以正常打开后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function createSafariCalendar(options = {}) {
  const packet = await collectSafariSchedule(options);
  const snapshot = normalizeSchedule(packet);
  if (snapshot.exportErrors.length)
    throw new Error(snapshot.exportErrors.join("；"));
  if (!snapshot.occurrences.length)
    throw new Error("当前学期没有可导出的已排课日程。");
  const { ics } = convertScheduleToIcs(snapshot, {
    addUniversityPrefix: options.addUniversityPrefix === true,
    calendarName: `应大通 · ${snapshot.semester.name}`,
  });
  return {
    ok: true,
    ics,
    filename: "课表.ics",
    semester: snapshot.semester.name,
    eventCount: snapshot.occurrences.length,
    unscheduledCount: snapshot.unscheduled.length,
    message: snapshot.unscheduled.length
      ? `${snapshot.unscheduled.length} 条未排课记录没有时间，未生成日程。`
      : "",
  };
}
