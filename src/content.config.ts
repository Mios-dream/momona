import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/articles",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      description: z.string().default(""),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      category: z.string().trim().default(""),
      tags: z.array(z.string()).default([]),
      // Prefer an image next to the article, while keeping public asset URLs valid.
      cover: z
        .union([
          z
            .string()
            .refine(
              (value) => value.startsWith("/") || /^https?:\/\//.test(value),
              "封面应使用文章目录中的相对图片，或公开的 /... URL。",
            ),
          image(),
        ])
        .optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { articles };
