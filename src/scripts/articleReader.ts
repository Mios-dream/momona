const storageKey = "momona:article-reader-preferences";

const defaults = {
  fontSize: 1,
  theme: "paper",
  lineHeight: 1.95,
} as const;

const themes = ["paper", "warm", "mist", "night"] as const;
const themeLabels: Record<(typeof themes)[number], string> = {
  paper: "纸张",
  warm: "暖色",
  mist: "雾蓝",
  night: "夜间",
};

const fontSizeRange = { min: 0.88, max: 1.24, step: 0.04 } as const;
const lineHeightRange = { min: 1.65, max: 2.25, step: 0.05 } as const;

type ReaderPreferences = {
  fontSize: number;
  theme: (typeof themes)[number];
  lineHeight: number;
};

const isTheme = (value: unknown): value is ReaderPreferences["theme"] =>
  typeof value === "string" &&
  themes.includes(value as ReaderPreferences["theme"]);

function clampRange(
  value: number,
  range: { min: number; max: number },
): number {
  return Number(Math.min(range.max, Math.max(range.min, value)).toFixed(2));
}

function formatLineHeight(value: number): string {
  return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function readPreferences(): ReaderPreferences {
  const preferences: ReaderPreferences = { ...defaults };

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(storageKey) || "null",
    ) as Partial<ReaderPreferences> | null;

    if (saved && typeof saved.fontSize === "number") {
      preferences.fontSize = clampRange(saved.fontSize, fontSizeRange);
    }
    if (saved && isTheme(saved.theme)) {
      preferences.theme = saved.theme;
    }
    if (saved && typeof saved.lineHeight === "number") {
      preferences.lineHeight = clampRange(saved.lineHeight, lineHeightRange);
    }
  } catch {
    // 私密浏览或禁用存储时继续使用默认偏好。
  }

  return preferences;
}

function savePreferences(preferences: ReaderPreferences): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // 存储不可用时不阻断阅读。
  }
}

