import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CompassIcon,
  DownloadSimpleIcon,
  GithubLogoIcon,
  MoonIcon,
  SunIcon,
  NavigationArrowIcon,
  CalendarBlankIcon,
  BellIcon,
  ShieldCheckIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
  CheckIcon,
  CodeIcon,
  SparkleIcon,
  HeartIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Directory from "@/components/Directory";
import PhonePreview from "@/components/PhonePreview";
import { androidInstaller, communityUrl, projectUrl } from "@/data/sites";
import "./App.css";

const SafariShortcut = lazy(() => import("@/components/SafariShortcut"));
const pages = ["navigation", "app", "downloads", "shortcut"];
const year = new Date().getFullYear();
const features = [
  [
    CalendarBlankIcon,
    "每一节课，都心中有数",
    "查看每周课表，理清上课时间与地点，让校园日常更有条理。",
  ],
  [
    BellIcon,
    "校园消息，随手可见",
    "把常用信息入口收在一起，从公告到校园服务，少一点来回跳转。",
  ],
  [
    ShieldCheckIcon,
    "你的数据，由你掌握",
    "课表快捷指令使用学校现有会话，账号和课表不会提交到本站。",
  ],
];

function currentPage() {
  const hash = window.location.hash.slice(1);
  return pages.includes(hash) ? hash : "navigation";
}
function initialDark() {
  try {
    const stored = localStorage.getItem("it-cloud-theme");
    return stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function ProductPage({ onNavigate }) {
  return (
    <div className="page-enter">
      <section className="product-hero">
        <div className="product-intro">
          <div className="eyebrow">MADE FOR YOUR CAMPUS</div>
          <div className="product-name">
            <span className="product-logo">
              <img src="/images/app-icon.png" alt="" />
            </span>
            <Badge variant="outline">UEM CONNECT</Badge>
          </div>
          <h1>
            应大通<span className="text-primary">。</span>
            <span>校园生活，轻装上阵。</span>
          </h1>
          <p className="hero-description">
            从早八的第一节课，到校园里的每个新消息。
            <br />
            把常用的校园服务放在一起，留点时间给更喜欢的事。
          </p>
          <div className="product-actions">
            <Button
              className="h-12 px-6"
              onClick={() => onNavigate("downloads")}
            >
              <DownloadSimpleIcon /> 获取应大通 <ArrowRightIcon />
            </Button>
            <Button
              variant="ghost"
              className="h-12"
              render={<a href={projectUrl} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              <GithubLogoIcon /> 在 GitHub 看看 <ArrowUpRightIcon />
            </Button>
          </div>
          <div className="product-availability">
            <AndroidLogoIcon /> Android 应用 <span>·</span>
            <AppleLogoIcon /> iOS 课表快捷指令
          </div>
        </div>
        <PhonePreview />
      </section>
      <section className="product-features" aria-label="应大通功能">
        {features.map(([Icon, title, description], i) => (
          <article key={title}>
            <span className="feature-number">0{i + 1}</span>
            <Icon weight="duotone" className="feature-icon" />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <div className="open-source-note">
        <CodeIcon />
        <p>
          由校园里的开发者共同构建。
          <span>你的一点建议，都可能让应大通变得更好。</span>
        </p>
        <a href={`${projectUrl}/issues`} target="_blank" rel="noreferrer">
          一起让它更好 <ArrowUpRightIcon />
        </a>
      </div>
    </div>
  );
}

function IosShortcutCard({ installer = false, onNavigate }) {
  const Heading = installer ? "h1" : "h2";
  return (
    <section className="ios-download" aria-labelledby="ios-title">
      <div className="download-platform">
        <span className="platform-icon">
          <AppleLogoIcon weight="fill" />
        </span>
        <Badge variant="outline">iOS SHORTCUT</Badge>
      </div>
      <Heading id="ios-title">让课表，住进日历。</Heading>
      <p className="download-description">
        {installer ? (
          "跟着下面四步操作，把学校课表添加到 iPhone 系统日历。"
        ) : (
          <>
            用 Safari 读取学校课表，
            <br />
            一键添加到 iPhone 系统日历。
          </>
        )}
      </p>
      {installer ? (
        <Suspense
          fallback={
            <p
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              正在加载快捷指令安装选项…
            </p>
          }
        >
          <SafariShortcut />
        </Suspense>
      ) : (
        <>
          <div className="download-feature-list">
            {["课表导入系统日历", "11 种提醒选项", "可选 Apple 地图适配"].map(
              (text) => (
                <p key={text}>
                  <CheckIcon />
                  {text}
                </p>
              ),
            )}
          </div>
          <div className="shortcut-entry-art" aria-hidden="true">
            <CalendarBlankIcon weight="duotone" />
            <span>SAFARI → CALENDAR</span>
          </div>
          <Button
            className="shortcut-entry-button h-12 w-full"
            render={<a href="#shortcut" />}
            nativeButton={false}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onNavigate("shortcut");
            }}
          >
            <CalendarBlankIcon />
            打开课表导出
            <ArrowRightIcon className="ml-auto" />
          </Button>
          <p className="download-file-note">
            选择提醒、添加快捷指令与查看使用说明
          </p>
        </>
      )}
    </section>
  );
}

function ShortcutPage() {
  return (
    <div className="page-enter shortcut-page">
      <IosShortcutCard installer />
    </div>
  );
}

function DownloadPage({ onNavigate }) {
  return (
    <div className="page-enter downloads-page">
      <div className="page-heading">
        <span className="eyebrow">TAKE YOUR CAMPUS WITH YOU</span>
        <h1>
          选一种方式，<span className="text-primary">连接校园。</span>
        </h1>
        <p className="hero-description">
          一个校园，两种陪伴。为你的设备，找到合适的应大通。
        </p>
      </div>
      <div className="download-grid">
        <section className="android-download" aria-labelledby="android-title">
          <div className="download-platform">
            <span className="platform-icon android-icon">
              <AndroidLogoIcon weight="duotone" />
            </span>
            <Badge variant="outline">ANDROID</Badge>
          </div>
          <h2 id="android-title">你的校园，随身携带。</h2>
          <p className="download-description">
            安装应大通 Android 应用，
            <br />
            让课表和校园服务，成为触手可及的日常。
          </p>
          <div className="download-feature-list">
            {[
              "每周课表与课程安排",
              "校园地图与地点标记",
              "原生 Android 应用",
            ].map((text) => (
              <p key={text}>
                <CheckIcon />
                {text}
              </p>
            ))}
          </div>
          <div className="android-art" aria-hidden="true">
            <span className="android-art-ring" />
            <img src="/images/app-icon.png" alt="" />
            <span className="art-spark spark-one">✦</span>
            <span className="art-spark spark-two">✧</span>
            <span className="art-caption">UEM CONNECT</span>
          </div>
          <Button
            className="h-12 w-full"
            render={<a href={androidInstaller} rel="noreferrer" />}
            nativeButton={false}
          >
            <DownloadSimpleIcon />
            下载 Android 安装包
            <ArrowUpRightIcon className="ml-auto" />
          </Button>
          <p className="download-file-note">
            最新发布版 · APK 安装包 · GitHub 代理下载
          </p>
          <a
            className="release-link"
            href={`${projectUrl}/releases/latest`}
            target="_blank"
            rel="noreferrer"
          >
            查看更新记录 <ArrowUpRightIcon />
          </a>
        </section>
        <IosShortcutCard onNavigate={onNavigate} />
      </div>
      <div className="download-help">
        <ShieldCheckIcon />
        <p>
          从学校，到你的设备。
          <span>本站提供安装文件与使用说明，不接收学校账号、密码或课表。</span>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [dark, setDark] = useState(initialDark);
  useEffect(() => {
    const onHash = () => setPage(currentPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("it-cloud-theme", dark ? "dark" : "light");
    } catch {
      /* Theme remains available without storage. */
    }
  }, [dark]);
  useEffect(() => {
    document.title = `${{ navigation: "校园导航", app: "应大通", downloads: "下载", shortcut: "课表导出" }[page]} · IT 智云社`;
  }, [page]);
  function navigate(value) {
    setPage(value);
    window.location.hash = value;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <Tabs
      value={page}
      onValueChange={navigate}
      className="site-shell gap-0 font-sans"
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a href="#navigation" className="brand" aria-label="IT 智云社首页">
            <span className="brand-symbol">
              <img src="/images/community.png" alt="" />
            </span>
            <span className="brand-name">
              IT 智云社<small>IT CLOUD COMMUNITY</small>
            </span>
          </a>
          <span className="header-motto">
            仁爱 <i /> 忠勇 <i /> 严明 <i /> 求是
          </span>
          <TabsList className="main-navigation" aria-label="主导航">
            <TabsTrigger value="navigation">
              <NavigationArrowIcon />
              导航
            </TabsTrigger>
            <TabsTrigger value="app">
              <CompassIcon />
              应大通
            </TabsTrigger>
            <TabsTrigger value="downloads">
              <DownloadSimpleIcon />
              下载
            </TabsTrigger>
          </TabsList>
          <span className="header-motto right-motto">
            勤学 <i /> 善思 <i /> 创新 <i /> 笃行
          </span>
          <div className="header-tools">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "切换浅色模式" : "切换深色模式"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
            <a
              className="github-link"
              href="https://github.com/NCIST-IT/UEM-Connect-web"
              target="_blank"
              rel="noreferrer"
              aria-label="网站 GitHub 仓库"
            >
              <GithubLogoIcon />
            </a>
          </div>
        </div>
      </header>
      <main id="main-content" className="site-main" tabIndex={-1}>
        <TabsContent value="navigation">
          <Directory onNavigate={navigate} />
        </TabsContent>
        <TabsContent value="app">
          <ProductPage onNavigate={navigate} />
        </TabsContent>
        <TabsContent value="downloads">
          <DownloadPage onNavigate={navigate} />
        </TabsContent>
        <TabsContent value="shortcut" aria-label="课表导出">
          <ShortcutPage />
        </TabsContent>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-community">
            <img src="/images/community.png" alt="" />
            <span>IT 智云社</span>
            <span className="footer-divider" />
            <span>用技术，让校园更近一点。</span>
          </div>
          <div className="footer-links">
            <a href={communityUrl} target="_blank" rel="noreferrer">
              开源社区 <ArrowUpRightIcon />
            </a>
            <a
              href="https://github.com/NCIST-IT/UEM-Connect-web/issues"
              target="_blank"
              rel="noreferrer"
            >
              建议与反馈 <ArrowUpRightIcon />
            </a>
            <span className="made-with">
              Made with <HeartIcon weight="fill" /> by students
            </span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} IT Cloud Community</span>
          <span>
            <SparkleIcon /> 从同学中来，到同学中去。
          </span>
        </div>
      </footer>
    </Tabs>
  );
}
