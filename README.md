# IT 智云社 · 校园门户

基于 React、Vite、Tailwind CSS 4 和 shadcn/ui 的纯静态校园网站，包含「导航 / 应大通 / 下载 / 课表导出」四个页面，默认进入校园导航。

## 启动

```sh
pnpm install
pnpm build
pnpm start
```

网站监听 `0.0.0.0:8080`；开发模式运行 `pnpm dev`，默认端口 5178。也可以直接把 `dist/` 部署到静态文件服务器。

## 页面与交互

- **导航**：去掉「全校通用」，按域名归入华科（`ncist.edu.cn`）与防灾（`cidp.edu.cn`）两栏；本站「课表导出」放在华科栏开头，下载页也可进入。支持实时搜索、分类、站点展开与本地收藏。按 `/` 可聚焦搜索框。
- **应大通**：应用介绍、用户提供的课表和地图实机截图，点击图片可放大。
- **下载**：Android 最新 APK 代理下载，以及 iOS 课表导出子页面入口。
- **课表导出**（`#shortcut`）：独立的 iOS Safari 快捷指令子页面，以四步文字引导完成使用。第一步可选择 11 种提醒，并设置默认开启的「导航修复」：在每个日程地址末尾追加 ` 应急管理大学`，关闭后保留原地址。两种导航设置 × 11 种提醒，合计 22 个已签名安装包；从导航首页或下载页进入。顶部 Dock 保持「导航 / 应大通 / 下载」三项。
- 支持浅色 / 深色模式、移动端布局、键盘操作和减少动态效果偏好。收藏与主题只保存在当前浏览器。

## 数据与资源

- `src/data/resources.json`：用户提供的 2026-10-20 校园 Web 资源清单，75 条入口，保留原始分类、校区、状态和来源。历史 / 待核验入口有状态标记；列表不代表所有链接均已实机登录验证。
- `src/data/sites.js`：清单展示映射、本站课表导出入口、社区地址和 Android 下载地址；首页合计 76 个入口（75 个清单站点 + 1 个本站工具）。
- Android 下载：`https://v4.gh-proxy.org/https://github.com/NCIST-IT/UEM-Connect-board/releases/latest/download/uem-connect.apk`。
- `public/images/community.png`：来自用户指定的 [NCIST-IT/resource](https://github.com/NCIST-IT/resource) 中的 `icon-square.png`。
- `public/images/schedule.png`、`campus-map.png`：用户提供的两张实机截图。
- `public/images/app-icon.png`：本地 UEM-Connect 应用项目的图标。

## 设计预设

已通过官方 CLI 应用 **`b1dVJKH6Gm`**：Rhea / Neutral / Orange / Blue charts / Phosphor / Roboto Slab 正文 / Roboto 标题 / Medium radius。中文使用系统字体回退，配置见 `components.json` 与 `src/index.css`。

```sh
pnpm exec shadcn apply --preset b1dVJKH6Gm --yes
```

## 验证与快捷指令维护

```sh
pnpm test
pnpm lint
pnpm build
```

`build` 会核验 22 个安装包及其内置脚本的 SHA-256。快捷指令的学校课表解析、原生日历动作、地址后缀、提醒和结果统计测试保留；网页导航不接收学校账号、密码或课表。快捷指令修改后须重新打包、签名和回读验证，见 [快捷指令说明](docs/safari-shortcut.md)。
