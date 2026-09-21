export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

export const navItems: NavItem[] = [
  { href: '/', label: '小窝', hint: '首页与仪表盘' },
  { href: '/berths/', label: '泊位', hint: '四处常驻点' },
  { href: '/links/', label: '港口', hint: '常用入口' },
  { href: '/notes/', label: '日志', hint: '笔记与收藏' },
  { href: '/projects/', label: '船坞', hint: '项目清单' },
  { href: '/wiki/', label: '百科', hint: '资料索引' },
];
