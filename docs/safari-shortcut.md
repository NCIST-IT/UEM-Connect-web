# Safari 快捷指令课表直添（v10 · 试验）

首页“添加快捷指令”提供已签名的标准版与地图适配版。v10 用系统日历动作新建独立日历并批量添加日程，跳过本地 ICS 导入。结果数量直接统计本次添加动作返回的日程。原账号登录、周课表预览和 .ics 导出流程保留。

## 操作

1. 从首页重新添加并替换旧版快捷指令。首次使用允许网页脚本，并按系统提示授权读取和添加日历。读取用于查询本直添版的学期标记、防止重复添加。
2. 用 Safari 登录信息门户 https://my1.ncist.edu.cn/ ，从门户进入本科“教务管理系统 → 我的课表”，或“研究生管理系统 → 个人课表”。在课表页面分享菜单运行“应大通课表导出”。
3. 读取课程后，对日历查询返回的候选日程逐条读取备注，匹配完整独立一行的本学期标记。只有匹配数量大于 0 时才停止，并提示核验数量。个人日程、节假日及其他学期不会阻止导入。若上次只添加一部分或要重新导入，用户可在日历 App 删除此前生成的整本课表日历，再运行。
4. 核对摘要并确认后，新建“应大通课表 · 学期名称”，逐条调用原生添加日程，关闭逐条编辑窗口。所有日程只写入本次新建的日历；新建动作未返回日历对象时停止。
5. 完成后直接统计“添加新日程”循环返回的日程对象，显示计划数量与本次添加数量，再打开本次返回的第一节课。添加动作失败时快捷指令停止，不显示整批完成结果；未返回日程对象时显示“未取得添加结果”。

批量操作不是事务。中断时已有日程保留，本直添版标记会阻止重复运行；用户删除整本课表日历后可重试。不自动删除、覆盖任何已有日历或日程。防重检查针对本直添版标记，不覆盖旧的 ICS 手动导入或订阅记录，也不承诺并发调用下的事务隔离。

## 数据流与隐私

Safari 已登录学校页面 → 同源 fetch 获取完整所选学期 → 共用模型和 ICS writer 的去重、日期及地点处理 → completion 返回 JSON 文本 → 原生“获取词典” → 确认 → 新建独立日历 → 循环添加 → 统计本次添加动作返回的结果。

不读取 document.cookie、账号密码，不把学校 Cookie、原始课表或日程数据发送本站或 HubSign。防重查询结果停留在原生快捷指令，不传回学校网页脚本。系统日历是否同步到 iCloud 等账户由用户的系统账户设置决定。

本科优先识别页面当前学期，支持在学校页面选历史学期；研究生只读取已核实的当前学期。地点前缀默认关闭；开启只修改 location，去重和时间不变。未排课记录在确认摘要中给出数量；无法确定日期时停止，不写入。

## 时间、去重及参数

convertScheduleToIcs 新增 calendarEvents 结果，直接复用既有 UID 去重及 UTC+8 日期计算。原来的 ICS 内容不变，原生输入与 ICS 具有相同日期、时间、地点和事件数量。时间传为带 Z 的 ISO 日期，原生 Date 动作解析后，通过带 ISO 8601（含时间）格式的 WFTextTokenString 传入添加日程的日期字段，避免把北京时间重复偏移。Calendar 对象仍使用 WFTextTokenAttachment 直接引用本次新建日历的输出。

学期标记为 [UEM-TERM:source:semesterId]，附在课程备注。脚本同时返回 groupMarkerPattern，以转义后的字面标记生成整行正则（兼容 LF/CRLF），原生 Get Details of Calendar Events 读取 Notes、Match Text 核验，未匹配的分支返回 Nothing。防重 Count 使用正式 Input 字段统计核验后的 Repeat Results，If 使用数量大于 0（条件 2、WFNumberValue=0），不直接对日历查询结果做 Has Any Value 判断。重复检查只针对该标记；仅限当前手机、当前学生的一次性学期导入场景，不新增账号管理。

添加结果 Count 的 Input 引用添加课程循环的 Repeat Results，该循环的最后一个动作为 Add New Event，返回新建的 EKEvent 对象。结果页“本次添加日程”来自这些返回对象，不取计划数量代替、不重新查询 Library。Open in Calendar 同样使用本次返回的第一条日程。网页 JSON 的 version=9 为既有协议版本；v10 安装包只修改原生结果统计和页面说明，嵌入网页脚本 SHA-256 与 v9 相同。

