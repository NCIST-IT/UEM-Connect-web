import { useMemo, useRef, useState } from "react";
import {
  CopyIcon,
  CompassIcon,
  DownloadSimpleIcon,
  PlusIcon,
  ArrowUpRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import plainInstallerUrl from "../shortcut/install/safari-default.shortcut?url";
import mapsInstallerUrl from "../shortcut/install/safari-apple-maps.shortcut?url";
import plainScriptUrl from "../generated/safari-default.js?url";
import mapsScriptUrl from "../generated/safari-apple-maps.js?url";
import bundledSource from "../generated/safari-shortcut.txt?raw";
import { createShortcutSource } from "../shortcut/source.js";

const shortcutVersion = "v11";
const portalUrl = "https://my1.ncist.edu.cn/";

export default function SafariShortcut() {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState(false);
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState(false);
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
      <Card className="mb-6 gap-4 [--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-sans text-base">
            <CompassIcon className="size-5 text-primary" />
            Safari 快捷指令导出{" "}
            <Badge variant="secondary">{shortcutVersion} · 试验</Badge>
          </CardTitle>
          <CardDescription className="mt-1 text-sm leading-6">
            使用 Safari
            已登录的学校会话，确认后新建独立日历并添加全部课程。账号、密码和
            Cookie 不经过本站。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs leading-6 text-muted-foreground">
            {shortcutVersion}{" "}
            完成后直接打开日历 App，不再弹出某一节课程。已安装旧版的用户，请重新添加并选择替换。
          </p>
          <Button
            className="h-10 w-full text-sm"
            render={
              <a href={plainInstallerUrl} download="应大通课表导出.shortcut" />
            }
            nativeButton={false}
          >
            <PlusIcon /> 添加快捷指令
          </Button>
          <Button
            variant="ghost"
            className="h-9 w-full text-sm"
            onClick={() => setOpen(true)}
          >
            使用说明 / 地图适配版
          </Button>
          <div className="border-t pt-3">
            <Button
              variant="outline"
              className="h-10 w-full text-sm"
              render={
                <a href={portalUrl} target="_blank" rel="noreferrer noopener" />
              }
              nativeButton={false}
            >
              登录信息门户 <ArrowUpRightIcon />
            </Button>
          </div>
          <div className="space-y-1 text-xs leading-6 text-muted-foreground">
            <p>本科：信息门户 → 教务管理系统 → 我的课表</p>
            <p>研究生：信息门户 → 研究生管理系统 → 个人课表</p>
            <p>打开课表后，再从 Safari 分享菜单运行快捷指令。</p>
          </div>
        </CardContent>
      </Card>
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
              Safari 快捷指令导出
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {shortcutVersion}{" "}
              使用系统日历动作批量添加课程，自动新建独立课表日历。已安装旧版请重新添加并替换；完成后打开日历
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
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-6">
            <li>
              点击“添加快捷指令”，在 iPhone 系统页面确认添加。如果 Safari
              先下载文件，点开下载的 .shortcut 文件导入。
            </li>
            <li>
              如果系统要求，在“快捷指令”的高级设置中开启“允许运行脚本”。首次访问学校网站时，按系统提示确认授权。
            </li>
            <li>
              先在 Safari
              登录信息门户，再从门户进入对应系统：本科选择“教务管理系统”→“我的课表”；研究生选择“研究生管理系统”→“个人课表”。
              确认课表页面域名为 <code>jw.cidp.edu.cn</code>（本科）或{" "}
              <code>gms.ncist.edu.cn</code>
              （研究生）后，点击分享按钮，选择“应大通课表导出”。不要在信息门户页面直接运行。
            </li>
            <li>
              首次运行按系统提示允许读取和添加日历；读取用于防重复，结果数量来自本次添加动作返回的日程。核对摘要并确认后，自动新建独立日历并批量添加课程，完成后直接打开日历 App。
            </li>
          </ol>
          <p className="text-xs leading-6 text-muted-foreground">
            橙色日历：在日历 App 的日历列表，点课表日历右侧 ⓘ，将颜色选为橙色。
            系统“新建日历”动作未提供颜色参数，快捷指令无法自动指定。
          </p>
          <Alert>
            <AlertDescription>
              仅当日程备注中确实存在本直添版的完整同学期标记时才会停止，并显示匹配数量。个人日程和节假日不会触发防重。若中途停止或要重新添加，请先在日历
              App 删除之前生成的整本课表日历，再运行。
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
              <a
                href={prefix ? mapsInstallerUrl : plainInstallerUrl}
                download={
                  prefix
                    ? "应大通课表导出（地图适配）.shortcut"
                    : "应大通课表导出.shortcut"
                }
              />
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
