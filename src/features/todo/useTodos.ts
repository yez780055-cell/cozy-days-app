import { useCallback, useEffect, useRef, useState } from 'react';
import { categoryRepository, todoRepository, TodoConflictError, type Todo } from '../../data/database';
import { CategoryError, canonicalTime, DEFAULT_CATEGORY, type Category } from '../../data/categories';
import type { TaskDecoration } from './decorations';
import { cloudChanged } from '../../data/cloudTypes';
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Independent of refresh: an open form must retain its last save failure.
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try { const rows = await todoRepository.all(); const groups=await categoryRepository.all(); if (alive.current) { setTodos(rows); setCategories(groups); setError(''); } }
    catch { if (alive.current) setError('暂时无法读取本地数据，请检查浏览器是否允许本地存储。'); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const read = () => { void refresh(); };
    window.addEventListener(cloudChanged, read);
    return () => { alive.current = false; window.removeEventListener(cloudChanged, read); };
  }, [refresh]);
  const mutate = useCallback((action: () => Promise<unknown>) => {
    const result = queue.current.then(async () => {
      if (alive.current) { setSaveStatus('正在保存…'); setSaveError(''); }
      try { await action(); await refresh(); if (alive.current) setSaveStatus('已保存'); return true; }
      catch (error) {
        if (error instanceof TodoConflictError) await refresh();
        if (alive.current) {
          const message = error instanceof CategoryError || error instanceof TodoConflictError ? error.message : '保存失败，请重试。当前更改尚未保存。';
          setSaveStatus(''); setError(message); setSaveError(message);
        }
        return false;
      }
    });
    queue.current = result.then(() => {});
    return result;
  }, [refresh]);
  return {
    todos, categories, loading, error, saveError, saveStatus,
    save: (text: string, date: string, id?: number, decoration?: TaskDecoration, favorite?: boolean, categoryId?:string, time?:string, baseline?:Todo) => mutate(() => id === undefined
      ? todoRepository.add({ text, date, completed: false, createdAt: Date.now(), decoration, favorite: favorite ?? false,categoryId:categoryId??DEFAULT_CATEGORY,time })
      : todoRepository.update(id, { text, date, decoration, ...(favorite === undefined ? {} : {favorite}), ...(categoryId===undefined?{}:{categoryId}),...(time===undefined?{}:{time:canonicalTime(time)||undefined}) }, baseline)),
    complete: (id: number, completed: boolean, baseline?:Todo) => mutate(() => todoRepository.update(id, { completed }, baseline)),
    remove: (id: number, baseline?:Todo) => mutate(() => todoRepository.remove(id, baseline)),
    restore: (snapshot: Todo, onRestored?: (row: Todo) => void) => mutate(async () => {
      const row = await todoRepository.restore(snapshot);
      onRestored?.(structuredClone(row));
    }),
    saveCategory: (name:string,id?:string) => mutate(()=>categoryRepository.save(name,id)),
    removeCategory: (id:string, onReassigned?: (changes: { before: Todo; after: Todo }[]) => void) => mutate(async () => {
      const changes = await categoryRepository.remove(id);
      onReassigned?.(structuredClone(changes));
    }),
  };
}
