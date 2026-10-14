# 网页实现与接口

## 流程

页面只有五步：登录、获取课表、预览确认、导出选项、导出日历。开始和完成页明确一次性操作；不记住登录。学校验证码由使用者手动拖动，网站不识别拼图或自动生成轨迹。

后端借鉴 `/srv/ncist` 的 CAS 页面解析、Cookie 规则、跳转和门户身份判断，移植到本项目；不包含 Expo、Native Core、账户存储。前端借鉴应大通的周课表展示，课程只读。

## API

所有 JSON API 使用同源 POST，不允许任意上游 URL。除 prepare 外，提交浏览器内存中的 `context`；响应中的新 `context` 替换旧值。学校请求限于 HTTPS 的 `auth.ncist.edu.cn`、`my1.ncist.edu.cn`、`jw.cidp.edu.cn`、`gms.ncist.edu.cn`。30 秒超时覆盖读取响应正文，最多读取 4 MiB。

| 路径 | 输入 | 输出 |
| --- | --- | --- |
| `/api/auth/prepare` | `username` | `context, encryptionSalt, captchaRequired, challenge` |
| `/api/auth/captcha/refresh` | `context` | 新 `context, challenge` |
| `/api/auth/captcha/verify` | `context, payload`（真实人工轨迹） | 新 `context, verified` |
| `/api/auth/login` | `context, encryptedPassword` | 新 `context, identity`（最少身份字段） |
| `/api/semesters` | `context` | 新 `context, semesters, notice?` |
| `/api/schedule` | `context, semesterId`（不透明字符串） | 新 `context, source, semester, raw, meta?` |
| `/api/exports` | `context, ics`（浏览器已生成） | `url, expiresAt` |
| `/api/exports/<随机令牌>.ics` | 无应用 Cookie 的 GET/HEAD | 原始 ICS；过期 410 |

错误为 `{ code, message }`，不给请求体或内部堆栈。账号密码错误可重试；上下文及学校会话失效则回到登录。

学校 Cookie、execution、lt 和验证码签名后缀只存在加密上下文及请求处理期间，密码和密码密文不放进上下文。服务端密钥每次启动生成，不落盘，因此重启即失效。上下文无服务器会话表；生命周期约束是网页完成后丢弃，不是持有令牌的调用者不可重复使用。

## 课表与日历

统一浏览器模型包括 `source, semester, periods, semesterStartDate, totalWeeks, occurrences, unscheduled, exportErrors`。`occurrences` 提供真实上课日期、北京时间分钟数、教师和地点，是预览与导出的共同数据源。

JWXT 从 StartDay 和周区间展开日期，时间槽乘 5 分钟。GMS 依据每周表头日期、实际课程单元格和节次时间，分别在同一周、同一天合并连续小节，不能联合不同周的节次集合。日期无法核实时阻止导出；合法未排课记录单独显示且明确不生成日历日程。

`convertScheduleToIcs(snapshot, options)` 为统一入口；`convertTimetableToIcs(raw, options)` 保留严格原始本科 JSON 包装。`addUniversityPrefix` 默认 true，只改变 LOCATION，不改变 UID。日程使用固定 UTC+8 的 Asia/Shanghai VTIMEZONE；DTSTAMP 使用 RFC 要求的 UTC。

正式导出是普通 text/calendar 文件导航，无 webcal、订阅和下载属性。用户在 iOS 系统页面手动新建日历，再添加全部。网页仅声明文件已生成，不能判断系统是否添加成功。

## 已完成与需实测

自动测试和模拟上游 UI 验证与学校实机验证分开。真实学校 prepare 已返回 16 字节加密盐和滑块挑战；这不等于真实账号登录成功。本科、研究生真实账号及 iOS 27 的完整导入需由用户在界面完成验证码和确认。

旧 `uem-connect-calendar-test.service` 使用固定个人课表静态目录；新站使用 `server/index.js` 和 dist。新站不会读取或提供 `.local/`。切换前先完成自动、构建、浏览器验证；回滚可停止新服务再启动旧服务。现有 LAN 端口 5177 规则沿用，不修改持久 NixOS 配置。

2026-10-09 已切换：`uem-connect-web-test.service` 运行真实学校中转版本，监听 `0.0.0.0:5177`。临时模拟上游及本机 5180/5181 验证实例已关闭。用户自行完成真实账号和 iPhone 验收。

## 界面与历史学期修复

通用界面使用 shadcn/ui 官方 CLI 生成的标准按钮、卡片、输入框、标签、原生选择框、开关、提示和 Dialog 弹窗，采用用户指定的 b1dUP4I9w2 预设，保留组件行为，通过 Tailwind 调整尺寸、间距和排版；阶段提示使用五段进度条。页头只保留“课表导出工具”，移除宣传区和重复底部说明。课表用 shadcn Table 与 Button 组合，人工滑块使用 shadcn Slider，取消位置动画，仅保留实际拖动轨迹；中文统一使用系统无衬线字体。周课表是业务布局：七天按屏幕宽度分配列，移除固定最小宽度和横向滚动；手机上点击课程查看教师、地点等详情。页面文案及 HTML/HTTP 语言标记为中文。

JWXT 的 CurrentSemId 表示学校当前学期，并不证明本次 semId 请求的返回数据所属学期。历史课表按用户从学校学期列表选择的 ID 发起请求，使用返回的实际 Data/StartDay，并以所选学期作为预览和导出的身份；不改写上游原始元数据。回归测试模拟查询学期 80、返回 CurrentSemId=84 及 2025-09-01 日期，确认可正常预览和导出历史课表。

导出设置提供两个操作：打开系统日历导入，或下载 .ics 文件。下载使用同一个短期随机地址并加 `?download=1`，返回 attachment 响应；原导入地址仍按 text/calendar 返回。两种方式生成后均清空当前学校上下文和课表。
