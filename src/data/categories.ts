export interface Category {
  id: string;
  name: string;
  key: string;
  builtin: boolean;
  createdAt: number;
}
export const DEFAULT_CATEGORY = 'life';
export const defaultCategories: Category[] = [
  {id:'work',name:'工作',key:'工作',builtin:true,createdAt:0},
  {id:'life',name:'生活',key:'生活',builtin:true,createdAt:1},
  {id:'study',name:'学习',key:'学习',builtin:true,createdAt:2},
];
export const categoryKey = (name:string) => name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export class CategoryError extends Error {}
export function cleanCategoryName(value:string): string {
  const name=value.trim().replace(/\s+/g,' ');
  if(!name || name.length>16) throw new CategoryError('分类名称请填写 1–16 个字。');
  if(categoryKey(name)==='全部') throw new CategoryError('“全部”用于查看所有分类，请换一个名字。');
  return name;
}
export function canonicalTime(value?: string): string {
  const match=typeof value==='string' ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if(!match || Number(match[1])>23 || Number(match[2])>59) return '';
  return `${match[1].padStart(2,'0')}:${match[2]}`;
}
