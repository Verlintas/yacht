export type WikiCategorySlug = 'start' | 'psych' | 'medical' | 'legal' | 'life' | 'resources';

export interface WikiCategory {
  slug: WikiCategorySlug;
  label: string;
  latin: string;
  description: string;
}

export const wikiCategories: WikiCategory[] = [
  {
    slug: 'start',
    label: '入门导览',
    latin: 'Start here',
    description: '还不确定从哪看起，或者想先弄清整条路径长什么样，从这里进。',
  },
  {
    slug: 'psych',
    label: '心理与诊断',
    latin: 'Psych',
    description: '精神科就诊、诊断证明与介绍信、心理咨询怎么找。',
  },
  {
    slug: 'medical',
    label: '医疗索引',
    latin: 'Medical',
    description: 'HRT 资源、药物与监测、手术类别。只做索引，不复述剂量。',
  },
  {
    slug: 'legal',
    label: '证件与法律',
    latin: 'Legal',
    description: '实名信息、学历学籍、医保社保、旅行证件的变更顺序。',
  },
  {
    slug: 'life',
    label: '生活',
    latin: 'Life',
    description: '出柜、校园、职场、声音、社群与家庭。',
  },
  {
    slug: 'resources',
    label: '资源',
    latin: 'Resources',
    description: '上游资料库、工具与本站的核对清单。',
  },
];

export function getCategory(slug: string): WikiCategory {
  return wikiCategories.find((category) => category.slug === slug) ?? wikiCategories[0];
}

export const statusMeta: Record<string, { label: string; tone: string; hint: string }> = {
  draft: { label: '草稿', tone: 'badge-warn', hint: 'AI 整理且未经核对，可能有误，请谨慎参考' },
  sourced: { label: '有来源', tone: 'badge', hint: 'AI 整理并附了来源，但未经人工复核，可能有误' },
  reviewed: { label: '已核对', tone: 'badge-good', hint: '已人工核对过来源与表述' },
  outdated: { label: '已过时', tone: 'badge-bad', hint: '内容可能已经过期，请以上游来源为准' },
};

export const statusOrder = ['draft', 'sourced', 'reviewed', 'outdated'];
