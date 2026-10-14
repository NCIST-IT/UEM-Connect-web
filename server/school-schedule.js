import { JWXT_ORIGIN, GMS_ORIGIN } from "./transport.js";
import { AppError } from "../src/lib/errors.js";

async function post(transport, origin, path, values = {}) {
  const r = await transport.authFetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer:
        origin === GMS_ORIGIN ? origin + "/login/enterMain/" : origin + "/",
    },
    body: transport.formBody(values),
  });
  const body = await r.text();
  if (
    [401, 403].includes(r.status) ||
    /^(logintimeout|nopermission)$/i.test(body.trim()) ||
    /<input[^>]+(?:pwdFromId|pwdEncryptSalt)/i.test(body) ||
    /<title>[^<]*登录/i.test(body)
  ) {
    throw new AppError(
      "AUTH",
      "学校会话已失效，请重新登录。",
      undefined,
      "SCHOOL_SESSION_EXPIRED",
    );
  }
  if (!r.ok)
    throw new AppError("BACKEND", `学校返回 HTTP ${r.status}，请稍后重试。`);
  return body;
}
function json(body) {
  try {
    const value = JSON.parse(body);
    if (
      value?.type === "sessionout" ||
      (value?.success === false && value.loginUrl)
    )
      throw new AppError(
        "AUTH",
        "学校会话已失效。",
        undefined,
        "SCHOOL_SESSION_EXPIRED",
      );
    return value;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("DATA", "学校课表格式无法解析。");
  }
}
async function gmsMeta(transport) {
  await post(transport, GMS_ORIGIN, "/grzxgl/enterGrzx");
  await post(transport, GMS_ORIGIN, "/grzxgl/enterDkb4Xs");
  const meta = json(await post(transport, GMS_ORIGIN, "/grzxgl/getDkbJbxx4Xs"));
  if (
    !meta.xqbh ||
    !Number.isInteger(Number(meta.zdzc)) ||
    Number(meta.zdzc) < 1 ||
    Number(meta.zdzc) > 60
  )
    throw new AppError("DATA", "研究生学期信息不完整。");
  return meta;
}
export async function getSemesters(state, transport) {
  if (state.identity.studentKind === "undergraduate") {
    const data = json(
      await post(transport, JWXT_ORIGIN, "/Teacher/TimeTableHandler.ashx", {
        action: "initTablePage",
        isPublic: 1,
      }),
    );
    if (!Array.isArray(data.Sems))
      throw new AppError("DATA", "学校未提供可用学期。");
    const semesters = data.Sems.filter(
      (s) => Number.isSafeInteger(Number(s.Id)) && Number(s.Id) > 0,
    ).map((s) => ({
      id: String(s.Id),
      name: String(s.Name ?? s.Id),
      current:
        s.IsSelected === true || s.IsSelected === "true" || s.IsSelected === 1,
    }));
    if (!semesters.length) throw new AppError("DATA", "学校未提供可用学期。");
    if (!semesters.some((s) => s.current)) semesters[0].current = true;
    state.semesters = semesters;
    return { semesters };
  }
  // Only a current semester is verified for GMS. Never invent historical IDs.
  state.gmsMeta = await gmsMeta(transport);
  state.semesters = [
    {
      id: String(state.gmsMeta.xqbh),
      name: String(state.gmsMeta.xqmc ?? "研究生当前学期"),
      current: true,
    },
  ];
  return {
    semesters: state.semesters,
    notice: "研究生系统目前仅确认当前学期；此处只展示学校实际提供的学期。",
  };
}
export async function getSchedule(state, transport, semesterId) {
  const semester = state.semesters?.find((s) => s.id === semesterId);
  if (!semester) throw new AppError("DATA", "请选择学校提供的学期。");
  if (state.identity.studentKind === "undergraduate") {
    const raw = json(
      await post(transport, JWXT_ORIGIN, "/Teacher/TimeTableHandler.ashx", {
        action: "getTeacherTimeTable",
        semId: Number(semesterId),
        isShowStudent: 1,
        testTeacherTimeTablePublishStatus: 1,
      }),
    );
    // CurrentSemId describes the school's current term, not necessarily the
    // term queried through semId. The selected, allowlisted request owns the
    // response's semester identity; retain upstream metadata without rewriting it.
    if (!Array.isArray(raw.Data))
      throw new AppError("DATA", "学校未返回有效的课表记录。");
    return { source: "jwxt", semester, raw };
  }
  const meta = await gmsMeta(transport);
  if (String(meta.xqbh) !== semesterId)
    throw new AppError("DATA", "研究生当前学期已变化，请重新读取学期。");
  await post(transport, GMS_ORIGIN, "/grzxgl/enterDkb4Xs");
  const raw = json(
    await post(transport, GMS_ORIGIN, "/grzxgl/getDkb4Xs", {
      xqbh: meta.xqbh,
      zdzc: meta.zdzc,
    }),
  );
  if (
    !Array.isArray(raw) ||
    raw.length !== Number(meta.zdzc) ||
    !raw.every(Array.isArray)
  )
    throw new AppError("DATA", "研究生大课表周数不完整。");
  return { source: "gms", semester, raw, meta };
}
