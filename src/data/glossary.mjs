/**
 * 术语 → 站内条目。正文里首次出现的术语会自动加上链接。
 *
 * 放在 .mjs 里是为了让 astro.config.mjs（构建期 rehype 插件）和
 * src/data/wiki.ts（页面渲染）共用同一份数据，避免两处维护。
 *
 * 注意：只放「不会误伤」的词。像「扩张」这种日常词不要放进来。
 */
export const wikiGlossaryLinks = {
  孕酮: 'progesterone',
  黄体酮: 'progesterone',
  醋酸环丙孕酮: 'antiandrogen-compare',
  螺内酯: 'antiandrogen-compare',
  比卡鲁胺: 'antiandrogen-compare',
  戊酸雌二醇: 'estrogen-compare',
  青春期阻断剂: 'puberty-blockers',
  血栓: 'thrombosis-risk',
  泌乳素: 'prolactin',
  骨密度: 'bone-density',
  肝功能: 'liver-function',
  性别不安: 'gender-dysphoria',
  诊断证明: 'diagnosis-letter',
  介绍信: 'diagnosis-letter',
  公证: 'notarization',
  户籍: 'household-register',
  出柜: 'coming-out',
  进食障碍: 'eating-disorders',
  神经多样性: 'neurodiversity',
  束胸: 'chest-shape',
  义乳: 'chest-shape',
  嗓音训练: 'voice-training',
  面部女性化手术: 'ffs-overview',
  乳房增大手术: 'breast-augmentation',
  更衣室: 'changing-rooms',
};

/** 按长度倒序，保证长词优先匹配（例如「醋酸环丙孕酮」先于「孕酮」）。 */
export const glossaryTerms = Object.entries(wikiGlossaryLinks)
  .map(([term, slug]) => ({ term, slug }))
  .sort((a, b) => b.term.length - a.term.length);
