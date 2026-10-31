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
    /** 工程指标（可选）。手动采集：shallow clone 后数 LOC / 提交 / 测试注解 / tag。 */
    loc: z.number().int().nonnegative().optional(),
    commits: z.number().int().nonnegative().optional(),
    tests: z.number().int().nonnegative().optional(),
    versions: z.number().int().nonnegative().optional(),
    metricsAt: z.coerce.date().optional(),
  }),
});

const wiki = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/wiki' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['start', 'psych', 'medical', 'legal', 'life', 'resources']),
    /** reference = 资料性条目（事实性说法须逐条附来源）；practical = 操作性条目（经验整理，非科学结论） */
    nature: z.enum(['reference', 'practical']).default('reference'),
    scenarios: z
      .array(z.enum(['unsure', 'start', 'hrt', 'surgery', 'documents', 'life', 'trouble']))
      .default([]),
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
