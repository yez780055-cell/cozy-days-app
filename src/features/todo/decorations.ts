import type { AssetName } from '../../assets/manifest';

export const cardThemes = { cream: '奶油', rose: '蜜桃粉', lavender: '浅薰衣草', sage: '嫩芽绿' } as const;
export type CardTheme = keyof typeof cardThemes;
export const stickerOptions = [
  { id: 'flower', label: '粉色小花' }, { id: 'cherries', label: '樱桃' },
  { id: 'heart', label: '粉色爱心' },
] as const satisfies readonly { id: AssetName; label: string }[];
export type StickerId = typeof stickerOptions[number]['id'];

// Explicit precedence resolves ties; English words use boundaries (work ≠ homework).
export const illustrationRules = [
  { id: 'taskBook', category: '阅读', keywords: ['阅读', '看书', '读书', '读绘本', '小说', 'read', 'reading', 'book'], patterns: [/看[^，。！？\n]{0,12}书/u, /读[^，。！？\n]{0,12}书/u] },
  { id: 'taskStretch', category: '运动', keywords: ['运动', '拉伸', '伸展', '跑步', '散步', '健身', '瑜伽', '游泳', '骑行', '锻炼', 'workout', 'exercise', 'yoga', 'run', 'running'] },
  { id: 'home', category: '家务', keywords: ['家务', '整理', '打扫', '清洁', '洗衣', '洗碗', '做饭', '浇花', '收拾', 'clean', 'cleaning', 'laundry', 'cook', 'cooking'] },
  { id: 'study', category: '学习', keywords: ['学习', '复习', '作业', '背单词', '课程', '考试', '练习', '笔记', 'study', 'studying', 'homework', 'lesson', 'exam'] },
  { id: 'work', category: '工作', keywords: ['工作', '会议', '设计', '报告', '项目', '邮件', '开会', '办公', '代码', 'work', 'meeting', 'project', 'email', 'coding'] },
] as const satisfies readonly { id: AssetName; category: string; keywords: readonly string[]; patterns?: readonly RegExp[] }[];
const fallbackIllustrations = ['flower', 'cherries', 'heart'] as const;
export type IllustrationId = typeof illustrationRules[number]['id'] | typeof fallbackIllustrations[number];
export interface TaskDecoration {
  version: 1;
  illustrationId: IllustrationId;
  stickerId: StickerId;
  theme: CardTheme;
  seed: number;
}

export function stableSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
export function createSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]; }
const pick = <T,>(values: readonly T[], seed: number, salt: string): T => values[stableSeed(`${seed}:${salt}`) % values.length];
export function matchIllustration(text: string, seed: number): IllustrationId {
  const normalized = text.normalize('NFKC').toLowerCase();
  let best: IllustrationId | undefined;
  let bestScore = 0;
  for (const rule of illustrationRules) {
    const score = rule.keywords.filter(word => /^[a-z]+$/.test(word)
      ? new RegExp(`\\b${word}\\b`, 'i').test(normalized) : normalized.includes(word)).length
      + ('patterns' in rule && rule.patterns.some(pattern=>pattern.test(normalized)) ? 1 : 0);
    if (score > bestScore) { best = rule.id; bestScore = score; }
  }
  return best ?? pick(fallbackIllustrations, seed, 'illustration');
}
/** Accept unknown persisted input: missing, partial and obsolete IDs all get repaired. */
export function resolveDecoration(text: string, input?: unknown, identity = text): TaskDecoration {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const seed = typeof value.seed === 'number' && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff
    ? value.seed : stableSeed(identity);
  const illustrationIds: readonly string[] = [...illustrationRules.map(rule=>rule.id), ...fallbackIllustrations];
  return {
    version: 1, seed,
    illustrationId: typeof value.illustrationId === 'string' && illustrationIds.includes(value.illustrationId)
      ? value.illustrationId as IllustrationId : matchIllustration(text, seed),
    stickerId: stickerOptions.some(option=>option.id===value.stickerId) ? value.stickerId as StickerId
      : pick(stickerOptions.map(option=>option.id), seed, 'sticker'),
    theme: typeof value.theme === 'string' && Object.prototype.hasOwnProperty.call(cardThemes, value.theme) ? value.theme as CardTheme
      : pick(Object.keys(cardThemes) as CardTheme[], seed, 'theme'),
  };
}
export function reviseDecoration(text: string, input: unknown, identity?: string): TaskDecoration {
  const decoration = resolveDecoration(text, input, identity);
  return { ...decoration, illustrationId: matchIllustration(text, decoration.seed) };
}
export const decorationIdentity = (todo: {id?: number; createdAt: number; text: string}) => `${todo.id ?? 'new'}:${todo.createdAt}:${todo.text}`;
