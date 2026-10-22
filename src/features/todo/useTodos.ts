import { useCallback, useEffect, useRef, useState } from 'react';
import { categoryRepository, todoRepository, type Todo } from '../../data/database';
import { CategoryError, canonicalTime, DEFAULT_CATEGORY, type Category } from '../../data/categories';
import type { TaskDecoration } from './decorations';
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try { const rows = await todoRepository.all(); const groups=await categoryRepository.all(); if (alive.current) { setTodos(rows); setCategories(groups); setError(''); } }
    catch { if (alive.current) setError('暂时无法读取本地数据，请检查浏览器是否允许本地存储。'); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; }; }, [refresh]);
  const mutate = useCallback((action: () => Promise<unknown>) => {
    const result = queue.current.then(async () => {
      try { await action(); await refresh(); return true; }
      catch (error) { if (alive.current) setError(error instanceof CategoryError ? error.message : '保存失败，请重试。当前更改尚未保存。'); return false; }
    });
    queue.current = result.then(() => {});
    return result;
  }, [refresh]);
  return {
    todos, categories, loading, error,
    save: (text: string, date: string, id?: number, decoration?: TaskDecoration, favorite?: boolean, categoryId?:string, time?:string) => mutate(() => id === undefined
      ? todoRepository.add({ text, date, completed: false, createdAt: Date.now(), decoration, favorite: favorite ?? false,categoryId:categoryId??DEFAULT_CATEGORY,time })
      : todoRepository.update(id, { text, date, decoration, ...(favorite === undefined ? {} : {favorite}), ...(categoryId===undefined?{}:{categoryId}),...(time===undefined?{}:{time:canonicalTime(time)||undefined}) })),
    complete: (id: number, completed: boolean) => mutate(() => todoRepository.update(id, { completed })),
    remove: (id: number) => mutate(() => todoRepository.remove(id)),
    restore: (snapshot: Todo) => mutate(() => todoRepository.restore(snapshot)),
    saveCategory: (name:string,id?:string) => mutate(()=>categoryRepository.save(name,id)),
    removeCategory: (id:string) => mutate(()=>categoryRepository.remove(id)),
  };
}
