const yozaiRegular = new URL('../assets/fonts/yozai-v0.868/Yozai-Regular.woff2', import.meta.url).href;
const yozaiMedium = new URL('../assets/fonts/yozai-v0.868/Yozai-Medium.woff2', import.meta.url).href;
const xiaolaiRegular = new URL('../assets/fonts/xiaolai-v3.126/Xiaolai-Regular.woff2', import.meta.url).href;
const genSenRegular = new URL('../assets/fonts/gensen-rounded-v2.100/GenSenRounded2TW-Regular.woff2', import.meta.url).href;

export type FontId = 'yozai' | 'xiaolai' | 'gensen-rounded' | 'system';
type FontFaceSource = { url: string; weight: string };
export type FontOption = {
  id: FontId;
  name: string;
  family: string;
  familyStack: string;
  description: string;
  faces: FontFaceSource[];
};

export const FONT_PREFERENCE_KEY = 'cozy-days.font-family';
export const DEFAULT_FONT_ID: FontId = 'yozai';
export const fontRegistry: FontOption[] = [
  { id: 'yozai', name: '悠哉字体', family: 'Yozai', familyStack: '"Yozai", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif', description: '轻松柔和的手写感，新用户默认字体', faces: [{ url: yozaiRegular, weight: '400' }, { url: yozaiMedium, weight: '500' }] },
  { id: 'xiaolai', name: '小赖字体', family: 'Xiaolai', familyStack: '"Xiaolai", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif', description: '自然亲切的手写风格，简体中文比例版', faces: [{ url: xiaolaiRegular, weight: '400' }] },
  { id: 'gensen-rounded', name: '源泉圆体', family: 'GenSenRounded', familyStack: '"GenSenRounded", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif', description: '圆润清晰的黑体结构，官方 TW（月版）字形', faces: [{ url: genSenRegular, weight: '400' }] },
  { id: 'system', name: '系统默认字体', family: 'system-ui', familyStack: 'system-ui, sans-serif', description: '使用设备和浏览器提供的系统字体，不下载字体文件', faces: [] },
];

const loadedFonts = new Map<FontId, Promise<void>>();
export function getFontOption(id: FontId): FontOption {
  return fontRegistry.find(option => option.id === id) ?? fontRegistry[0];
}
export function getStoredFontId(): FontId {
  try {
    const id = localStorage.getItem(FONT_PREFERENCE_KEY);
    return fontRegistry.some(option => option.id === id) ? id as FontId : DEFAULT_FONT_ID;
  } catch {
    return DEFAULT_FONT_ID;
  }
}
export function applyFontStack(id: FontId) {
  document.documentElement.style.setProperty('--app-font-family', getFontOption(id).familyStack);
}
export function loadFont(id: FontId): Promise<void> {
  const option = getFontOption(id);
  if (!option.faces.length || loadedFonts.has(id)) return loadedFonts.get(id) ?? Promise.resolve();
  const pending = Promise.all(option.faces.map(async source => {
    const face = new FontFace(option.family, `url("${source.url}")`, { weight: source.weight, style: 'normal', display: 'swap' });
    await face.load();
    return face;
  })).then(faces => { faces.forEach(face => document.fonts.add(face)); });
  loadedFonts.set(id, pending);
  pending.catch(() => loadedFonts.delete(id));
  return pending;
}