iOS 27 ToolKit v78 中确认存在：addnewcalendar(CalendarName)、addnewevent(WFCalendarDescriptor、ShowWhenRun 等)、filter.calendarevents、date、showincalendar。特别使用当前 WFCalendarDescriptor 而非旧的 WFCalendarItemCalendar；ShowWhenRun=false 关闭每节课的编辑窗口。日历查询显式选择 Library，避免继承上一步文本作为查询输入。重复项、日期和 Calendar 对象都通过显式变量引用。

独立脚本返回 JSON 字符串：成功包含 version、events、calendarName、groupMarker、groupMarkerPattern、count、unscheduledCount、summary；失败 events=[] 并包含 error。原生动作显式 Detect Dictionary，不依赖 JavaScript 结果自动判定类型。

## 打包与验证

```sh
pnpm shortcut:package
node scripts/sign-safari-shortcut.mjs
uv run --no-project --with lzfse python scripts/verify-safari-shortcut.py
pnpm test
pnpm lint
pnpm build
```

签名请求只有程序代码。安装文件内容回读与本地所有动作和脚本一致后才发布；manifest 固定文件和脚本 SHA-256，源码变动而未重新签名时构建停止。内容比较不替代 Apple 设备的签名信任验证。运行时不连接签名服务。

56 项本地测试通过：包括原生/ICS 数量和绝对时间一致、单双周及完整学期、午夜跨年、地图前缀、未排课提醒、JSON 传输、当前 iOS 27 参数名称、目标日历必须来自本次创建、确认先于写入、防重和本次添加结果的引用链。模拟原生动作执行的回归用例包括：无日程、个人/节假日/其他学期候选、真实完整标记、未取得日历时停止；新增“添加 286 条、搜索仅返回 16 条”仍报告本次添加 286，以及单次添加失败时停止的用例。它们不等于 iPhone 实际写入验收；需要用户运行确认权限、创建日历、批量保存与结果数量。

