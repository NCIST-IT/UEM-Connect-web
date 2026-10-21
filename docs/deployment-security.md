# 部署安全说明

## 发布目录与地址

运行 `pnpm install --frozen-lockfile && pnpm build`，仅发布 **`dist/`**，并将其作为域名根目录。项目源码、`node_modules`、环境文件和密钥不属于发布内容。

页面使用 `#navigation`、`#app`、`#downloads`、`#shortcut` 路由，图片、字体、JS、CSS 与 22 个快捷指令安装包均从当前站点同源加载。前端无需配置服务器 IP 或域名。

`pnpm build` 包含部署检查，也可对已有构建运行 `pnpm check:deployment`。检查范围包括导航 URL 的协议与公开地址格式、重复链接、站内资源存在性、下载文件数量、本机与私网 URL、源码映射和密钥文件。学校外链的在线状态由维护者验证，构建不请求学校服务。

### HTTP 外链

资源清单中以下入口使用 HTTP。它们属于外部导航，不参与本站资源加载；HTTPS 支持情况由目标服务决定。

| 名称 | 地址 |
| --- | --- |
| 西院上网计费自助 | `http://drcomzz.cidp.edu.cn:8080/Self/login/?302=LI` |
| 东院历史教务系统 | `http://jwgl.ncist.edu.cn/` |
| 东院历史图书馆 | `http://lib.ncist.edu.cn/` |
| 超星泛雅网络选修课 | `http://fzxy.fanya.chaoxing.com/` |

## 同源与响应头

`config/security-headers.js` 定义开发和预览服务的安全响应头；`deploy/nginx.conf` 提供生产静态服务器配置。部署到其他 Web 服务器时，需要配置等效响应头。

- **CORS**：开发和预览均为 `cors: false`，生产模板不设置 `Access-Control-Allow-*`。普通请求与 OPTIONS 预检均不获得跨域许可。
- **CORP / COOP**：`same-origin`，限制跨站资源引用并隔离跨来源窗口。
- **CSP**：生产环境的脚本、字体与网络连接限于本站；图片允许本站及内嵌数据；禁止内联脚本、插件对象、iframe、第三方框架嵌入及向外站提交表单。组件运行时样式使用 `style-src 'unsafe-inline'`。
- **其他响应头**：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`；禁用相机、麦克风和定位权限。
- **Host 校验**：Vite 使用允许域名列表，自定义预览域名通过 `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` 配置。正式静态托管的域名由 Web 服务器配置。

预览响应头覆盖正常响应、Host 拒绝、404 与预检响应。生产模板使用 `always` 设置安全头。静态文件本身不携带这些 HTTP 策略，必须由实际部署服务器提供。

同源策略限制浏览器跨域读取及资源引用，不阻止正常的学校、GitHub 和下载外链导航，也不构成公开网站的身份认证。

`uem-it.cn` 的 NixOS 配置位于 `deploy/nixos/web/`，允许 Cloudflare Web Analytics
从 `https://static.cloudflareinsights.com` 加载脚本，并向 `https://cloudflareinsights.com`
及同源 `/cdn-cgi/rum` 上报。其余 CSP 限制及 CORS 策略保持同源约束。

## 运行环境安全更新

- 生产静态服务使用 **Nginx 1.30.6**，由系统 Flake 的 `nixpkgs-web` 输入提供。
- 构建使用 **Node.js 24.22.1 LTS** 安全版。网站 Flake 下载官方 Linux x64 安装包，
  校验固定 SHA-256，并通过 `autoPatchelfHook` 适配 NixOS。
- Node.js 只参与构建，生产请求由 Nginx 直接读取静态文件。

工具依赖锁定在 `flake.lock`，网站源码跟踪 `main`。升级与验证步骤见
[NixOS 运维说明](nixos-operations.md)。

## 前端与数据

- 新窗口外链使用 `noopener noreferrer`。
- 页面动态文本由 React 渲染，不使用 HTML 字符串注入或动态代码执行。
- 主题与收藏存储在当前浏览器，网站不接收学校凭据或课表。
- 快捷指令在已登录的学校页面同源读取课表，数据在设备上交给系统日历处理，详见 [课表导出说明](safari-shortcut.md)。
- 构建关闭源码映射与小资源内联；环境文件和密钥后缀列入 Git 忽略规则。

## 依赖审计

```sh
pnpm audit --prod
pnpm audit
```

2026-10-21 的生产依赖审计为 0 条漏洞。开发工具链有 1 条高危公告：`GHSA-vfj7-8cjw-p6xm`，经 `shadcn → fast-glob → micromatch → braces@3.0.3` 引入，审计时上游未提供补丁。

`shadcn` 是提供构建 CSS 和组件生成 CLI 的开发依赖，该 CLI 依赖链不进入发布的静态文件。维护时应重新运行审计并跟踪上游修复。

## 部署验证

```sh
pnpm lint
pnpm build
pnpm test
```

自动测试检查跨域请求及预检响应不包含许可头、非法 Host 被拒绝，以及预览与 Nginx 模板安全头一致。

应用 Nginx 配置后执行 `nginx -t`，并在最终 HTTPS 域名上检查响应头、四个页面路由、图片和快捷指令下载。TLS、域名解析、防火墙与响应头是否生效以实际服务器配置为准。
