import { getPublishedBlogArticleSummaries } from "../lib/blog";

export const prerender = true;

export async function GET(): Promise<Response> {
  const articles = await getPublishedBlogArticleSummaries();

  return new Response(JSON.stringify(articles), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
