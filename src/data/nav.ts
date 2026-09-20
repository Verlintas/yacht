export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

export const navItems: NavItem[] = [
  { href: '/', label: '小窝', hint: '首页与仪表盘' },
  { href: '/berths/', label: '泊位', hint: '四处常驻点' },
];
