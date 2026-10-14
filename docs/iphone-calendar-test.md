# iPhone 固定课表测试

运行地址：`http://192.168.1.3:5177/`。在同一 Wi-Fi 下用 iPhone Safari 打开，点“一次性添加课表”打开 `.ics` 文件。

主按钮指向普通 HTTP `/import.ics`，不再使用 `webcal`。文件按固定 UTC+8 写入 `TZID=Asia/Shanghai` 和 `VTIMEZONE`，例如学校 08:00 输出为本地时间 08:00，而不是 UTC 的 00:00Z。文件正文没有 GMT 标记，课程名称本身的括号保留。

用户已在 iOS 27 确认系统页面可手动新建日历后，将日程添加到新日历，因此继续采用当前添加日程方式。页面提示先新建“课表”日历，再选择“添加全部”和新日历。页面不提供下载链接，响应不设置 `Content-Disposition`，让系统依据 `text/calendar` 处理。全部事件地点统一以 `应急管理大学 ` 开头，包含一个空格；实际地图导航识别效果需在 iPhone 中验证。

一次性导入后的日程保存在选定日历中，不依赖测试服务继续运行。之前测试过的订阅需要在 iPhone 中自行取消，以免与新导入的日程重复。

## 文件与运行

- 固定使用 `.local/timetable/2026-10-08/my-timetable-semester-84.ics`，含 268 个事件。
- `.ics` 是先前在浏览器中转换的结果；本次服务只提供静态文件，不在服务器转换课表。
- 页面源文件：`iphone-test.html`、`src/iphone-test.js`、`src/iphone-test.css`。
- `pnpm iphone:prepare` 构建专用静态目录 `.local/iphone-test/` 并复制课表；`pnpm iphone:serve` 监听 `0.0.0.0:5177`。
- 个人课表和这个专用构建目录都在本地 Git 排除规则中。
- 本次使用临时 user systemd 单元 `uem-connect-calendar-test.service` 启动，不依赖聊天终端，也没有安装持久服务。

服务仅提供首页、打包资源和 `/import.ics`（`/calendar.ics` 保留为同文件的兼容地址）。日历响应为 `text/calendar;charset=utf-8`，支持 GET 和 HEAD，按原始文件字节返回，不设置下载处置头。

## 临时防火墙

2026-10-08 已用 `pkexec` 添加并核验：

```text
inet nixos-fw / input-allow
iifname wlan0 ip saddr 192.168.1.0/24 tcp dport 5177 counter accept
comment temporary-uem-calendar-test
当前 handle: 27
```

这次仅添加当前运行中的规则，NixOS 配置未修改；规则会在防火墙重载或系统重启后消失。电脑自身访问局域网地址不能证明 iPhone 到电脑的实际 Wi-Fi 路由，仍需实机访问。

停止测试：

```sh
systemctl --user stop uem-connect-calendar-test.service
pkexec nft -a list chain inet nixos-fw input-allow
# 重新确认 temporary-uem-calendar-test 的 handle；本次记录为 27。
pkexec nft delete rule inet nixos-fw input-allow handle 27
```
