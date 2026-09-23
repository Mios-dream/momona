import {
  getCollection,
  type CollectionEntry,
} from "astro:content";
import type { BlogArticleSummary } from "../data/blog";

export type BlogArticleEntry = CollectionEntry<"articles">;

/**
 * 格式化文章日期，固定使用 UTC 避免构建机时区导致日期前后偏移。
 */
export function formatBlogDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** 格式化列表卡片使用的紧凑日期。 */
export function formatBlogCardDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 从 Markdown 正文估算字数和阅读时长。 */
function getBlogReadingStats(body = ""): {
  wordCount: number;
  readingMinutes: number;
} {
  const text = body
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cjkCharacters =
    text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? [];
  const latinWords =
    text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
  const wordCount = cjkCharacters.length + latinWords.length;

  return {
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 300)),
  };
}

/** 将 Astro 图片元数据或公开资源路径转换成浏览器可以直接读取的地址。 */
export function getBlogCoverSource(cover: unknown): string | undefined {
  if (typeof cover === "string") return cover;
  if (!cover || typeof cover !== "object") return undefined;

  const source = (cover as { src?: unknown }).src;
  return typeof source === "string" ? source : undefined;
}

/** 将内容集合条目压缩成列表页需要的公开摘要。 */
export function toBlogArticleSummary(
  article: BlogArticleEntry,
): BlogArticleSummary {
  const cover = getBlogCoverSource(article.data.cover);
  const { wordCount, readingMinutes } = getBlogReadingStats(article.body);

  return {
    slug: article.id,
    title: article.data.title,
    description: article.data.description,
    date: formatBlogCardDate(article.data.pubDate),
    isoDate: article.data.pubDate.toISOString(),
    wordCount,
    readingMinutes,
    category: article.data.category.trim() || article.data.tags[0] || "未分类",
    tags: [...article.data.tags],
    ...(cover ? { cover } : {}),
  };
}

/** 读取并按发布时间倒序返回所有已发布文章。 */
export async function getPublishedBlogArticles(): Promise<BlogArticleEntry[]> {
  const articles = await getCollection(
    "articles",
    ({ data }) => !data.draft,
  );
  return articles.sort(
    (first, second) =>
      second.data.pubDate.getTime() - first.data.pubDate.getTime(),
  );
}

/** 读取博客列表页需要的文章摘要。 */
export async function getPublishedBlogArticleSummaries(): Promise<
  BlogArticleSummary[]
> {
  const articles = await getPublishedBlogArticles();
  return articles.map(toBlogArticleSummary);
}
