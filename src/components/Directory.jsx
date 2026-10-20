import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  MagnifyingGlassIcon,
  StarIcon,
  XIcon,
  SquaresFourIcon,
  GraduationCapIcon,
  BuildingsIcon,
  EnvelopeSimpleIcon,
  CalendarBlankIcon,
  NewspaperIcon,
  MegaphoneIcon,
  BriefcaseIcon,
  BooksIcon,
  WifiHighIcon,
  BankIcon,
  BookOpenTextIcon,
  FunnelSimpleIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { categories, schools, totalSites, researchDate } from "@/data/sites";

const icons = {
  portal: SquaresFourIcon,
  study: BookOpenTextIcon,
  graduate: GraduationCapIcon,
  school: BuildingsIcon,
  mail: EnvelopeSimpleIcon,
  calendar: CalendarBlankIcon,
  news: NewspaperIcon,
  notice: MegaphoneIcon,
  jobs: BriefcaseIcon,
  library: BooksIcon,
  network: WifiHighIcon,
  museum: BankIcon,
};

function loadFavorites() {
  try {
    const value = JSON.parse(
      localStorage.getItem("it-cloud-favorites") || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export default function Directory({ onNavigate }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部站点");
  const [favorites, setFavorites] = useState(loadFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [expanded, setExpanded] = useState({});
  const search = useRef(null);
  useEffect(() => {
    function onKey(event) {
      const editing =
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
        event.target.isContentEditable;
      if (
        !editing &&
        (event.key === "/" ||
          ((event.ctrlKey || event.metaKey) && event.key === "k"))
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  function toggleFavorite(id) {
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem("it-cloud-favorites", JSON.stringify(next));
    } catch {
      /* In-memory favorites still work. */
    }
  }
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (site, school) =>
    (category === "全部站点" || site.category === category) &&
    (!onlyFavorites || favorites.includes(site.id)) &&
    `${school.name} ${school.fullName} ${site.campus} ${site.category} ${site.name} ${site.description} ${site.status} ${site.url}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  const visibleSchools = schools.map((school) => ({
    ...school,
    sites: school.sites.filter((site) => matches(site, school)),
  }));
  const count = visibleSchools.reduce(
    (total, school) => total + school.sites.length,
    0,
  );
  function reset() {
    setQuery("");
    setCategory("全部站点");
    setOnlyFavorites(false);
  }

  return (
    <div className="page-enter">
      <section className="directory-hero" aria-labelledby="directory-title">
        <div>
          <div className="eyebrow">
            YOUR CAMPUS, CONNECTED
          </div>
          <h1 id="directory-title">
            校园很大，
            <br className="sm:hidden" />
            常用的都在这里<span className="text-primary">。</span>
          </h1>
          <p className="hero-description">
            少一点寻找，多一点时间。属于华科与防灾同学的校园起点。
          </p>
        </div>
        <div className="directory-search">
          <label htmlFor="site-search" className="sr-only">
            搜索网站、服务或学校
          </label>
          <MagnifyingGlassIcon className="size-5 shrink-0 text-muted-foreground" />
          <Input
            ref={search}
            id="site-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="找网站，找服务…"
            className="h-12 min-w-0 border-0 bg-transparent px-0 shadow-none ring-0! focus-visible:ring-0!"
          />
          {query ? (
            <button
              className="search-clear"
              aria-label="清空搜索"
              onClick={() => setQuery("")}
            >
              <XIcon />
            </button>
          ) : (
            <kbd className="search-key" aria-hidden="true">
              /
            </kbd>
          )}
        </div>
      </section>

      <div className="directory-toolbar">
        <div className="category-list" role="group" aria-label="网站分类">
          {categories.map((item) => (
            <Button
              key={item}
              variant="ghost"
              className={cn(
                "category-button",
                category === item && "is-selected",
              )}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
              {item === "全部站点" && (
                <span className="category-count">{totalSites}</span>
              )}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          className={cn(
            "favorites-filter",
            onlyFavorites && "text-primary bg-primary/5",
          )}
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          <StarIcon weight={onlyFavorites ? "fill" : "regular"} /> 我的收藏{" "}
          <span>{favorites.length}</span>
        </Button>
      </div>

      <div className="sr-only" role="status">
        找到 {count} 个站点
      </div>
      {count > 0 ? (
        <div className="school-grid">
          {visibleSchools
            .filter((school) => school.sites.length)
            .map((school) => (
              <section
                key={school.id}
                className={cn("school-panel", `school-${school.tone}`)}
                aria-labelledby={`${school.id}-title`}
              >
                <header className="school-header">
                  <div className="flex items-center gap-3.5">
                    <span className="school-monogram">
                      <BuildingsIcon weight="duotone" />
                    </span>
                    <div>
                      <h2 id={`${school.id}-title`}>
                        {school.name}
                        <span>{school.initials}</span>
                      </h2>
                      <p>{school.fullName}</p>
                    </div>
                  </div>
                  <span className="school-site-count">
                    {school.sites.length} 个站点
                  </span>
                </header>
                <div className="site-grid">
                  {school.sites
                    .slice(
                      0,
                      expanded[school.id] ||
                        normalizedQuery ||
                        category !== "全部站点" ||
                        onlyFavorites
                        ? undefined
                        : school.id === "shared"
                          ? 6
                          : 9,
                    )
                    .map((site) => {
                      const Icon = icons[site.icon];
                      const saved = favorites.includes(site.id);
                      return (
                        <div
                          className={cn(
                            "site-tile",
                            site.featured && "site-featured",
                          )}
                          key={site.id}
                        >
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="site-link"
                            title={`${site.name}\n${site.description}\n${site.status}\n${site.url}`}
                          >
                            <div className="site-topline">
                              <span
                                className={cn("site-icon", `icon-${site.icon}`)}
                              >
                                <Icon weight="duotone" />
                              </span>
                              {site.statusLabel && (
                                <span className="site-status">
                                  {site.statusLabel}
                                </span>
                              )}
                              <ArrowUpRightIcon className="site-arrow" />
                            </div>
                            <h3>{site.name}</h3>
                            <p>{site.description}</p>
                          </a>
                          <button
                            onClick={() => toggleFavorite(site.id)}
                            className={cn(
                              "favorite-button",
                              saved && "is-saved",
                            )}
                            aria-label={`${saved ? "取消收藏" : "收藏"}${school.name}${site.name}`}
                            aria-pressed={saved}
                          >
                            <StarIcon weight={saved ? "fill" : "regular"} />
                          </button>
                        </div>
                      );
                    })}
                </div>
                {!normalizedQuery &&
                  category === "全部站点" &&
                  !onlyFavorites &&
                  school.sites.length > (school.id === "shared" ? 6 : 9) && (
                    <button
                      className="expand-sites"
                      aria-expanded={!!expanded[school.id]}
                      onClick={() =>
                        setExpanded((value) => ({
                          ...value,
                          [school.id]: !value[school.id],
                        }))
                      }
                    >
                      {expanded[school.id]
                        ? "收起站点"
                        : `查看全部 ${school.sites.length} 个站点`}
                      <ArrowRightIcon
                        className={
                          expanded[school.id] ? "-rotate-90" : "rotate-90"
                        }
                      />
                    </button>
                  )}
                <footer className="school-footer">
                  {school.motto}
                  <span className="ml-auto">{school.initials} ↗</span>
                </footer>
              </section>
            ))}
        </div>
      ) : (
        <div className="directory-empty">
          <FunnelSimpleIcon className="size-9 text-primary" />
          <h2>
            {onlyFavorites && !favorites.length
              ? "把常用的网站，留在手边"
              : "暂时没有找到这个站点"}
          </h2>
          <p>
            {onlyFavorites && !favorites.length
              ? "点击网站卡片上的星标，就可以收藏常用入口。"
              : "换个关键词，或试试其他分类。"}
          </p>
          <Button variant="outline" onClick={reset}>
            查看全部站点 <ArrowRightIcon />
          </Button>
        </div>
      )}

      <div className="directory-notes">
        <span>
          {totalSites} 个校园资源 · {researchDate}
        </span>
        <p>按资源清单收录，含历史入口；部分服务需校园网或登录</p>
        <a
          href="https://github.com/NCIST-IT/UEM-Connect-web/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          反馈失效链接 <ArrowUpRightIcon />
        </a>
      </div>

      <section className="product-banner" aria-label="发现应大通">
        <span className="banner-app-icon">
          <img src="/images/app-icon.png" alt="" />
        </span>
        <div className="banner-copy">
          <span className="eyebrow">MEET UEM CONNECT</span>
          <h2>把校园，装进口袋。</h2>
          <p>查课表、看公告，让应大通陪你度过每个校园日常。</p>
        </div>
        <Button
          variant="outline"
          className="banner-button"
          onClick={() => onNavigate("app")}
        >
          认识应大通 <ArrowRightIcon />
        </Button>
        <span className="banner-orbit" aria-hidden="true" />
      </section>
    </div>
  );
}
