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
    label: '医疗',
    latin: 'Medical',
    description: 'HRT 资源、药物与剂量、监测与风险、手术类别。',
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

export type WikiScenarioSlug =
  | 'unsure'
  | 'start'
  | 'hrt'
  | 'surgery'
  | 'documents'
  | 'life'
  | 'trouble';

export interface WikiScenario {
  slug: WikiScenarioSlug;
  /** 用「我现在……」的口吻，而不是主题名词 */
  title: string;
  latin: string;
  intro: string;
  icon: string;
}

export const wikiScenarios: WikiScenario[] = [
  {
    slug: 'unsure',
    title: '我还不确定',
    latin: 'Not sure yet',
    intro: '先弄清自己是什么状态。不急着做任何医疗决定，也不会有人催你。',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.7c0 1.7-2.4 2-2.4 3.6"/><path d="M12 17.4h.01"/>',
  },
  {
    slug: 'start',
    title: '我要开始就医',
    latin: 'Getting started',
    intro: '从挂精神科、拿诊断证明，到第一次开药。这一步的产出是后面所有环节的入场券。',
    icon: '<path d="M13 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M9 8l4 4-4 4"/><path d="M3 12h10"/>',
  },
  {
    slug: 'hrt',
    title: '我在用药',
    latin: 'On HRT',
    intro: '剂量、监测、风险，以及怎么和医生配合。监测是唯一能提前发现问题的环节。',
    icon: '<path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7Z"/><path d="M7 7l10 10"/>',
  },
  {
    slug: 'surgery',
    title: '我在考虑手术',
    latin: 'Surgery',
    intro: '五类手术的门槛、可逆性、准备与恢复。没有任何一项是必须做的。',
    icon: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8.1 7.6 20 19M20 5 8.1 16.4"/>',
  },
  {
    slug: 'documents',
    title: '我要改证件',
    latin: 'Documents',
    intro: '户籍、身份证、学历、医保、旅行证件。顺序比材料重要，先办哪个决定后面顺不顺。',
    icon: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h4"/>',
  },
  {
    slug: 'life',
    title: '我在过日子',
    latin: 'Daily life',
    intro: '出柜、校园、职场、家庭、声音、外观。这些不需要等医疗流程走完。',
    icon: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/>',
  },
  {
    slug: 'trouble',
    title: '我遇到麻烦',
    latin: 'When things go wrong',
    intro: '被拒诊、被歧视、信息被泄露、权益受损，或者情绪撑不住的时候。',
    icon: '<path d="M12 4 2.5 20h19Z"/><path d="M12 10v4M12 17.2h.01"/>',
  },
];

export function getScenario(slug: string): WikiScenario {
  return wikiScenarios.find((scenario) => scenario.slug === slug) ?? wikiScenarios[0];
}

export const statusMeta: Record<string, { label: string; tone: string; hint: string }> = {
  draft: { label: '草稿', tone: 'badge-warn', hint: 'AI 整理且未经核对，可能有误，请谨慎参考' },
  sourced: { label: '有来源', tone: 'badge', hint: 'AI 整理并附了来源，但未经人工复核，可能有误' },
  reviewed: { label: '已核对', tone: 'badge-good', hint: '已人工核对过来源与表述' },
  outdated: { label: '已过时', tone: 'badge-bad', hint: '内容可能已经过期，请以上游来源为准' },
};

export const statusOrder = ['draft', 'sourced', 'reviewed', 'outdated'];
