import type { APIRoute } from "astro";
import { getPublishedBlogArticles } from "../lib/blog";
import { readLocalConfigFile } from "../lib/localConfigStore";

export const prerender = true;

/** 将文本安全地嵌入 RSS XML 节点或属性。 */
function escapeXml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&apos;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

/** 将站点相对路径解析为带有构建 base 的绝对地址。 */
function resolveSiteUrl(baseUrl: URL, path: string): string {
  return new URL(path.replace(/^\/+/, ""), baseUrl).toString();
}

export const GET: APIRoute = async ({ site, url }) => {
  const [articles, localConfig] = await Promise.all([
    getPublishedBlogArticles(),
    readLocalConfigFile(),
  ]);
  const origin = site ?? new URL(`${url.origin}/`);
  const baseUrl = new URL(import.meta.env.BASE_URL, origin);
  const feedUrl = resolveSiteUrl(baseUrl, "rss.xml");
  const siteUrl = baseUrl.toString();
  const siteTitle = localConfig.site.title.trim() || "Love on the page";
  const siteDescription =
    localConfig.site.description.trim() || "Momona 期待和你相遇的每一天。";
  const latestDate = articles.reduce<Date | null>((latest, article) => {
    const articleDate = article.data.updatedDate ?? article.data.pubDate;
    return !latest || articleDate > latest ? articleDate : latest;
  }, null);

  const items = articles
    .map((article) => {
      const articleUrl = resolveSiteUrl(
        baseUrl,
        `blog/${article.id.replace(/^\/+|\/+$/g, "")}/`,
      );
      const articleDate = article.data.updatedDate ?? article.data.pubDate;
      const description =
        article.data.description.trim() || `${article.data.title} · ${siteTitle}`;
      const categories = [article.data.category.trim(), ...article.data.tags]
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .map((value) => `      <category>${escapeXml(value)}</category>`)
        .join("\n");

      return [
        "    <item>",
        `      <title>${escapeXml(article.data.title)}</title>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <link>${escapeXml(articleUrl)}</link>`,
        `      <guid isPermaLink=\"true\">${escapeXml(articleUrl)}</guid>`,
        `      <pubDate>${articleDate.toUTCString()}</pubDate>`,
        categories,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const document = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(siteTitle)}</title>`,
    `    <description>${escapeXml(siteDescription)}</description>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <atom:link href=\"${escapeXml(feedUrl)}\" rel=\"self\" type=\"application/rss+xml\" />`,
    ...(latestDate ? [`    <lastBuildDate>${latestDate.toUTCString()}</lastBuildDate>`] : []),
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(document, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
};
