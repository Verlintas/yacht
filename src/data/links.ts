export interface QuickLink {
  title: string;
  url: string;
  note?: string;
}

export interface LinkGroup {
  group: string;
  hint?: string;
  links: QuickLink[];
}

export const linkGroups: LinkGroup[] = [
  {
    group: '常用',
    hint: '每天都会开',
    links: [
      { title: 'GitHub', url: 'https://github.com', note: '代码与仓库' },
      { title: 'Gmail', url: 'https://mail.google.com', note: '邮箱' },
      { title: 'Google 日历', url: 'https://calendar.google.com', note: '日程' },
      { title: 'Google Drive', url: 'https://drive.google.com', note: '文件' },
    ],
  },
  {
    group: '开发',
    hint: '查文档用',
    links: [
      { title: 'Astro 文档', url: 'https://docs.astro.build', note: '本站的框架' },
      { title: 'MDN', url: 'https://developer.mozilla.org', note: 'Web 参考' },
      { title: 'Open-Meteo 文档', url: 'https://open-meteo.com/en/docs', note: '天气数据源' },
      { title: 'GitHub Actions', url: 'https://github.com/Verlintas/yacht/actions', note: '本站部署日志' },
    ],
  },
  {
    group: '跨性别资源',
    hint: '外部资料库',
    links: [
      { title: 'MtF.wiki', url: 'https://mtf.wiki', note: '医疗与证件资料整合站' },
      { title: 'Project Trans', url: 'https://project-trans.org', note: 'MtF.wiki 的维护组织' },
    ],
  },
  {
    group: '自建服务',
    hint: '以后往里填',
    links: [],
  },
];
