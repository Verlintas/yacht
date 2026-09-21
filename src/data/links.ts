export interface QuickLink {
  title: string;
  url: string;
  note?: string;
  /** 站内路径（以 / 开头），渲染时不加 target 与新窗口图标 */
  internal?: boolean;
}

export interface LinkGroup {
  group: string;
  hint?: string;
  links: QuickLink[];
}

export const linkGroups: LinkGroup[] = [
  {
    group: '我的站点',
    hint: '自己搭的',
    links: [
      { title: '主站', url: 'https://verlintas.github.io', note: '对外展示的主页' },
      { title: '小窝', url: '/', note: '本站 · 私人港口', internal: true },
      { title: 'USV', url: 'https://usv.mysxl.cn', note: 'United Science Vaca' },
      { title: 'USV Elec Center', url: 'https://elecusv.mysxl.cn', note: '电子中心' },
      { title: 'NUSV 官网', url: 'https://nusv.github.io', note: '开源组织 · 项目与文档' },
      { title: 'NUSV', url: 'https://nusv.mysxl.cn', note: '组织介绍' },
    ],
  },
  {
    group: '常用',
    hint: '每天都会开',
    links: [
      { title: 'GitHub', url: 'https://github.com/Verlintas', note: '@Verlintas' },
      { title: 'X', url: 'https://x.com/Verlintas', note: '@Verlintas' },
      { title: 'Gmail', url: 'https://mail.google.com', note: '邮箱' },
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
