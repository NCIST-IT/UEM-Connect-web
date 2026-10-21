import { useState } from "react";
import { PlusIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import shortcutAlerts from "../shortcut/alerts.json";

const installers = import.meta.glob("../shortcut/install/*.shortcut", {
  eager: true,
  query: "?url",
  import: "default",
});

const portalUrl = "https://my1.ncist.edu.cn/";

export default function SafariShortcut() {
  const [navigationFix, setNavigationFix] = useState(true);
  const [alertId, setAlertId] = useState("none");
  const alert =
    shortcutAlerts.find((entry) => entry.id === alertId) ?? shortcutAlerts[0];
  // Installer variant IDs map to the navigation-repair download option.
  const variant = navigationFix ? "apple-maps" : "default";
  const installerUrl =
    installers[`../shortcut/install/safari-${variant}-${alert.id}.shortcut`];
  const installerName = `应大通课表导出${navigationFix ? "（导航修复）" : ""}${alert.id === "none" ? "" : `（${alert.label}）`}.shortcut`;

  return (
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
            <div className="shortcut-navigation-option">
              <div>
                <Label htmlFor="shortcut-navigation-fix">导航修复</Label>
                <p id="shortcut-navigation-description">
                  默认开启，在每个日程地址末尾加上一个空格和“应急管理大学”。关闭后保留原地址。
                </p>
              </div>
              <Switch
                id="shortcut-navigation-fix"
                checked={navigationFix}
                onCheckedChange={setNavigationFix}
                aria-describedby="shortcut-navigation-description"
              />
            </div>
          </div>
          <Button
            className="shortcut-step-action h-11 w-full text-sm"
            render={<a href={installerUrl} download={installerName} />}
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
            随后按提示选择“允许”或“始终允许”，即可将课表添加到 iPhone 系统日历。
          </p>
        </li>
      </ol>
    </div>
  );
}
