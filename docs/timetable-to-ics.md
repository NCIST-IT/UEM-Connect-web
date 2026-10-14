# 浏览器课表转 .ics

转换模块：`src/lib/timetable-to-ics.js`。输入为本科 JWXT `getTeacherTimeTable` 接口的原始对象或 JSON 字符串；不适用于 GMS 研究生课表。

这是浏览器端 JavaScript，转换过程没有网络请求、Node.js 导入、服务器文件读写或第三方依赖。网页只需要静态文件服务；React 和其他浏览器代码均可直接导入。

```js
import { convertTimetableToIcs, downloadIcs } from './lib/timetable-to-ics.js'

// file 来自 <input type="file"> 的 files[0]，也可以直接传入原始响应对象。
const { ics, eventCount } = convertTimetableToIcs(await file.text(), {
  calendarName: '2026–2027 第一学期课表',
})
console.log(`生成 ${eventCount} 个上课事件`)
// 在用户点击下载按钮时调用：
downloadIcs(ics, '我的课表.ics')
```

## 字段规则

- `StartDay` 是第一周周一，格式为 `YYYY-MM-DD`。缺失或不是周一时会报错；可以通过 `semesterStartDate` 显式提供或覆盖第一周周一。
- `WeekStart`、`WeekEnd` 都包含端点；每次周次增加 `WeekInterval + 1`。`0` 为每周，`1` 为从起始周算起的隔周，因此支持单周和双周。
- `OnMonday` 至 `OnSunday` 分别生成事件，一条记录可以有多个星期。
- `TimeSlotStart`、`TimeSlotEnd` 是从零点开始的五分钟时间槽，直接乘以五分钟。结束槽已经是下课时刻，不再加五分钟，也不从节次表重新猜时间。
- 本科教务数据使用中国标准时间（固定 UTC+08:00），输出为 `DTSTART;TZID=Asia/Shanghai:…` / `DTEND;TZID=Asia/Shanghai:…`，并附带固定 `+0800` 的 `VTIMEZONE`。例如学校 08:00 写为 `20260907T080000`，不标为 GMT；计算不受浏览器本地时区影响。日历 App 的系统界面仍由设备控制。
- `LUName` 为标题，校区、楼宇、教室为地点，地点前统一加上 `应急管理大学 `（包含一个空格），便于 iPhone 识别学校地址；课程代码、教学班、教师、授课方式、行政班、周次和排课说明保存在描述中。地点显示前缀不改变事件 UID。
- 每一次上课输出一个独立 `VEVENT`，不使用 `RRULE`，不猜测节假日或调课；导出内容以原始接口排课为准。
- 不使用 `CurrentWeekIndex` 计算学期起点。`ClassTimePatterns` 是作息元数据，课程本身的起止槽决定事件时间。

## 标准与错误处理

按 [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) 输出 UTF-8、CRLF、75 字节折行（不截断多字节字符）、TEXT 转义、`VERSION`、`PRODID`、`UID`、UTC `DTSTAMP`、固定 UTC+8 的 `VTIMEZONE` 和非包含式 `DTEND`。UID 仍以绝对时刻为身份，从旧的 UTC 表示改成北京时间表示不会更换 UID。

UID 完整编码事件的稳定身份，不使用随机值或有损哈希。相同输入的 UID 不随导出时间或记录顺序变化；完全相同的重复事件合并。需要区分多个账号的课表时，传入稳定的 `calendarId`（例如本地账号标识）；UID 是编码，不是加密。

返回 `{ ics, eventCount, recordCount, duplicateEventCount }`。空 `Data` 返回有效的空日历；缺少排课日期、周次、星期或有效起止时间则抛出标明记录索引的错误，不静默遗漏。`maxEvents` 默认 10000，可显式设置；`timestamp` 可传入有效 `Date` 以固定 `DTSTAMP`。

## 本地试用

运行 `pnpm dev --host 127.0.0.1`，在浏览器打开 `/timetable-converter.html`，选择原始 JSON，再点击下载。

开发服务器仅提供静态网页和开发资源，转换和下载在浏览器中执行。`pnpm build` 也会输出这个独立页面，可作为静态文件发布。个人课表样本位于被本地 Git 排除的 `.local/timetable/`，不打包进生产文件。
