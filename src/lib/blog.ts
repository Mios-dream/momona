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

/** 将内容集合条目压缩成列表页需要的公开摘要。 */
export function toBlogArticleSummary(
  article: BlogArticleEntry,
): BlogArticleSummary {
  return {
    slug: article.id,
    title: article.data.title,
    description: article.data.description,
    date: formatBlogDate(article.data.pubDate),
    isoDate: article.data.pubDate.toISOString(),
    tags: [...article.data.tags],
    ...(article.data.cover ? { cover: article.data.cover } : {}),
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
