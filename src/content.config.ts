import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    summary: z.string().optional(),
    pinned: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    owner: z.enum(['personal', 'nusv']).default('personal'),
    flagship: z.boolean().default(false),
    status: z.enum(['active', 'paused', 'idea', 'done', 'archived']),
    updated: z.coerce.date(),
    stack: z.array(z.string()).default([]),
    repo: z.url().optional(),
    summary: z.string().optional(),
  }),
});

const wiki = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/wiki' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['start', 'psych', 'medical', 'legal', 'life', 'resources']),
    order: z.number().default(100),
    tags: z.array(z.string()).default([]),
    updated: z.coerce.date(),
    status: z.enum(['draft', 'sourced', 'reviewed', 'outdated']),
    summary: z.string().optional(),
    sources: z
      .array(
        z.object({
          title: z.string(),
          url: z.url(),
          accessed: z.coerce.date().optional(),
        }),
      )
      .min(1),
    upstream: z
      .array(
        z.object({
          title: z.string(),
          url: z.url(),
        }),
      )
      .default([]),
  }),
});

export const collections = { notes, projects, wiki };
