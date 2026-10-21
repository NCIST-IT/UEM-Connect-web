# 应急管理大学 IT智云社

IT 智云社校园门户，提供校园网站导航、应大通应用介绍与下载，以及 iOS 课表导出。网站采用纯静态架构，支持移动端、浅色与深色主题。

## 功能

- **校园导航**：华科（`ncist.edu.cn`）与防灾（`cidp.edu.cn`）两栏，共 63 个入口。支持实时搜索、分类筛选、展开收起和本地收藏，按 `/` 可聚焦搜索框。
- **应大通**：应用功能介绍、课表与校园地图实机截图，支持点击放大。
- **下载**：Android APK 下载与 iOS 课表导出入口。
- **课表导出**：通过 Safari 快捷指令将学校课表添加到 iPhone 日历，提供四步使用引导、11 种提醒选项和默认开启的导航修复。导航修复会在日程地址末尾追加 ` 应急管理大学`，关闭后使用原地址。

顶部导航为「导航 / 应大通 / 下载」；课表导出可从校园导航和下载页进入。主题与收藏仅保存在当前浏览器，网站不接收学校账号、密码或课表数据。

## 本地运行

使用 Node.js 24.22.1 LTS 和 pnpm 12。仓库提供 x86_64 Linux 的 Nix Flake，
安装 direnv 与 nix-direnv 后，执行一次 `direnv allow` 即可在进入目录时自动加载环境。
也可运行 `nix develop`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

开发服务监听 `0.0.0.0:5178`。构建并预览：

```sh
pnpm build
pnpm start
```

预览服务监听 `0.0.0.0:8080`。使用自定义域名预览时，配置允许的 Host：

```sh
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=你的域名 pnpm start
```

## 服务器部署

```sh
pnpm install --frozen-lockfile
pnpm build
```

将 **`dist/`** 部署到域名根目录，由静态 Web 服务器提供服务。站内使用 hash 路由，图片、字体、脚本及快捷指令安装包均使用同源路径，无需在前端填写服务器地址。

[`deploy/nginx.conf`](deploy/nginx.conf) 提供 Nginx 静态站点模板。将 `root` 指向服务器上的 `dist/`；使用已有 HTTPS 站点时，将安全响应头和 `location` 规则合并到对应虚拟主机，并执行 `nginx -t` 检查配置。

生产域名为 **https://uem-it.cn**。NixOS 部署使用 Nginx 1.30.6，配置位于
[`deploy/nixos/web/`](deploy/nixos/web/)，构建环境和 `uem-update` 更新入口定义在
[`flake.nix`](flake.nix)。目录、发布、回滚与安全更新命令见 [NixOS 运维说明](docs/nixos-operations.md)。

开发和预览服务关闭 CORS 放行；生产模板提供同源资源策略、CSP、防框架嵌入与 MIME 嗅探防护。**响应头需要由部署服务器配置，仅上传静态文件不会自动生效。** 详细策略与依赖审计说明见 [部署安全说明](docs/deployment-security.md)。

## 项目结构

```text
src/
  components/       页面组件与 UI 组件
  data/             校园导航清单与项目链接
  lib/              课表模型、日历转换与通用工具
  shortcut/         Safari 快捷指令源码与签名安装包
public/images/      社区头像、应用图标与实机截图
config/             HTTP 安全响应头
deploy/             静态服务器配置模板
  nixos/web/        NixOS Web、网络、证书与 direnv 配置
scripts/            构建、签名与部署检查工具
tests/              课表转换、快捷指令与安全策略测试
```

## 数据与资源

- `src/data/resources.json`：62 条校园网站入口，包含分类、校区和来源信息。
- `src/data/sites.js`：导航展示映射、本站课表导出入口、社区与应用下载链接。
- 社区头像来自 [NCIST-IT/resource](https://github.com/NCIST-IT/resource) 的 `icon-square.png`；课表与地图图片为应用实机截图。
- Android 下载：[应大通 APK](https://v4.gh-proxy.org/https://github.com/NCIST-IT/UEM-Connect-board/releases/latest/download/uem-connect.apk)。

## 技术与设计

React、Vite、Tailwind CSS 4、shadcn/ui 与 Phosphor Icons。shadcn/ui 预设为 **`b1dVJKH6Gm`**：Rhea / Neutral / Orange / Blue charts / Medium radius，正文使用 Roboto Slab，标题使用 Roboto，中文使用系统字体回退。

设计配置见 `components.json` 和 `src/index.css`。

## 检查与维护

```sh
pnpm lint
pnpm build
pnpm test
```

构建会校验 22 个签名快捷指令及内置脚本的 SHA-256，并检查站内资源、下载文件、导航 URL、本机与私网地址、源码映射和敏感文件。已有构建产物可使用 `pnpm check:deployment` 单独检查。学校外链的在线状态由维护者验证。

快捷指令的使用、数据流和打包签名流程见 [课表导出说明](docs/safari-shortcut.md)。
