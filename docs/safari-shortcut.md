# Safari 快捷指令课表导出

“应大通课表导出”通过 Safari 读取已登录的学校课表页面，并使用系统日历动作创建独立课表日历、批量添加课程。网站提供签名安装文件与四步使用引导，入口为 `#shortcut`。

## 使用方法

1. 用 Safari 打开课表导出页，选择“第二个提醒”和“导航修复”，点击“添加快捷指令”并确认下载。
2. 在 Safari 下载界面打开文件并添加到快捷指令，向下找到“在网页上运行 JavaScript”。如果显示“此脚本无法运行，因为脚本操作已停用”，点击“打开设置”，开启“允许运行脚本”，再回到 Safari。
3. 登录信息门户 https://my1.ncist.edu.cn/ ，进入“教务管理系统 → 我的课表 → 学期课表”。**点击上方“查询条件”，无论当前是不是自己的课表都要点击；不是自己的课表则切换。**研究生入口为“研究生管理系统 → 个人课表”。
4. 在 Safari 菜单选择“共享 → 查看更多”，找到“应大通课表导出”，运行后按提示选择“允许”或“始终允许”，核对摘要并确认添加。

完成后显示计划课程数量和本次添加数量，并打开日历 App。课表日历的颜色可在“日历 App → 日历列表 → 课表日历右侧 ⓘ → 颜色”中设置。

## 下载选项

- **第二个提醒**：无、日程开启时、5/10/15/30 分钟前、1/2 小时前、1/2 天前、1 周前，共 11 种。首行“出发时间”由系统处理，可在快捷指令 App 中手动调整。“无”不额外写入提醒参数，系统继承的提醒由日历设置决定。
- **导航修复**：默认开启，在每个日程地址末尾追加 ` 应急管理大学`。空地址使用“应急管理大学”，已有相同后缀时不重复添加；关闭后使用原地址。

两种导航设置各有 11 个签名安装包，共 22 个。内部变体标识 `apple-maps` 对应导航修复，`default` 对应原地址，两者在手机中均显示为“应大通课表导出”。选项在下载的安装包中固定。

## 日历写入与重复检测

课表日历命名为“应大通课表 · 学期名称”。添加前先按日历名称查询候选日程，再逐条核验所在日历名称完全一致；发现同名课表日历时停止，避免重复添加。

确认后新建独立日历，所有课程只写入本次创建的日历。创建动作未返回日历对象时停止；添加动作失败时停止，不显示整批完成结果。成功数量来自“添加新日程”循环返回的日程对象，未返回结果时显示“未取得添加结果”。

批量写入不是事务，中断时已经添加的课程会留在日历中。删除该课表日历后可重新运行。重复检测不涵盖其他名称的手动导入或订阅记录，也无法发现没有任何日程的同名空日历。

## 数据流与隐私

```text
Safari 中已登录的学校课表页面
  → 同源请求读取所选学期
  → 课表归一化、日期计算与去重
  → completion 返回 JSON 文本
  → 原生快捷指令解析词典并显示确认摘要
  → 创建课表日历、添加课程、统计结果
```

脚本不读取账号密码或 `document.cookie`，不把学校 Cookie、原始课表或日程发送到本站或签名服务。重复检测结果停留在原生快捷指令中。日历是否同步到 iCloud 等账户由系统账户设置决定。

本科优先识别页面选择的学期，支持历史学期；研究生读取当前学期。未排课记录在确认摘要中列出数量；无法确定日期时停止，不写入日历。

## 实现要点

- `convertScheduleToIcs` 同时提供 ICS 与 `calendarEvents`，共用 UID 去重、UTC+8 日期计算、地点和事件数量。导航修复只调整地点，不影响课程身份和时间。
- 日期以带 `Z` 的 ISO 文本传入原生 Date 动作，再以包含时间的 ISO 8601 `WFTextTokenString` 传入日程日期字段。
- 日历对象通过 `WFTextTokenAttachment` 引用创建动作的输出，`WFCalendarDescriptor` 指向该对象；`ShowWhenRun=false` 关闭逐条编辑窗口。
- 重复检测显式查询 Library，读取候选日程的 Calendar 详情，再用 `calendarNamePattern` 核验完整日历名。备注中的 `[UEM-TERM:source:semesterId]` 用于识别学期。
- 结果 Count 的 `Input` 引用添加循环的 `Repeat Results`。完成后使用 Open App，`WFSelectedApp` 为 `{BundleIdentifier: com.apple.mobilecal, Name: Calendar}`。
- 预设提醒使用 `WFAlertTime`；“10分钟前”使用 Custom 与 `WFAlertCustomTime`，时间由每节课的开始时间减 10 分钟计算。
- 网页脚本返回 JSON 字符串，原生动作显式解析词典。成功结果包含事件、日历名称、数量与摘要；失败结果包含空事件列表和错误信息。

## 打包与验证

```sh
pnpm shortcut:package
node scripts/sign-safari-shortcut.mjs
uv run --no-project --with lzfse python scripts/verify-safari-shortcut.py
pnpm test
pnpm lint
pnpm build
```

签名请求只包含程序代码。发布前回读安装文件，与本地动作和脚本逐项比较；manifest 记录文件及脚本的 SHA-256。源码与签名包不一致时构建停止，修改源码后需要重新打包、签名和验证。运行快捷指令时不连接签名服务。

自动测试覆盖学校学期识别、原生与 ICS 时间一致性、单双周、跨年、地址后缀、未排课记录、JSON 传输、原生动作参数、目标日历引用、重复检测、提醒序列化和添加结果统计。设备权限、签名信任与系统日历交互需要在 iPhone 上验证。

## 参考资料

- [Apple 网页脚本动作](https://support.apple.com/guide/shortcuts/apd218e2187d/ios)
- [iOS 27 ToolKit 参数快照](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/data/toolkit-v78-first-party-parameter-keys.json)
- [Cherri 签名接口](https://github.com/electrikmilk/cherri/blob/main/signing.go)
