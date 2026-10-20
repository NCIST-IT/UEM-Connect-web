import resources from "./resources.json";

const directoryItems = [
  {
    category: "教务与图书",
    name: "课表导出",
    url: "#shortcut",
    page: "shortcut",
    campus: "全校",
    status: "本站工具",
    description: "将学校课表添加到 iPhone 日历",
    icon: "calendar",
  },
  ...resources.items,
];

export const categories = [
  "全部站点",
  ...new Set(resources.items.map((item) => item.category)),
];
export const totalSites = directoryItems.length;
export const researchDate = resources.research_date;

function siteIcon(item) {
  const name = item.name;
  if (/门户|认证|大厅/.test(name)) return "portal";
  if (/邮箱/.test(name)) return "mail";
  if (/校历|预约/.test(name)) return "calendar";
  if (/图书|数字资源/.test(name)) return "library";
  if (/网络|VPN|信息化|IP|托管/.test(name)) return "network";
  if (/招生|就业|招聘|人事/.test(name)) return "jobs";
  if (/研究生|科研|研究所|学院|实验室/.test(name)) return "graduate";
  if (/教务|教学|雨课堂|超星/.test(name)) return "study";
  if (/新闻|学报/.test(name)) return "news";
  return "school";
}

export const schools = [
  {
    id: "shared",
    name: "全校通用",
    fullName: "跨校区资源与服务",
    initials: "UEM",
    campus: "全校",
    motto: "一个校园 · 一站连接",
    tone: "shared",
  },
  {
    id: "ncist",
    name: "华科",
    fullName: "东院 · 原华北科技学院",
    initials: "NCIST",
    campus: "东院",
    motto: "仁爱 · 忠勇 · 严明 · 求是",
    tone: "orange",
  },
  {
    id: "cidp",
    name: "防灾",
    fullName: "西院 · 原防灾科技学院",
    initials: "CIDP",
    campus: "西院",
    motto: "崇德 · 博智 · 扶危 · 定倾",
    tone: "green",
  },
].map((school) => ({
  ...school,
  sites: directoryItems
    .filter((item) => item.campus === school.campus)
    .map((item) => ({
      ...item,
      id: item.url,
      icon: item.icon ?? siteIcon(item),
      featured: /信息门户|统一身份认证|应急管理大学主站/.test(item.name),
      statusLabel: /历史/.test(item.status)
        ? "历史入口"
        : /待核验|待复核/.test(item.status)
          ? "待核验"
          : null,
    })),
}));

export const projectUrl = "https://github.com/NCIST-IT/UEM-Connect-board";
export const communityUrl = "https://github.com/NCIST-IT";
export const androidInstaller =
  "https://v4.gh-proxy.org/https://github.com/NCIST-IT/UEM-Connect-board/releases/latest/download/uem-connect.apk";
