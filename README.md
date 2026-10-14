# 应大通 Web · 课表一次性导出

React + Vite + Tailwind CSS 4 + shadcn/ui 标准组件前端，Node.js HTTP 后端。只实现：学校登录 → 获取课表 → 周课表预览 → 地点前缀选项 → 一次性导出日历。兼容本科 JWXT 与研究生 GMS；不修改 `/srv/ncist` 原 App。

## 启动

```sh
pnpm install
pnpm build
pnpm start
```

默认监听 `0.0.0.0:5177`。开发时分别运行 `pnpm dev:api` 和 `pnpm dev`：后端 `127.0.0.1:3001`，Vite `127.0.0.1:5178`；所有 `/api` 请求由 Vite 同源中转。

环境变量：`UEM_HOST`、`UEM_PORT`；正式环境设置 `NODE_ENV=production`、`UEM_PUBLIC_ORIGIN=https://你的域名`，由 HTTPS 反向代理提供网页及 `/api`。未配置 HTTPS 访问地址的正式环境拒绝登录 API。

## 本次操作的数据

- 浏览器按学校协议 AES 加密密码；后端只接收密文并转发，不保存或记录明文、密码密文。
- 不建立应用登录 Cookie、用户会话表、账号数据库或自动登录。学校 Cookie 经 AES-256-GCM 封装进上下文，只有服务端进程能打开。
- 上下文只存在浏览器内存，有效期从流程开始起 30 分钟。每次后端请求独立创建 CookieJar；刷新页面或服务器重启需要重新登录。
- 课表解析、预览与 ICS 转换在浏览器运行，使用同一份实际日期与时间数据。学校 HTML 只用于解析参数，不执行脚本。
- 导出后的 ICS 只在后端内存中临时保留 10 分钟，随机地址授权读取该文件，支持 GET/HEAD，不依赖网站 Cookie。完成后网页清空本次上下文和课表，下一次需重新登录。
- 无账户凭据、课表或导出文件持久存储。进程不记录请求体或学校 Cookie；启动日志只有监听地址。

首版研究生仅展示现有协议已确认的当前学期；历史学期未核实，不猜测 ID。本科可以选择学校返回的学期。

## 验证

```sh
pnpm test
pnpm lint
pnpm build
```

覆盖协议、Cookie 隔离、上下文加密及过期、两类学生数据、历史学期、手动验证码接口、周课表重叠、ICS 格式、前缀开关和临时文件生命周期。真实账号、验证码及 iPhone 日历添加仍需实机验收。浏览器以 Safari 16.4+ 为 CSS 支持基线，优先验证 iOS 27。

原始个人课表和旧静态测试构建保留在 `.local/`，被 Git 排除，不在正式站点路由及构建中提供。旧页面和脚本仅供本地回归、回滚参考。

## 界面预设

使用用户指定的 shadcn 预设 `b1dUP4I9w2`：Base UI / Mira、Neutral 基色、Orange 主题、Blue 图表色、Phosphor 图标、Roboto Slab / Roboto 字体及 Medium 圆角。配置位于 components.json，使用 JavaScript 组件（tsx=false）。通用组件由官方 CLI 生成，业务只做组合；字体自托管。整体采用暖白背景、橙色重点色与紧凑进度条，仅保留一行工具标题；中文正文使用系统无衬线字体。课表使用 shadcn Table、Button、Dialog，人工验证使用 shadcn Slider；仅微调业务需要的尺寸。Apple 地图适配默认关闭；可选择打开系统日历导入，或下载 .ics 文件。

```sh
pnpm dlx shadcn@latest apply --preset b1dUP4I9w2
```

## Safari 快捷指令试验入口

首页提供已签名 .shortcut 安装文件，点击“添加快捷指令”即可尝试在系统导入，不必手动搭建动作。v11 在 Safari 学校课表页运行后，用原生动作新建独立日历并批量添加全部日程，包含确认、完整备注标记核验防重，并直接统计本次添加动作返回的日程数量；完成后直接打开日历 App。不向本站提交账号、密码、Cookie 或课表。支持本科与研究生已核实的当前学期接口。设置步骤、返回字段和验证边界见 [Safari 快捷指令说明](docs/safari-shortcut.md)。iPhone 实机的权限、日历创建和实际写入仍需用户测试。
