import { useMemo, useRef, useState } from "react";
import {
  CopyIcon,
  DownloadSimpleIcon,
  PlusIcon,
  ArrowUpRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import plainScriptUrl from "../generated/safari-default.js?url";
import mapsScriptUrl from "../generated/safari-apple-maps.js?url";
import bundledSource from "../generated/safari-shortcut.txt?raw";
import shortcutAlerts from "../shortcut/alerts.json";
import { createShortcutSource } from "../shortcut/source.js";

const installers = import.meta.glob("../shortcut/install/*.shortcut", {
  eager: true,
  query: "?url",
  import: "default",
});

const shortcutVersion = "v13";
const portalUrl = "https://my1.ncist.edu.cn/";

export default function SafariShortcut() {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState(false);
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState(false);
  const [alertId, setAlertId] = useState("none");
  const alert =
    shortcutAlerts.find((entry) => entry.id === alertId) ?? shortcutAlerts[0];
  const installerUrl = (maps) =>
    installers[
      `../shortcut/install/safari-${maps ? "apple-maps" : "default"}-${alert.id}.shortcut`
    ];
  const installerName = (maps) =>
    `应大通课表导出${maps ? "（地图适配）" : ""}${alert.id === "none" ? "" : `（${alert.label}）`}.shortcut`;
  const code = useMemo(
    () => createShortcutSource(bundledSource, { addUniversityPrefix: prefix }),
    [prefix],
  );
  const area = useRef(null);
  async function copy() {
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(code);
      else {
        area.current.focus();
        area.current.select();
        if (!document.execCommand("copy")) throw new Error("copy");
      }
      setMessage(
        "脚本已复制，请粘贴到快捷指令的“在网页上运行 JavaScript”动作。",
      );
    } catch {
      setMessage(
        "浏览器未允许自动复制。请长按下方脚本，全选并复制，或下载脚本文件。",
      );
    }
  }
  return (
    <>
      <div className="shortcut-guide">
        <ol className="shortcut-steps" aria-label="课表导出使用步骤">
          <li>
            <h2>
              <span>第一步</span>用 Safari 打开并下载
            </h2>
            <p>
              请用 Safari
              浏览器打开此页面，点击下方“添加快捷指令”，并在弹出的提示中确认下载。
            </p>
            <div className="shortcut-alert-options">
              <Label htmlFor="shortcut-alert">第二个提醒（可选）</Label>
              <p>
                默认不额外设置提醒；首个“出发时间”由系统处理。10分钟前使用系统“自定提醒”。
              </p>
              <NativeSelect
                id="shortcut-alert"
                value={alertId}
                onChange={(event) => setAlertId(event.target.value)}
              >
                {shortcutAlerts.map((entry) => (
                  <NativeSelectOption key={entry.id} value={entry.id}>
                    {entry.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              className="shortcut-step-action h-11 w-full text-sm"
              render={
                <a href={installerUrl(false)} download={installerName(false)} />
              }
              nativeButton={false}
            >
              <PlusIcon /> 添加快捷指令
            </Button>
          </li>
          <li>
            <h2>
              <span>第二步</span>添加快捷指令，开启脚本权限
            </h2>
            <p>
              在 Safari
              的下载界面点开刚下载的文件，将它添加到“快捷指令”。向下滑动，找到“在网页上运行
              JavaScript”操作。
            </p>
            <p>
              如果看到“此脚本无法运行，因为脚本操作已停用”，点击下方“打开设置”，开启“允许运行脚本”选项，然后回到
              Safari 浏览器。
            </p>
          </li>
          <li>
            <h2>
              <span>第三步</span>登录门户，打开学期课表
            </h2>
            <p>
              点击下方“登录信息门户”，打开“教务管理系统”，点击“我的课表”，选择“学期课表”。
            </p>
            <p className="shortcut-query-note">
              <strong>
                点一下上方的“查询条件”。无论当前显示的课表是不是你的，都要点击；如果不是你的课表，请切换成自己的课表。
              </strong>
            </p>
            <Button
              variant="outline"
              className="shortcut-step-action h-11 w-full text-sm"
              render={
                <a href={portalUrl} target="_blank" rel="noreferrer noopener" />
              }
              nativeButton={false}
            >
              登录信息门户 <ArrowUpRightIcon />
            </Button>
            <p className="shortcut-graduate-note">
              研究生入口：信息门户 → 研究生管理系统 → 个人课表。
            </p>
          </li>
          <li>
            <h2>
              <span>第四步</span>从 Safari 共享菜单运行
            </h2>
            <p>
              点开 Safari
              菜单，选择“共享”，点击“查看更多”，向下滑动找到并点击“应大通课表导出”。
            </p>
            <p>
              随后按提示选择“允许”或“始终允许”，即可将课表添加到 iPhone
              系统日历。
            </p>
          </li>
        </ol>
        <Button
          variant="ghost"
          className="shortcut-more-options h-10 w-full text-sm"
          onClick={() => setOpen(true)}
        >
          地图适配版 / 更多选项
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          setMessage("");
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg">
              地图适配与更多选项
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {shortcutVersion}{" "}
              使用系统日历动作批量添加课程，自动新建独立课表日历；添加前检测同名课表日历。已安装旧版请重新添加并替换；完成后打开日历
              App，不进入课程详情。
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertDescription>
              必须在学校课表页面的分享菜单运行，不能在本站、学校门户或认证登录页运行。脚本不读取
              document.cookie；Safari 自动携带同源 Cookie，包括 HttpOnly
              Cookie。
            </AlertDescription>
          </Alert>
          <p className="text-sm leading-6">
            首次使用请按照页面上的四步引导操作。下方可选择地图适配版，或查看完整脚本。
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            橙色日历：在日历 App 的日历列表，点课表日历右侧 ⓘ，将颜色选为橙色。
            系统“新建日历”动作未提供颜色参数，快捷指令无法自动指定。
          </p>
          <Alert>
            <AlertDescription>
              添加前会检测是否已存在同名课表日历（应大通课表 ·
              学期名称）；检测到会停止，不重复创建。个人日程、节假日和其他日历不受影响。旧版按备注标记检测，请重新添加并替换旧快捷指令。
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3 text-xs text-primary">
            <a href={portalUrl} target="_blank" rel="noreferrer noopener">
              登录信息门户
            </a>
            <a
              href="https://support.apple.com/guide/shortcuts/apd218e2187d/ios"
              target="_blank"
              rel="noreferrer"
            >
              苹果官方说明
            </a>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="shortcut-alert-dialog">第二个提醒</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                当前离线文件会写入“{alert.label}
                ”；更换提醒后，请重新下载并添加对应安装文件。
              </p>
            </div>
            <NativeSelect
              id="shortcut-alert-dialog"
              value={alertId}
              onChange={(event) => setAlertId(event.target.value)}
              className="w-36 shrink-0"
            >
              {shortcutAlerts.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="shortcut-prefix">适配 Apple 地图</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                选择后添加对应版本；地图适配版会添加“应急管理大学 ”地点前缀。
              </p>
            </div>
            <Switch
              id="shortcut-prefix"
              checked={prefix}
              onCheckedChange={(value) => {
                setPrefix(value);
                setMessage("");
              }}
            />
          </div>
          <Button
            className="h-10 w-full text-sm"
            render={
              <a href={installerUrl(prefix)} download={installerName(prefix)} />
            }
            nativeButton={false}
          >
            <PlusIcon /> {prefix ? "添加地图适配版快捷指令" : "添加快捷指令"}
          </Button>
          <p className="text-xs leading-6 text-muted-foreground">
            安装文件由 RoutineHub HubSign
            签名，已回读核对全部动作和脚本。签名服务只收到程序代码；运行时不连接该服务。系统安装确认和首次授权仍由你完成。
          </p>
          <Button
            variant="ghost"
            className="h-9 text-xs"
            aria-expanded={inspect}
            onClick={() => setInspect(!inspect)}
          >
            {inspect ? "收起脚本" : "查看脚本（可选）"}
          </Button>
          {inspect && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="h-10 text-sm sm:flex-1"
                  onClick={copy}
                >
                  <CopyIcon />
                  复制完整脚本
                </Button>
                <Button
                  variant="outline"
                  className="h-10 text-sm"
                  render={
                    <a
                      href={prefix ? mapsScriptUrl : plainScriptUrl}
                      download="应大通-Safari课表导出.js"
                    />
                  }
                  nativeButton={false}
                >
                  <DownloadSimpleIcon />
                  下载脚本
                </Button>
              </div>
              {message && (
                <p role="status" className="text-xs leading-6">
                  {message}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="shortcut-code">
                  完整脚本（仅审阅或手动创建时使用）
                </Label>
                <Textarea
                  id="shortcut-code"
                  ref={area}
                  readOnly
                  value={code}
                  spellCheck={false}
                  className="h-36 resize-y font-mono text-[10px]"
                />
              </div>
            </>
          )}
          <p className="text-xs leading-6 text-muted-foreground">
            脚本只请求当前学校系统，不请求本站服务器，不提取密码或
            Cookie，也不加载第三方脚本。未排课记录不生成事件，缺少可靠日期时停止导出。iOS
            对网页脚本有执行时限，读取超时会返回错误。
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
