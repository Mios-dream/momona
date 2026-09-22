/**
 * 文章列表接口和博客列表组件共享的文章摘要。
 *
 * 文章正文只在详情页构建，列表接口只携带必要的公开元数据，避免把整篇文章
 * 发送到文章列表客户端。
 */
export interface BlogArticleSummary {
  slug: string;
  title: string;
  description: string;
  date: string;
  isoDate: string;
  tags: string[];
  cover?: string;
}

/** 生成文章详情页的静态地址。 */
export function blogArticlePath(slug: string): string {
  return `/blog/${slug}/`;
}
