const compact = (value) => String(value ?? "").replace(/[\s\u00a0]/g, "");
export const isSelectedSemester = (value) =>
  value === true ||
  value === 1 ||
  (typeof value === "string" &&
    ["true", "1"].includes(value.trim().toLowerCase()));

export function academicSemesterKey(value) {
  const match = compact(value).match(
    /((?:19|20)\d{2})[-－—–/]((?:19|20)\d{2})(?:学年度?)?(?:[-_/（(])?第?([一二三123])(?:学期|[）)]|$)/,
  );
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  const term = { 一: 1, 二: 2, 三: 3 }[match[3]] ?? Number(match[3]);
  return `${match[1]}-${match[2]}-${term}`;
}

// Only extract semester labels/selected semester controls. No cookies, scripts,
// hidden login fields, page URLs with queries, or whole HTML are returned.
export function readPageSemesters(documentImpl, origin) {
  const labels = new Set();
  const controls = [];
  const visited = new Set();
  function read(doc, depth = 0) {
    if (!doc || visited.has(doc) || visited.size >= 8 || depth > 2) return;
    visited.add(doc);
    try {
      if (doc.location?.origin && doc.location.origin !== origin) return;
      const text = String(doc.body?.innerText ?? "").slice(0, 200000);
      for (const match of text.matchAll(
        /(?:19|20)\d{2}\s*[-－—–/]\s*(?:19|20)\d{2}\s*(?:学年(?:度)?)?\s*第?\s*[一二三123]\s*学期/g,
      ))
        labels.add(match[0]);
      for (const select of doc.querySelectorAll?.("select") ?? []) {
        if (
          select.hidden ||
          (select.getClientRects && !select.getClientRects().length)
        )
          continue;
        for (const option of select.selectedOptions ?? []) {
          controls.push({
            id: String(option.value ?? ""),
            label: String(option.textContent ?? ""),
            semantic: /sem|学期|xq/i.test(
              `${select.id ?? ""} ${select.name ?? ""}`,
            ),
          });
        }
      }
      for (const frame of doc.querySelectorAll?.("iframe") ?? []) {
        if (
          frame.hidden ||
          (frame.getClientRects && !frame.getClientRects().length)
        )
          continue;
        try {
          read(frame.contentDocument, depth + 1);
        } catch {
          /* Cross-origin frames are deliberately ignored. */
        }
      }
    } catch {
      /* A detached or inaccessible frame is not evidence of a semester. */
    }
  }
  read(documentImpl);
  return { labels: [...labels], controls };
}

export function resolveJwxtSemester(
  init,
  { semesterId, page = { labels: [], controls: [] } } = {},
) {
  const semesters = Array.isArray(init?.Sems)
    ? init.Sems.filter(
        (s) => s && Number.isSafeInteger(Number(s.Id)) && Number(s.Id) > 0,
      )
    : [];
  if (!semesters.length) {
    const fields =
      init && typeof init === "object"
        ? Object.keys(init)
            .filter((x) => !/password|cookie|token/i.test(x))
            .slice(0, 8)
            .join("、")
        : "无";
    throw new Error(
      `学期接口没有返回有效的 Sems 列表（返回字段：${fields || "无"}）。`,
    );
  }
  if (semesterId !== undefined && semesterId !== null && semesterId !== "") {
    const selected = semesters.find((s) => String(s.Id) === String(semesterId));
    if (!selected) throw new Error("指定学期不在学校提供的学期列表中。");
    return selected;
  }
  const ids = new Set();
  for (const control of page.controls ?? []) {
    const selected = semesters.find((s) => String(s.Id) === control.id);
    if (!selected) continue;
    const key = academicSemesterKey(control.label);
    if (
      control.semantic ||
      (key && key === academicSemesterKey(selected.Name)) ||
      (compact(control.label).length >= 3 &&
        compact(control.label) === compact(selected.Name))
    )
      ids.add(String(selected.Id));
  }
  if (ids.size === 1) return semesters.find((s) => ids.has(String(s.Id)));
  if (ids.size > 1)
    throw new Error("页面中有多个不同的学期选择项，无法确定当前所选学期。");
  const keys = new Set(
    (page.labels ?? []).map(academicSemesterKey).filter(Boolean),
  );
  const visible = semesters.filter((s) =>
    keys.has(academicSemesterKey(s.Name)),
  );
  if (visible.length === 1) return visible[0];
  if (visible.length > 1)
    throw new Error("页面上同时显示多个学期，无法唯一匹配所选学期。");
  if (keys.size)
    throw new Error(
      `页面显示的学期未匹配到接口列表（页面：${[...keys].join("、")}；接口：${semesters.length} 项）。`,
    );
  const marked = semesters.filter((s) => isSelectedSemester(s.IsSelected));
  if (marked.length === 1) return marked[0];
  if (marked.length > 1)
    throw new Error("学校返回了多个默认学期，且无法从页面确定所选项。");
  const current = semesters.find(
    (s) => String(s.Id) === String(init.CurrentSemId),
  );
  if (current) return current;
  if (semesters.length === 1) return semesters[0];
  throw new Error(
    `学期接口返回 ${semesters.length} 项，但没有默认标记，且无法读取页面所选学期。请在学校学期选择器中确认选项后重试。`,
  );
}
