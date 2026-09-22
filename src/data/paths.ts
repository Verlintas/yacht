/**
 * 阅读路径：按「你现在的处境」编排的阅读顺序。
 *
 * 分类和标签解决的是「有什么」，路径解决的是「先看哪个」——
 * 后者对 12 万字的百科更重要。每条路径都给出「为什么读这篇」。
 */
export interface WikiPathStep {
  /** 百科条目 id */
  id: string;
  /** 为什么在这一步读它 */
  why: string;
}

export interface WikiPath {
  slug: string;
  title: string;
  latin: string;
  audience: string;
  intro: string;
  steps: WikiPathStep[];
}

export const wikiPaths: WikiPath[] = [
  {
    slug: 'just-turned-16',
    title: '刚满 16 岁：接下来 90 天',
    latin: 'Just turned 16',
    audience: '已满 16 周岁、家里可能不完全支持、想弄清接下来能做什么',
    intro:
      '16 岁是很多门槛的分界线，但不是所有门都同时打开。这条路径按「先弄清规则 → 再决定要不要走 → 最后准备材料」的顺序排。不用一次做完，也不用今天就决定任何医疗事项。',
    steps: [
      { id: 'age-thresholds', why: '先看清 16 岁与 18 岁分别卡住什么，哪些事现在能做、哪些必须等' },
      { id: 'start-here', why: '整条路径的全貌，避免只盯着眼前一步' },
      { id: 'full-path-map', why: '把医疗、证件、生活三条线放在一张图里看' },
      { id: 'gender-dysphoria', why: '分清「不舒服」具体是什么，才好判断要不要就医' },
      { id: 'psych-first-visit', why: '如果决定就医，第一步是精神科而不是内分泌科' },
      { id: 'clinic-prep', why: '异地就医时怎么一次把事办完，少跑几趟' },
      { id: 'cost-timeline', why: '钱和时间要提前算，不然中途会卡住' },
      { id: 'records-management', why: '材料从第一天就要归档，后面每一步都要用' },
      { id: 'family-reactions', why: '家里不支持是最常见的阻碍，先想好怎么处理' },
      { id: 'safety-privacy', why: '在小地方或学校里，隐私往往比医疗更紧急' },
    ],
  },
  {
    slug: 'still-unsure',
    title: '还不确定：先不做任何决定',
    latin: 'Not sure yet',
    audience: '不确定自己是不是跨性别，或者不确定要不要做任何改变',
    intro:
      '这条路径不催你做任何决定，也不要求你「证明」什么。目标是帮你把模糊的感受拆成能想清楚的问题。读完不一定要有结论。',
    steps: [
      { id: 'sex-vs-gender', why: '先把认同、表达、指派性别三件事分开，很多纠结来自混在一起' },
      { id: 'gender-dysphoria', why: '了解常见的具体表现，看看哪些对得上、哪些对不上' },
      { id: 'myths', why: '先拆掉几个流传很广的错误标准（比如「从小就知道」）' },
      { id: 'self-test-scales', why: '自测量表能做什么、不能做什么，避免被分数绑架' },
      { id: 'nonbinary', why: '如果你既不是「男」也不是「女」，这里说明为什么这同样成立' },
      { id: 'timeline-expectations', why: '不同人的节奏差别有多大，不必和别人比' },
      { id: 'finding-counselor', why: '找一个能一起梳理的人，比自己想更快' },
      { id: 'icd11-depathologization', why: '「这是不是病」——诊断体系本身怎么说的' },
      { id: 'community', why: '听听别人的经历，但记得那只是别人的' },
    ],
  },
  {
    slug: 'family-conflict',
    title: '家人反对时',
    latin: 'Family conflict',
    audience: '家里已经知道或可能知道，且态度不支持',
    intro:
      '这一条路径的排序原则是「安全优先」：先保证基本生活和人身安全，再考虑沟通，最后才谈医疗。有些步骤现在做不了，可以先跳过。',
    steps: [
      { id: 'family-reactions', why: '先了解常见的反应模式，知道哪些是可以预期的' },
      { id: 'safety-privacy', why: '设备、账号、材料的隐私，这是最紧急的一层' },
      { id: 'coming-out-scripts', why: '如果你还没说、或者要再谈一次，这里有可用的说法' },
      { id: 'emotion-management', why: '冲突期的情绪会很难，先有应对工具' },
      { id: 'for-family-friends', why: '给家人看的材料——比你反复解释更有效' },
      { id: 'crisis-resources', why: '情绪撑不住时去哪，先存下来备用' },
      { id: 'cost-timeline', why: '如果经济依赖家里，需要单独算这笔账' },
      { id: 'student-earning', why: '经济独立是一个过程，可以从现在开始准备' },
      { id: 'small-city', why: '小地方的隐私与资源问题，有单独的处理方式' },
    ],
  },
  {
    slug: 'first-months-hrt',
    title: '开始用药的头 6 个月',
    latin: 'First months on HRT',
    audience: '已经拿到处方、刚开始用药，或即将开始',
    intro:
      '这条路径按「先知道自己在吃什么 → 再建立监测习惯 → 然后理解会有什么变化」的顺序排。监测是唯一能提前发现问题的环节，优先级最高。',
    steps: [
      { id: 'medication-index', why: '先弄清自己手上这几盒药分别是什么、属于哪一类' },
      { id: 'medication-doses', why: '剂量与来源对照，就诊时能听懂医生在说什么' },
      { id: 'progesterone', why: '如果药盒上有「孕酮／孕激素」，先分清是哪种' },
      { id: 'monitoring-index', why: '复查频次与项目：第一年通常每三个月' },
      { id: 'health-checkup', why: '基线检查为什么重要，缺了它后面没法对比' },
      { id: 'hrt-log', why: '把用药与检查记录建起来，换医院时全靠它' },
      { id: 'hormone-panel', why: '看懂化验单，以及采血时间点为什么关键' },
      { id: 'hrt-effects', why: '什么会变、什么不会变、时间尺度有多长' },
      { id: 'missed-dose', why: '漏服、停药怎么处理，不要自己加倍' },
      { id: 'thrombosis-risk', why: '血栓相对风险率怎么读，什么症状要立刻就医' },
      { id: 'self-injection', why: '如果用注射，先看卫生原则与安全边界' },
      { id: 'emergency-medical-info', why: '写一张卡片放钱包——关键时刻医生需要知道' },
    ],
  },
  {
    slug: 'documents-order',
    title: '改证件：顺序比材料重要',
    latin: 'Documents order',
    audience: '准备开始变更实名信息',
    intro:
      '这一串事项有依赖关系：先办哪个决定后面顺不顺。这条路径按实际依赖顺序排，每一步都说明为什么不能颠倒。',
    steps: [
      { id: 'real-name-overview', why: '全局顺序图，先看这张再动手' },
      { id: 'age-thresholds', why: '未成年办证件的额外要求与家长环节' },
      { id: 'household-register', why: '户籍是根，多数变更都从它开始' },
      { id: 'id-card-change', why: '身份证跟着户籍走，是后面所有事的基础' },
      { id: 'name-change', why: '改名的流程、次数限制与曾用名问题' },
      { id: 'choosing-name', why: '取名前先做系统兼容性测试，免得银行机票录不进去' },
      { id: 'id-photos', why: '证件照会跟你很多年，值得认真准备' },
      { id: 'education-records', why: '学籍学历改不了的部分，用证明补' },
      { id: 'healthcare-insurance', why: '医保社保的信息同步，漏了会影响报销' },
      { id: 'insurance-claims', why: '商业保险的如实告知问题，这个要提前想' },
      { id: 'travel-documents', why: '护照通行证最后办，因为它们依赖前面的证件' },
      { id: 'records-management', why: '全套材料要留档，以后每次办事都用得上' },
    ],
  },
  {
    slug: 'surgery-decision',
    title: '要不要做手术：决策路径',
    latin: 'Surgery decision',
    audience: '在考虑手术，但还没决定，或者不知道该先想什么',
    intro:
      '这条路径不从「怎么做」开始，而从「要不要做」开始。没有任何一项手术是必须做的，也没有「做完才算完整」这回事。',
    steps: [
      { id: 'surgery-overview', why: '先看有哪几类手术、分别解决什么问题' },
      { id: 'surgery-evaluation', why: '评估自己到底想要什么，而不是别人做了什么' },
      { id: 'age-thresholds', why: '法规对年龄、婚育、材料的要求（含 18 岁门槛）' },
      { id: 'cost-timeline', why: '费用与时间，包括恢复期无法工作学习的成本' },
      { id: 'notarization', why: '部分医院要求的公证是什么、怎么办' },
      { id: 'surgery-prep', why: '材料链、术前停药、要问清的问题' },
      { id: 'surgery-recovery', why: '恢复期的分阶段节奏与心理准备' },
      { id: 'fertility', why: '如果还想要孩子，这件事必须在术前处理' },
      { id: 'vocal-surgery', why: '嗓音手术的适用条件，以及全麻插管的风险提示' },
      { id: 'ffs-overview', why: '面部手术的类别与可逆性，别把它当成必选项' },
    ],
  },
  {
    slug: 'appearance-without-medical',
    title: '外观：不依赖医疗的那部分',
    latin: 'Appearance',
    audience: '还没开始或无法开始医疗，但想改善外观',
    intro:
      '这条路径上的所有事都不需要处方、不需要家长签字、不需要花钱做手术。顺序按「见效快慢」排：体态和声音见效最快，化妆和穿搭可以慢慢练。',
    steps: [
      { id: 'posture-mannerisms', why: '影响别人怎么读你，零成本、完全可逆、今天就能开始' },
      { id: 'voice-training', why: '声音是电话里唯一被感知的特征，可练' },
      { id: 'voice-practice', why: '具体的练习结构与常见错误' },
      { id: 'clothing-style', why: '用剪裁改变视觉比例，从一件下装开始' },
      { id: 'chest-shape', why: '内衣、义乳与束胸——束胸有明确安全边界，务必看' },
      { id: 'makeup-basics', why: '胡青遮盖与底妆，新手三件就够' },
      { id: 'hair-removal', why: '体毛与胡须的长期方案' },
      { id: 'hair-loss', why: '发际线与脱发，越早处理空间越大' },
      { id: 'body-shape', why: '体脂分布与体重，以及怎么和身体相处' },
      { id: 'skincare-advanced', why: '皮肤是妆容的基础' },
    ],
  },
  {
    slug: 'school-survival',
    title: '在学校里',
    latin: 'At school',
    audience: '在校学生，需要处理日常的校园场景',
    intro:
      '校园的特点是「无法回避」：每天都要去，同学和老师是固定的。这条路径按「从最急到最不急」排。',
    steps: [
      { id: 'changing-rooms', why: '体育课、泳池、公共浴室——最高频的困难场景' },
      { id: 'dorm-sports', why: '住宿与体育课的具体安排' },
      { id: 'campus', why: '校园里的资源与可能的支持' },
      { id: 'safety-privacy', why: '同学之间的信息传播，比老师更难控制' },
      { id: 'hr-communication', why: '如果决定和老师或校方沟通，怎么开口' },
      { id: 'leave-exam', why: '就医怎么请假、考试怎么安排' },
      { id: 'education-records', why: '学籍信息与证件不一致时怎么办' },
      { id: 'anxiety-depression', why: '校园压力下的情绪问题，值得单独处理' },
      { id: 'community', why: '找到同伴，孤立感会明显减轻' },
    ],
  },
  {
    slug: 'when-things-go-wrong',
    title: '遇到麻烦时',
    latin: 'When things go wrong',
    audience: '已经被拒诊、被歧视、被泄露，或者权益受损',
    intro:
      '这条路径按「先止损 → 再留证据 → 然后走渠道」排。遇到具体问题时，从第一步开始，不要跳到最后一步去理论。',
    steps: [
      { id: 'crisis-resources', why: '如果现在情绪撑不住，先看这个' },
      { id: 'psych-rejection', why: '被精神科拒诊是最常见的第一个坎，先了解为什么' },
      { id: 'appeal-path', why: '被拒绝之后的正式渠道有哪些、怎么走' },
      { id: 'medical-dispute', why: '和医疗机构发生纠纷时的处理顺序' },
      { id: 'privacy-law', why: '信息被泄露：先固定证据，再要求删除' },
      { id: 'online-harassment', why: '网暴与人肉的具体应对' },
      { id: 'employment-discrimination', why: '职场歧视的取证与维权' },
      { id: 'scam-awareness', why: '这一群体是诈骗的重点目标，先认清套路' },
      { id: 'legal-faq-index', why: '法律问题的集中入口，按情形查' },
      { id: 'info-literacy', why: '判断信息真伪，避免被二手说法带偏' },
    ],
  },
  {
    slug: 'support-someone',
    title: '如果你的家人或朋友是跨性别',
    latin: 'Supporting someone',
    audience: '想支持身边的人，但不知道怎么做',
    intro:
      '这条路径按「先改自己的行为 → 再理解对方在经历什么 → 最后才谈怎么帮忙」排。第一条建议是：不要急着提建议。',
    steps: [
      { id: 'for-family-friends', why: '写给支持者的第一份材料，从这一篇开始' },
      { id: 'sex-vs-gender', why: '先把几个概念分清，很多争论来自定义不同' },
      { id: 'myths', why: '拆掉那些听起来合理但错误的说法' },
      { id: 'family-reactions', why: '理解对方为什么可能在冲突中退回到沉默' },
      { id: 'gender-dysphoria', why: '了解性别不安的具体表现，才知道对方在承受什么' },
      { id: 'emotion-management', why: '你自己的情绪也需要照顾' },
      { id: 'age-thresholds', why: '如果对方是未成年，家长签字这一环绕不开' },
      { id: 'crisis-resources', why: '什么信号说明需要立刻求助' },
      { id: 'reading-list', why: '想继续了解时的延伸阅读' },
    ],
  },
];

export function getPath(slug: string): WikiPath | undefined {
  return wikiPaths.find((path) => path.slug === slug);
}
