import {
  ArrowUpRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useRef, useState } from "react";
import { encryptPassword } from "./lib/school-crypto.js";
import { normalizeSchedule } from "./lib/schedule-model.js";
import { convertScheduleToIcs } from "./lib/timetable-to-ics.js";
import SafariShortcut from "./components/SafariShortcut.jsx";
import SliderCaptcha from "./components/SliderCaptcha.jsx";
import WeekTimetable from "./components/WeekTimetable.jsx";

const steps = ["登录", "获取课表", "预览确认", "导出选项", "导出日历"];
const stepIndex = {
  login: 0,
  captcha: 0,
  fetch: 1,
  preview: 2,
  options: 3,
  complete: 4,
};
const initialFlow = () => ({
  context: null,
  cipher: null,
  salt: null,
  identity: null,
});
const expired = new Set([
  "CONTEXT_EXPIRED",
  "SCHOOL_SESSION_EXPIRED",
  "AUTH_SESSION_EXPIRED",
  "JWXT_SESSION_MISSING",
  "GMS_SESSION_MISSING",
]);
async function api(path, body, signal) {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    credentials: "omit",
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "请求未完成，请重试。");
    error.code = data.code;
    throw error;
  }
  return data;
}
function Arrow() {
  return <ArrowUpRightIcon aria-hidden="true" />;
}
export default function App() {
  const [phase, setPhase] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [semesters, setSemesters] = useState([]);
  const [semesterId, setSemesterId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [notice, setNotice] = useState("");
  const [addPrefix, setAddPrefix] = useState(false);
  const [exportLink, setExportLink] = useState(null);
  const flow = useRef(initialFlow());
  const epoch = useRef(0);
  const pending = useRef(null);
  function reset() {
    epoch.current++;
    pending.current?.abort();
    flow.current = initialFlow();
    setUsername("");
    setPassword("");
    setChallenge(null);
    setSemesters([]);
    setSemesterId("");
    setSnapshot(null);
    setIdentity(null);
    setNotice("");
    setAddPrefix(false);
    setExportLink(null);
    setBusy(false);
    setError("");
    setPhase("login");
  }
  function failure(e) {
    if (e.name === "AbortError") return;
    if (expired.has(e.code)) reset();
    setError(e.message);
  }
  async function loadSchedule(id, context = flow.current.context) {
    const operation = ++epoch.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setSnapshot(null);
    setSemesterId(id);
    try {
      const data = await api(
        "schedule",
        { context, semesterId: id },
        controller.signal,
      );
      if (operation !== epoch.current) return;
      const model = normalizeSchedule(data);
      flow.current.context = data.context;
      setSnapshot(model);
      setPhase("preview");
    } catch (e) {
      if (operation === epoch.current) failure(e);
    } finally {
      if (operation === epoch.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  }
  async function loadSemesters() {
    const operation = epoch.current;
    setBusy(true);
    setPhase("fetch");
    setError("");
    try {
      const data = await api("semesters", { context: flow.current.context });
      if (operation !== epoch.current) return;
      flow.current.context = data.context;
      setSemesters(data.semesters);
      setNotice(data.notice || "");
      const selected =
        data.semesters.find((s) => s.current) ?? data.semesters[0];
      if (!selected) throw new Error("学校未提供可用学期。");
      await loadSchedule(selected.id, data.context);
    } catch (e) {
      if (operation === epoch.current) {
        failure(e);
        setBusy(false);
      }
    }
  }
  async function submitEncrypted() {
    const operation = epoch.current;
    const data = await api("auth/login", {
      context: flow.current.context,
      encryptedPassword: flow.current.cipher,
    });
    if (operation !== epoch.current) return;
    flow.current = {
      context: data.context,
      cipher: null,
      salt: null,
      identity: data.identity,
    };
    setIdentity(data.identity);
    setChallenge(null);
    await loadSemesters();
  }
  async function login(e) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    const operation = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const data = await api("auth/prepare", { username: username.trim() });
      if (operation !== epoch.current) return;
      const cipher = encryptPassword(password, data.encryptionSalt);
      setPassword("");
      flow.current = {
        context: data.context,
        cipher,
        salt: null,
        identity: null,
      };
      if (data.captchaRequired) {
        setChallenge(data.challenge);
        setPhase("captcha");
        setBusy(false);
      } else await submitEncrypted();
    } catch (e2) {
      if (operation === epoch.current) {
        flow.current = initialFlow();
        setPassword("");
        failure(e2);
        setBusy(false);
      }
    }
  }
  async function refreshChallenge() {
    const operation = epoch.current;
    setBusy(true);
    try {
      const data = await api("auth/captcha/refresh", {
        context: flow.current.context,
      });
      if (operation !== epoch.current) return;
      flow.current.context = data.context;
      setChallenge(data.challenge);
    } catch (e) {
      if (operation === epoch.current) failure(e);
    } finally {
      if (operation === epoch.current) setBusy(false);
    }
  }
  async function verify(payload) {
    const operation = epoch.current;
    setBusy(true);
    setError("");
    try {
      const data = await api("auth/captcha/verify", {
        context: flow.current.context,
        payload,
      });
      if (operation !== epoch.current) return;
      flow.current.context = data.context;
      if (!data.verified) {
        setError("拼图未通过，请重新拖动。");
        await refreshChallenge();
        return;
      }
      await submitEncrypted();
    } catch (e) {
      if (operation === epoch.current) {
        failure(e);
        setBusy(false);
      }
    }
  }
  async function exportCalendar(mode = "import") {
    if (busy || !snapshot) return;
    const operation = epoch.current;
    setBusy(true);
    setError("");
    try {
      const { ics } = convertScheduleToIcs(snapshot, {
        addUniversityPrefix: addPrefix,
        calendarName: `应大通 · ${snapshot.semester.name}`,
      });
      const file = await api("exports", { context: flow.current.context, ics });
      if (operation !== epoch.current) return;
      const url = new URL(file.url, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        !/^\/api\/exports\/[\w-]+\.ics$/.test(url.pathname)
      )
        throw new Error("服务器返回的日历地址无效。");
      // Clear every school/credential/schedule reference before handing the file to iOS.
      epoch.current++;
      flow.current = initialFlow();
      setPassword("");
      setUsername("");
      setChallenge(null);
      setSnapshot(null);
      setSemesters([]);
      setIdentity(null);
      setSemesterId("");
      setNotice("");
      setExportLink({ url: url.href, expiresAt: file.expiresAt, mode });
      setPhase("complete");
      setBusy(false);
      if (mode === "download") {
        url.searchParams.set("download", "1");
      }
      window.location.assign(url.href);
    } catch (e) {
      if (operation === epoch.current) {
        failure(e);
        setBusy(false);
      }
    }
  }
  const count = snapshot?.occurrences.length ?? 0;
  const canExport = count > 0 && !snapshot?.exportErrors.length;
  const step = stepIndex[phase];
  const example = snapshot?.occurrences.find((e) => e.location)?.location;
  const exampleLocation = example
    ? addPrefix && !example.startsWith("应急管理大学 ")
      ? `应急管理大学 ${example}`
      : example
    : "学校未提供地点";
  const wide = phase === "preview";
  return (
    <div className="min-h-screen bg-[#faf9f6] font-sans text-foreground">
      <header
        className={`mx-auto px-5 pt-8 pb-6 sm:px-8 ${wide ? "max-w-5xl" : "max-w-md"}`}
      >
        <h1 className="text-xl font-semibold tracking-tight">课表导出工具</h1>
      </header>
      <main
        className={`mx-auto pb-10 sm:px-8 ${wide ? "max-w-5xl px-2" : "max-w-md px-5"}`}
      >
        <div>
          <section className="min-w-0" aria-label="课表导出流程">
            {phase === "login" && <SafariShortcut />}
            <div className={`mb-5 ${wide ? "max-w-md" : ""}`}>
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-medium">{steps[step]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {String(step + 1).padStart(2, "0")}{" "}
                  <span className="mx-1 text-border">/</span> 05
                </span>
              </div>
              <ol aria-label="导出步骤" className="grid grid-cols-5 gap-1.5">
                {steps.map((label, i) => (
                  <li
                    key={label}
                    aria-current={step === i ? "step" : undefined}
                    title={label}
                    className={`h-1 rounded-full ${step >= i ? "bg-primary" : "bg-foreground/10"}`}
                  >
                    <span className="sr-only">
                      {i + 1}. {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {phase === "login" && (
              <Card className="gap-6 py-6 [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-sans text-xl font-semibold">
                    登录学校账号
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    使用学校统一认证的学号和密码。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={login} className="space-y-5">
                    <div className="space-y-2.5">
                      <Label className="text-sm" htmlFor="username">
                        学号 / 学校用户名
                      </Label>
                      <Input
                        className="h-11 bg-background px-3 text-base md:text-sm"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        required
                        placeholder="输入学校账号"
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2.5">
                      <Label className="text-sm" htmlFor="password">
                        密码
                      </Label>
                      <Input
                        className="h-11 bg-background px-3 text-base md:text-sm"
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                        required
                        placeholder="输入学校密码"
                        disabled={busy}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="mt-2 h-11 w-full text-sm"
                      disabled={busy || !username.trim() || !password}
                    >
                      {busy ? (
                        <>
                          <Spinner />
                          正在连接学校
                        </>
                      ) : (
                        <>
                          登录并获取课表 <Arrow />
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
            {phase === "captcha" && (
              <Card className="gap-6 py-6 [--card-spacing:--spacing(5)]">
                <CardHeader>
                  <CardTitle className="font-sans text-xl font-semibold">
                    学校安全验证
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    拖动滑块，完成下方拼图。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {challenge && (
                    <SliderCaptcha
                      key={challenge.smallImage}
                      challenge={challenge}
                      disabled={busy}
                      onComplete={verify}
                      onRefresh={refreshChallenge}
                    />
                  )}
                  {busy && (
                    <p
                      role="status"
                      className="flex justify-center gap-2 text-sm"
                    >
                      <Spinner />
                      正在验证并读取学校数据
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    variant="ghost"
                    className="h-10 w-full text-sm"
                    disabled={busy}
                    onClick={reset}
                  >
                    返回登录
                  </Button>
                </CardFooter>
              </Card>
            )}
            {phase === "fetch" && (
              <Card className="gap-6 py-6 [--card-spacing:--spacing(5)]">
                <CardHeader>
                  <CardTitle className="font-sans text-xl font-semibold">
                    获取课表
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    role="status"
                    className="flex items-center gap-3 py-6 text-sm text-muted-foreground"
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        正在读取学校的学期和课表
                      </>
                    ) : (
                      "学校请求未完成，请重试。"
                    )}
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  {!busy && (
                    <Button
                      className="h-11 w-full text-sm"
                      onClick={() =>
                        semesters.length
                          ? loadSchedule(semesterId)
                          : loadSemesters()
                      }
                    >
                      重试获取课表
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-10 w-full text-sm"
                    onClick={reset}
                  >
                    结束本次操作
                  </Button>
                </CardFooter>
              </Card>
            )}
            {phase === "preview" && (
              <>
                <div className="mb-6 flex flex-wrap items-end justify-between gap-5 px-2 sm:px-0">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      核对你的课表
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {identity?.name || identity?.studentNumber} ·{" "}
                      {identity?.studentKind === "graduate"
                        ? "研究生"
                        : "本科生"}{" "}
                      · {count} 次日程
                    </p>
                  </div>
                  <div className="w-full space-y-2 sm:w-64">
                    <Label
                      htmlFor="semester"
                      className="text-xs text-muted-foreground"
                    >
                      选择学期
                    </Label>
                    <NativeSelect
                      id="semester"
                      className="w-full bg-card [&_select]:h-10 [&_select]:px-3 [&_select]:text-sm"
                      value={semesterId}
                      disabled={busy}
                      onChange={(e) => loadSchedule(e.target.value)}
                    >
                      {semesters.map((s) => (
                        <NativeSelectOption key={s.id} value={s.id}>
                          {s.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <div className="space-y-4 rounded-lg bg-card p-2 ring-1 ring-foreground/10 sm:p-4">
                  {notice && (
                    <Alert>
                      <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                  )}
                  {busy ? (
                    <p
                      role="status"
                      className="flex items-center justify-center gap-2 py-24 text-sm"
                    >
                      <Spinner />
                      正在读取所选学期
                    </p>
                  ) : (
                    snapshot && (
                      <WeekTimetable
                        key={snapshot.semester.id}
                        snapshot={snapshot}
                      />
                    )
                  )}
                  {!!snapshot?.exportErrors.length && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {snapshot.exportErrors.join("；")}。请核对日期后再导出。
                      </AlertDescription>
                    </Alert>
                  )}
                  {!busy && snapshot && count === 0 && (
                    <Alert>
                      <AlertDescription>
                        本学期没有可导出的已排课日程。
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
                  <Button
                    variant="ghost"
                    className="h-11 w-full text-sm sm:w-auto"
                    onClick={reset}
                  >
                    结束本次操作
                  </Button>
                  <Button
                    className="h-11 w-full text-sm sm:w-auto sm:px-7"
                    disabled={busy || !canExport}
                    onClick={() => {
                      setError("");
                      setPhase("options");
                    }}
                  >
                    课表无误，继续导出 <Arrow />
                  </Button>
                </div>
              </>
            )}
            {phase === "options" && snapshot && (
              <Card className="gap-6 py-6 [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-sans text-xl font-semibold">
                    最后，设置导出方式
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    {snapshot.semester.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        整个学期 · 已排课日程
                      </p>
                      <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                        {count}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          次
                        </span>
                      </p>
                    </div>
                    <p className="pb-1 text-xs text-muted-foreground">
                      北京时间 · UTC+8
                    </p>
                  </div>
                  {!!snapshot.unscheduled.length && (
                    <Alert>
                      <AlertDescription>
                        {snapshot.unscheduled.length}{" "}
                        条未排课记录没有时间，不生成日历日程。
                      </AlertDescription>
                    </Alert>
                  )}
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Label
                          htmlFor="add-prefix"
                          className="text-sm leading-6"
                        >
                          适配 Apple 地图
                        </Label>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          在地点前添加“应急管理大学 ”前缀。
                        </p>
                      </div>
                      <Switch
                        className="mt-1"
                        id="add-prefix"
                        checked={addPrefix}
                        onCheckedChange={setAddPrefix}
                        disabled={busy}
                      />
                    </div>
                    <div className="border-l-2 border-primary/30 pl-3">
                      <p className="text-[11px] text-muted-foreground">
                        导出后的地点
                      </p>
                      <p className="mt-1 break-words text-sm leading-6">
                        {exampleLocation}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <p className="text-xs leading-6 text-muted-foreground">
                    打开系统页面后，选择或新建“课表”日历，再确认添加全部。导出完成后，本站不会自动更新你的日历。
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    className="h-11 w-full text-sm"
                    disabled={busy}
                    onClick={() => exportCalendar("import")}
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        正在生成日历文件
                      </>
                    ) : (
                      <>
                        导出到日历 <Arrow />
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full text-sm"
                    disabled={busy}
                    onClick={() => exportCalendar("download")}
                  >
                    <DownloadSimpleIcon /> 下载 .ics 文件
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10 w-full text-sm"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setPhase("preview");
                    }}
                  >
                    返回课表预览
                  </Button>
                </CardFooter>
              </Card>
            )}
            {phase === "complete" && (
              <Card className="gap-6 py-6 [--card-spacing:--spacing(5)]">
                <CardHeader>
                  <div className="mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <CheckIcon className="size-6" />
                  </div>
                  <CardTitle className="font-sans text-xl font-semibold">
                    日历文件已生成
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-7">
                    {exportLink?.mode === "download"
                      ? "保存 .ics 文件后，可以在日历应用中导入。"
                      : "在系统页面选择或新建日历，再确认添加全部。"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">
                    本次流程数据已清空，文件最多临时保留 10
                    分钟。下一次导出需要重新登录。
                  </p>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    本站无法判断系统日历是否已经完成添加。
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  {exportLink && (
                    <Button
                      className="h-11 w-full text-sm"
                      render={<a href={exportLink.url} type="text/calendar" />}
                      nativeButton={false}
                    >
                      再次打开本次日历文件 <Arrow />
                    </Button>
                  )}
                  {exportLink && (
                    <Button
                      variant="outline"
                      className="h-11 w-full text-sm"
                      render={
                        <a
                          href={`${exportLink.url}?download=1`}
                          download="课表.ics"
                        />
                      }
                      nativeButton={false}
                    >
                      <DownloadSimpleIcon /> 下载 .ics 文件
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-10 w-full text-sm"
                    onClick={reset}
                  >
                    开始下一次导出
                  </Button>
                </CardFooter>
              </Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
