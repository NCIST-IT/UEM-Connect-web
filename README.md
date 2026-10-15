# 应大通课表快捷指令网站

用于安装和查看 Safari 课表快捷指令的纯静态网站。支持本科教务系统与研究生管理系统，将课程批量添加到 iPhone 日历。

## 使用

1. 在网站选择课程提醒，下载并添加快捷指令；使用说明中可选择 Apple 地图适配版。
2. 用 Safari 登录学校信息门户，进入对应系统的课表页面。
3. 从 Safari 分享菜单运行“应大通课表导出”，确认后创建独立课表日历并批量添加课程。
4. 完成后显示本次添加数量并打开日历 App。

当前安装包为 **v13**，共有标准版 / 地图适配版 × 11 种提醒选项，共 22 个已签名文件。iPhone 实机已确认结束时可以打开日历 App。网页所选提醒对应设备上的第二个提醒，首行“出发时间”仍由系统处理。日历颜色可在日历 App 的日历列表中手动设置。

账号、密码、Cookie 和课表数据留在学校页面及用户设备上；网站只提供安装文件、脚本和使用说明。

## 启动与部署

```sh
pnpm install
pnpm build
pnpm start
```

`pnpm start` 在 `0.0.0.0:5177` 提供构建后的静态网站。开发运行 `pnpm dev`，默认地址为 `http://127.0.0.1:5178`。

也可以直接将 `dist/` 部署到静态文件服务器；需保留 `.shortcut` 文件和其他构建资源。

## 验证

```sh
pnpm test
pnpm lint
pnpm build
```

测试覆盖学校课表读取、学期识别、日期与去重、地图前缀、原生日历动作、提醒参数和添加结果统计。构建会核验所有安装包及其内置脚本的 SHA-256，防止发布与源码不一致的安装包。

## 项目结构

- `src/components/SafariShortcut.jsx`：安装入口、提醒选择、地图版本和使用说明。
- `src/shortcut/`：Safari 脚本源码、提醒选项和已签名安装文件。
- `src/lib/schedule-model.js`、`src/lib/timetable-to-ics.js`：快捷指令使用的课表标准化、日期、去重与日程转换逻辑。
- `scripts/*safari-shortcut*`：脚本构建、原生动作打包、签名与回读验证。
- `tests/`：快捷指令与其共用转换逻辑的回归测试。
- `docs/safari-shortcut.md`：实现细节、打包步骤和版本历史。

React + Vite + Tailwind CSS 4 + shadcn/ui；界面使用 Orange 主题和 Phosphor 图标。快捷指令源码修改后须重新打包、签名并回读验证，步骤见 [快捷指令说明](docs/safari-shortcut.md)。