function setupArticleReader(): void {
  const pageElement = document.querySelector<HTMLElement>(
    "[data-reading-page]",
  );
  if (!pageElement) return;
  const page: HTMLElement = pageElement;

  const articleElement = page.querySelector<HTMLElement>(
    "[data-reader-article]",
  );
  const tocPanelElement = page.querySelector<HTMLElement>("[data-toc-panel]");
  const tocElement = page.querySelector<HTMLElement>("[data-toc]");

  if (!articleElement || !tocPanelElement || !tocElement) return;
  const article: HTMLElement = articleElement;
  const tocPanel: HTMLElement = tocPanelElement;
  const toc: HTMLElement = tocElement;

  let preferences = readPreferences();

  function applyPreferences(): void {
    page.dataset.readerTheme = preferences.theme;
    page.style.setProperty(
      "--article-font-scale",
      String(preferences.fontSize),
    );
    page.style.setProperty(
      "--article-line-height",
      String(preferences.lineHeight),
    );

    const fontValue = page.querySelector<HTMLElement>(
      "[data-reader-font-value]",
    );
    const lineValue = page.querySelector<HTMLElement>(
      "[data-reader-line-value]",
    );
    const fontDecrease = page.querySelector<HTMLButtonElement>(
      "[data-reader-font-decrease]",
    );
    const fontIncrease = page.querySelector<HTMLButtonElement>(
      "[data-reader-font-increase]",
    );
    const lineDecrease = page.querySelector<HTMLButtonElement>(
      "[data-reader-line-decrease]",
    );
    const lineIncrease = page.querySelector<HTMLButtonElement>(
      "[data-reader-line-increase]",
    );
    const themeToggle = page.querySelector<HTMLButtonElement>(
      "[data-reader-theme-toggle]",
    );
    const themeSwatch = page.querySelector<HTMLElement>(
      "[data-reader-theme-swatch]",
    );

    if (fontValue) {
      fontValue.textContent = `${Math.round(preferences.fontSize * 100)}%`;
    }
    if (lineValue)
      lineValue.textContent = formatLineHeight(preferences.lineHeight);
    if (fontDecrease)
      fontDecrease.disabled = preferences.fontSize <= fontSizeRange.min;
    if (fontIncrease)
      fontIncrease.disabled = preferences.fontSize >= fontSizeRange.max;
    if (lineDecrease)
      lineDecrease.disabled = preferences.lineHeight <= lineHeightRange.min;
    if (lineIncrease)
      lineIncrease.disabled = preferences.lineHeight >= lineHeightRange.max;

    const currentThemeLabel = themeLabels[preferences.theme];
    if (themeSwatch) themeSwatch.dataset.readerTheme = preferences.theme;
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        `切换背景颜色，当前为${currentThemeLabel}背景`,
      );
      themeToggle.title = `切换背景颜色（当前：${currentThemeLabel}）`;
    }
  }

  function updatePreference<K extends keyof ReaderPreferences>(
    key: K,
    value: ReaderPreferences[K],
  ): void {
    preferences = { ...preferences, [key]: value };
    applyPreferences();
    savePreferences(preferences);
  }

  function adjustRange(
    key: "fontSize" | "lineHeight",
    direction: -1 | 1,
  ): void {
    const range = key === "fontSize" ? fontSizeRange : lineHeightRange;
    const next = clampRange(preferences[key] + range.step * direction, range);
    if (next === preferences[key]) return;
    updatePreference(key, next);
  }

  applyPreferences();

  page
    .querySelector<HTMLButtonElement>("[data-reader-theme-toggle]")
    ?.addEventListener("click", () => {
      const currentIndex = themes.indexOf(preferences.theme);
      const nextTheme = themes[(currentIndex + 1) % themes.length];
      updatePreference("theme", nextTheme);
    });
  page
    .querySelector<HTMLButtonElement>("[data-reader-font-decrease]")
    ?.addEventListener("click", () => adjustRange("fontSize", -1));
  page
    .querySelector<HTMLButtonElement>("[data-reader-font-increase]")
    ?.addEventListener("click", () => adjustRange("fontSize", 1));
  page
    .querySelector<HTMLButtonElement>("[data-reader-line-decrease]")
    ?.addEventListener("click", () => adjustRange("lineHeight", -1));
  page
    .querySelector<HTMLButtonElement>("[data-reader-line-increase]")
    ?.addEventListener("click", () => adjustRange("lineHeight", 1));
  page
    .querySelector<HTMLButtonElement>("[data-reader-reset]")
    ?.addEventListener("click", () => {
      preferences = { ...defaults };
      applyPreferences();
      savePreferences(preferences);
    });

  const mobileLayoutQuery = window.matchMedia("(max-width: 620px)");
  const headings = Array.from(
    article.querySelectorAll<HTMLElement>("h2, h3, h4"),
  );
  const usedIds = new Set<string>();
  const tocLinks: HTMLAnchorElement[] = [];

  function headingSlug(text: string, index: number): string {
    const slug = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u3400-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return slug || `section-${index + 1}`;
  }

  headings.forEach((heading, index) => {
    const label = heading.textContent?.trim() || `第 ${index + 1} 节`;
    const baseId = headingSlug(label, index);
    let id = heading.id.trim() || baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    heading.id = id;
    usedIds.add(id);

    const item = document.createElement("li");
    item.className = `blog-post-toc-item blog-post-toc-item--${heading.tagName.toLowerCase()}`;
    const link = document.createElement("a");
    link.href = `#${id}`;
    link.dataset.headingId = id;
    link.textContent = label;
    item.append(link);
    toc.append(item);
    tocLinks.push(link);
    link.addEventListener("click", () => {
      setActiveHeading(id);
      if (mobileLayoutQuery.matches) {
        setTocOpen(false);
      }
    });
  });

  const tocCount = page.querySelector<HTMLElement>("[data-toc-count]");
  if (tocCount) tocCount.textContent = String(headings.length);
  if (!headings.length) {
    const empty = document.createElement("p");
    empty.className = "blog-post-toc-empty";
    empty.textContent = "本文暂无小节";
    toc.append(empty);
  }

  function setActiveHeading(id: string): void {
    tocLinks.forEach((link) => {
      const active = link.dataset.headingId === id;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  if (headings[0]) setActiveHeading(headings[0].id);

  let tocOpen = false;
  let wasMobile = mobileLayoutQuery.matches;
  const tocToggles = Array.from(
    page.querySelectorAll<HTMLButtonElement>("[data-toc-toggle]"),
  );

  function setTocOpen(open: boolean): void {
    tocOpen = open;
    tocPanel.classList.toggle("is-open", open);
    tocPanel.setAttribute("aria-hidden", String(!open));
    tocToggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute(
        "aria-label",
        open ? "关闭文章目录" : "打开文章目录",
      );
    });
  }

  function syncTocMode(): void {
    const mobile = mobileLayoutQuery.matches;
    if (mobile) {
      if (!wasMobile) tocOpen = false;
      setTocOpen(tocOpen);
    } else {
      setTocOpen(false);
    }
    wasMobile = mobile;
  }

  tocToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => setTocOpen(!tocOpen));
  });
  syncTocMode();

  let toolbarHidden = false;
  let lastScrollY = window.scrollY;
  let toolbarVisibilityFrame = 0;

  function setToolbarHidden(hidden: boolean): void {
    if (toolbarHidden === hidden) return;
    toolbarHidden = hidden;
    page.classList.toggle("is-reader-toolbar-hidden", hidden);
  }

  function updateToolbarVisibility(): void {
    toolbarVisibilityFrame = 0;
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;

    if (currentScrollY <= 24) {
      setToolbarHidden(false);
    } else if (scrollDelta >= 8) {
      setToolbarHidden(true);
    } else if (scrollDelta <= -8) {
      setToolbarHidden(false);
    }

    lastScrollY = currentScrollY;
  }

  function scheduleToolbarVisibility(): void {
    if (toolbarVisibilityFrame) return;
    toolbarVisibilityFrame = window.requestAnimationFrame(
      updateToolbarVisibility,
    );
  }

  const progressBar = page.querySelector<HTMLElement>(
    "[data-reading-progress-bar]",
  );
  const progressTrack = page.querySelector<HTMLElement>("[data-progress-bar]");
  const progressLabels = page.querySelectorAll<HTMLElement>(
    "[data-progress-label]",
  );
  const progressRing = page.querySelector<HTMLElement>("[data-progress-ring]");
  const progressRoot = page.querySelector<HTMLElement>(
    "[data-reading-progress]",
  );
  let readingFrame = 0;

  function updateReadingState(): void {
    readingFrame = 0;
    const rect = article.getBoundingClientRect();
    const articleTop = rect.top + window.scrollY;
    const articleBottom = rect.bottom + window.scrollY;
    const finish = Math.max(articleTop, articleBottom - window.innerHeight);
    const progress =
      finish === articleTop
        ? window.scrollY >= articleTop
          ? 1
          : 0
        : Math.min(
            1,
            Math.max(0, (window.scrollY - articleTop) / (finish - articleTop)),
          );
    const percentage = Math.round(progress * 100);
    const progressValue = `${percentage}%`;

    if (progressBar) progressBar.style.width = progressValue;
    if (progressTrack) {
      progressTrack.style.width = progressValue;
    }
    progressLabels.forEach((label) => {
      label.textContent = progressValue;
    });
    progressRing?.style.setProperty(
      "--reading-progress-angle",
      `${percentage * 3.6}deg`,
    );
    progressRing?.setAttribute("aria-valuenow", String(percentage));
    progressRoot?.setAttribute("aria-valuenow", String(percentage));

    if (headings.length) {
      const marker = window.innerHeight * 0.22;
      let current = headings[0];
      headings.forEach((heading) => {
        if (heading.getBoundingClientRect().top <= marker) current = heading;
      });
      if (current) setActiveHeading(current.id);
    }
  }

  function scheduleReadingState(): void {
    if (readingFrame) return;
    readingFrame = window.requestAnimationFrame(updateReadingState);
  }

  window.addEventListener("scroll", scheduleReadingState, { passive: true });
  window.addEventListener("scroll", scheduleToolbarVisibility, {
    passive: true,
  });
  window.addEventListener("resize", () => {
    lastScrollY = window.scrollY;
    setToolbarHidden(false);
    syncTocMode();
    scheduleReadingState();
  });
  window.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (
      mobileLayoutQuery.matches &&
      !tocPanel.contains(target) &&
      !tocToggles.some((toggle) => toggle.contains(target))
    ) {
      setTocOpen(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setTocOpen(false);
  });
  window.addEventListener("load", scheduleReadingState, { once: true });
  window.setTimeout(scheduleReadingState, 0);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupArticleReader, {
    once: true,
  });
} else {
  setupArticleReader();
}