协议依据：[Apple 网页脚本动作](https://support.apple.com/guide/shortcuts/apd218e2187d/ios)、[iOS 27 ToolKit 参数快照](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/data/toolkit-v78-first-party-parameter-keys.json)、[Cherri 签名接口](https://github.com/electrikmilk/cherri/blob/main/signing.go)。

## 历史版本

## v2 修复记录

用户实机反馈“课表导出未完成”，正文却是系统默认“是否继续？”。旧版把错误变量用 WFTextTokenAttachment 直接传给显示文字字段；v2 改成 WFTextTokenString，并保留固定文字作为回退。与此同时将独立脚本输出改成日历或错误文本，原生 If 使用 Begins With BEGIN:VCALENDAR，删除词典取值动作。网络、HTTP、JSON、会话及来源错误标明对应读取步骤；不读取或回传 Cookie。38 项测试涵盖实际打包文本字段、UTF-16 附件范围、结果引用及脚本错误输出。用户需要重新安装并替换旧快捷指令；网页更新不会自动修改手机中已经保存的版本。当前截图不足以确定学校请求本身失败的原因，仍需新版在用户 iPhone 上显示的错误或实测结果。

## v3 导入参数修复

用户截图进一步确认 v2 的“开头是”条件在 iOS 27 导入后比较值为空。v3 不再使用字符串比较条件，而是明确增加原生“文本”动作，再以“匹配文本”读取 ^BEGIN:VCALENDAR\\r?\\n 的匹配结果；If 仅使用 Has Any Value（100），不包含 WFConditionalActionString 或 WFNumberValue。匹配动作使用已导出的原生参数 text 和 WFMatchTextPattern，文本输入为 WFTextTokenString。保存与错误提示都引用明确的文本动作输出。具体的 iOS 内部导入行为原因未做原生调试确认，这次通过移除该比较字段避开它。签名包全部动作回读比较一致；38 项测试包含 CRLF/LF 文件头、错误文本、空文本、参数引用及占位范围。需要用户重新添加并替换旧版，在 iPhone 确认导入后无缺参数提示。

## v4 页面学期识别

用户已在“学期课表”页面选择 2026–2027 第一学期，却得到“学校没有提供可确定的学期”。旧逻辑只认可接口 IsSelected 标记或单项列表，没有读取页面选择。v4 用可见学期选择控件、页面学期文字及同源可见 iframe，匹配学校 Sems 中的真实 Id；页面选择优先于学校当前默认标记。兼容学年度文字、空格、不同横线和数字学期名称。无页面线索时才回退唯一默认标记、列表内的 CurrentSemId 或唯一列表项；不按学期列表顺序猜测编号。冲突、无对应项、空列表分别报错，包含学期数量/字段名等诊断，不输出 Cookie、密码或整页内容。脚本不固定任何学期 Id；截图中的学期文字仅用于本地合成回归用例。45 项测试通过；手机读取和日历接收仍需用户实测。

## v5 文本与文件类型修复

用户截图已进入共享界面，但项目显示为“文本文稿”。原来的 Set Name 类型透传，不能把 WFStringContentItem 改为文件。v5 保留 v4 已成功获取课表的逻辑，在日历成功分支先显式 Base64 Encode/Decode 生成文件数据，Set Name 为课表.ics，再用原生 Get File of Type（is.workflow.actions.gettypeaction）请求 com.apple.ical.ics。末尾改为 Quick Look（previewdocument），不再直接 Share 文本。该系统预览是否提供日历导入/添加全部，需要用户在 iPhone 实测；不声称已经添加日程。预览本身的分享按钮可作为文件保存入口。

原生动作字段按导出的 ToolKit 元数据核对：base64encode 使用 WFEncodeMode / WFInput，gettypeaction 使用 WFFileType / WFInput，Set Name 类型透传，Quick Look 接收 public.data。回归测试检查完整文件转换引用链，防止再次将文本直接改名共享。学校凭据和课表仍不回传本站或签名服务。

## v7 日期字段修复

用户截图显示添加日程的时间仍为系统默认的“明天中午”，并提示开始日期无效。v6 把日期动作输出作为 WFTextTokenAttachment 直接传入日期文字字段；v7 改为 WFTextTokenString，并附 ISO 8601、包含时间的日期格式设置。开始和结束各自绑定对应 Date 动作。新建日历及 WFCalendarDescriptor 绑定保持不变，所有课程仍指向本次创建的独立日历。回归测试检查日期文字序列化、ISO 格式和对应输出 UUID；iPhone 实际导入和写入仍需实测。

## v8 数量统计修复与颜色限制

用户实机已确认 v7 创建日历并添加课程，但结果显示计划 268、已保存 0。计数动作使用了错误的 WFInput 字段；iOS 27 ToolKit 与 Cherri 声明中的正式字段为 Input。v8 改用 Input 显式引用写入后查询结果，回归检查纳入 count 的完整参数白名单，禁止旧字段。此反馈证明写入已发生，不证明整个学期 268 条已全部保存；v8 数量仍待实机核对。

当前 addnewcalendar 仅提供 CalendarName，没有颜色参数；不添加未经证实会生效的颜色键。主页使用说明提供手动设为橙色的路径：日历 App → 日历列表 → 课表日历右侧 ⓘ → 颜色 → 橙色。用户已导入的课表保留，不要求为更新统计重新导入。

## v9 防重误判修复

用户截图显示“此学期已有应大通课表”，但日历列表只有个人、工作、节假日等项目，没有生成的课表日历。截图不能确定系统内部为何返回或判定了非空值；旧版只依赖原生日历过滤和 Has Any Value，没有再次核验日程备注。v9 将原生过滤结果视为候选，取消取一条的限制，逐条读取 Notes 并匹配完整的本学期标记后再计数。写入后回读也采用相同核验，避免无关日程计入保存数量。真正存在本学期标记仍会阻止重复写入，提示包含实际核验数量。标准版与地图适配版均重新签名并回读比较全部 64 个动作和脚本；需要在手机重新添加并替换旧快捷指令，再确认实机结果。

## v10 添加结果统计修复

用户反馈计划 286、结果显示已保存 16，但实际日历课程对得上。旧版将添加后日历搜索返回的数量作为已保存总数，存在查询日期范围、结果可见性或索引延迟造成偏少的可能；未确定手机上的具体原因。v10 删除结果统计的第二次日历搜索及备注核验，直接 Count 本次 Add New Event 循环返回的日程对象，文案改为“本次添加日程”，并打开本次返回的第一节课。添加失败不会走到整批结果提示。读取学校课表的网页脚本保持相同 SHA-256。此前尚未发布的短超时实验已保存为 Git stash，未包含在本版本中。
