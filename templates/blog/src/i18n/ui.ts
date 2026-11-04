import type { Locale } from "../config/site";

const en = {
  "site.name": "Field Notes",
  "nav.home": "Home",
  "nav.blog": "Journal",
  "nav.about": "About",
  "nav.search": "Search",
  "nav.theme": "Toggle theme",
  "nav.language": "Language",
  "home.latest": "Latest writing",
  "home.categories": "Browse by category",
  "blog.page": "Page",
  "blog.prev": "Previous",
  "blog.next": "Next",
  "blog.readingTime": "min read",
  "blog.related": "Related posts",
  "blog.toc": "On this page",
  "blog.prevPost": "Previous post",
  "blog.nextPost": "Next post",
  "tax.category": "Category",
  "tax.tag": "Tag",
  "search.placeholder": "Search posts…",
  "search.empty": "No matches.",
  "search.hint": "Esc to close",
  "404.title": "Page not found",
  "404.home": "Back home",
  "about.title": "About",
  "footer.rss": "RSS",
  "footer.built": "Built with EmDash",
  "lang.switch": "中文",
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  "site.name": "田野笔记",
  "nav.home": "首页",
  "nav.blog": "文章",
  "nav.about": "关于",
  "nav.search": "搜索",
  "nav.theme": "切换主题",
  "nav.language": "语言",
  "home.latest": "最新文章",
  "home.categories": "按分类浏览",
  "blog.page": "第",
  "blog.prev": "上一页",
  "blog.next": "下一页",
  "blog.readingTime": "分钟阅读",
  "blog.related": "相关文章",
  "blog.toc": "本文目录",
  "blog.prevPost": "上一篇",
  "blog.nextPost": "下一篇",
  "tax.category": "分类",
  "tax.tag": "标签",
  "search.placeholder": "搜索文章…",
  "search.empty": "没有匹配结果。",
  "search.hint": "Esc 关闭",
  "404.title": "页面不存在",
  "404.home": "返回首页",
  "about.title": "关于",
  "footer.rss": "订阅",
  "footer.built": "由 EmDash 驱动",
  "lang.switch": "English",
};

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, zh };

export function t(key: MessageKey, locale: Locale): string {
  return dictionaries[locale][key];
}
