import { AppError } from "../src/lib/errors.js";
const GRADUATE_CATEGORY_WIDS = new Set(["2000002"]);
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function firstText(data, keys) {
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return null;
}
function classify(categoryWid, categoryName) {
  if (categoryWid && GRADUATE_CATEGORY_WIDS.has(categoryWid)) return "graduate";
  const normalized = categoryName?.replace(/\s+/g, "") ?? "";
  if (/研究生|硕士|博士|研究生院/.test(normalized)) return "graduate";
  if (/本科生|本科/.test(normalized)) return "undergraduate";
  return "unknown";
}
function splitDepartment(deptName) {
  const value = text(deptName);
  const parts =
    value
      ?.split("/")
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  return {
    // 门户首页展示的就是这条层级路径；暂时原样保留，不推断正式学院。
    organization: value,
    major: parts[parts.length - 1] ?? null,
  };
}
function organizationFromOrgs(value) {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((item) => (item && typeof item === "object" ? text(item.name) : null))
    .filter((name) => Boolean(name));
  return names[0] ?? null;
}
/** 将门户身份接口转换为不会泄漏原始响应的业务身份模型。 */
export function adaptPortalIdentity(response, fallbackStudentNumber) {
  if (
    String(response.errcode ?? "0") !== "0" ||
    !response.data ||
    typeof response.data !== "object"
  ) {
    throw new AppError(
      "BACKEND",
      "信息门户没有返回有效的用户身份。",
      undefined,
      "PORTAL_SESSION_MISSING",
    );
  }
  const data = response.data;
  const categoryWid = firstText(data, ["categoryWid", "categoryWId"]);
  const categoryName = firstText(data, ["categoryName", "categoryname"]);
  const deptName = firstText(data, ["deptName", "departmentName"]);
  const department = splitDepartment(deptName);
  const directOrganization = firstText(data, [
    "organization",
    "orgName",
    "学院",
  ]);
  const organization =
    department.organization ??
    directOrganization ??
    organizationFromOrgs(data.orgs);
  return {
    studentKind: classify(categoryWid, categoryName),
    categoryWid,
    categoryName,
    studentNumber:
      firstText(data, [
        "studentNumber",
        "studentNo",
        "xh",
        "userNo",
        "loginName",
        "username",
      ]) ??
      fallbackStudentNumber ??
      null,
    name: firstText(data, ["name", "realName", "userName", "xm"]),
    major: firstText(data, ["major", "专业"]) ?? department.major,
    organization,
    className: firstText(data, ["className", "class", "班级"]),
    raw: data,
  };
}
