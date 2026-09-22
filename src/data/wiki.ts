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

/**
 * 搜索别名：社群俗称、商品名、英文缩写 → 条目 id。
 * 让「色普龙」「补佳乐」这类词也能搜到对应条目。
 */
export const wikiAliases: Record<string, string[]> = {
  'antiandrogen-compare': [
    '色普龙', '色谱龙', '醋酸环丙孕酮', 'CPA', '安体舒通', '螺内酯', '比卡鲁胺',
    '康士得', '日色', '醋酸氯地孕酮', '抗雄', '抗雄激素',
  ],
  'estrogen-compare': [
    '补佳乐', '芬吗通', '戊酸雌二醇', '雌二醇', '贴片', '凝胶', '日雌', 'E2',
    '雌激素', '雌二醇凝胶', '雌二醇贴片',
  ],
  progesterone: [
    '孕酮', '黄体酮', '孕激素', '安宫黄体酮', '醋酸甲羟孕酮', 'MPA', '地屈孕酮',
  ],
  'medication-doses': ['剂量', '用量', '吃多少', '多少毫克'],
  'medication-index': ['药物索引', '药品', '药名'],
  'puberty-blockers': ['青春期阻断', 'GnRH', '曲普瑞林', '亮丙瑞林', '青春期抑制'],
  'hrt-complete-guide': ['HRT 指南', '激素治疗指南', '完整指南', '激素'],
  'monitoring-index': ['复查', '化验', '抽血', '检查项目', '监测'],
  'hormone-panel': ['性激素六项', '激素六项', '化验单', '参考范围'],
  'hormone-converter': ['单位换算', 'pg/mL', 'pmol/L', '换算'],
  'thrombosis-risk': ['血栓', '静脉血栓', '凝血', 'D-二聚体'],
  'liver-function': ['肝功能', '转氨酶', 'ALT', 'AST', '肝酶'],
  prolactin: ['泌乳素', 'PRL', '催乳素'],
  'bone-density': ['骨密度', '骨质疏松', '骨量'],
  'hair-removal': ['脱毛', '激光脱毛', '电解', '胡须', '体毛'],
  'hair-loss': ['脱发', '发际线', '米诺地尔', '非那雄胺'],
  'surgery-overview': ['手术', '性别肯定手术', 'SRS', 'GRS', '手术类别'],
  'surgery-prep': ['术前准备', '术前', '公证', '手术材料'],
  'surgery-recovery': ['术后护理', '恢复', '扩张', '术后'],
  'vocal-surgery': ['声带手术', '嗓音手术', '音高手术'],
  'voice-training': ['嗓音训练', '声音训练', '女声', '伪音'],
  'ffs-overview': ['FFS', '面部女性化', '面部手术', '削骨', '喉结'],
  'breast-augmentation': ['隆胸', '乳房增大', '假体', '丰胸'],
  'diagnosis-letter': ['诊断证明', '介绍信', '易性症证明', '证明'],
  'diagnosis-criteria': ['诊断标准', '易性症', '性别不一致', '诊断依据'],
  'psych-first-visit': ['精神科', '心理科', '第一次就诊', '挂号'],
  'gender-dysphoria': ['性别不安', '性别焦虑', '性别烦躁'],
  'household-register': ['户口', '户籍', '户口本'],
  'id-card-change': ['身份证', '身份证变更'],
  'name-change': ['改名', '姓名变更'],
  'education-records': ['学籍', '学历', '毕业证'],
  'healthcare-insurance': ['医保', '社保', '报销'],
  notarization: ['公证', '公证处'],
  'travel-documents': ['护照', '通行证', '签证'],
  'real-name-overview': ['实名信息', '证件变更', '变更顺序'],
  'coming-out': ['出柜', '坦白', '告诉家人'],
  'family-reactions': ['家人反对', '家庭冲突', '父母'],
  'chest-shape': ['内衣', '义乳', '垫胸', '束胸', '胸垫', 'binding'],
  'clothing-style': ['穿搭', '服装', '衣服', '尺码'],
  'eating-disorders': ['进食障碍', '厌食', '暴食', '催吐'],
  neurodiversity: ['自闭', '自闭症', '谱系', 'ADHD', '注意力缺陷', '神经多样性'],
  'small-city': ['县城', '农村', '小地方', '异地就医'],
  'student-earning': ['打工', '兼职', '未成年工', '攒钱'],
  'changing-rooms': ['更衣室', '泳池', '浴室', '澡堂', '游泳课'],
  'crisis-resources': ['危机', '自杀', '自伤', '紧急'],
  'scam-awareness': ['诈骗', '骗局', '被骗'],
  'privacy-law': ['隐私', '个人信息', '泄露'],
  'online-harassment': ['网暴', '骚扰', '人肉'],
  'employment-discrimination': ['歧视', '就业歧视', '被开除'],
  'appeal-path': ['申诉', '投诉', '维权'],
  'age-thresholds': ['年龄', '几岁', '家长要求', '监护人'],
  'cost-timeline': ['费用', '多少钱', '时间规划'],
};

/** 词表自动链接：正文中首次出现的术语 → 站内条目。数据源见 glossary.mjs。 */
export { glossaryTerms, wikiGlossaryLinks } from './glossary.mjs';

/** 条目 id → 搜索别名（含自身标题），用于索引。 */
export function aliasesFor(id: string): string[] {
  return wikiAliases[id] ?? [];
}
