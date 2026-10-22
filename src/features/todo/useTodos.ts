import { useCallback, useEffect, useState } from 'react';
import { todoRepository, type Todo } from '../../data/database';
import type { TaskDecoration } from './decorations';
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setTodos(await todoRepository.all()); setError(''); }
    catch { setError('暂时无法读取本地数据，请检查浏览器是否允许本地存储。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = useCallback(async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); return true; }
    catch { setError('保存失败，请重试。当前更改尚未保存。'); return false; }
  }, [refresh]);
  return {
    todos, loading, error,
    save: (text: string, date: string, id?: number, decoration?: TaskDecoration) => mutate(() => id === undefined
      ? todoRepository.add({ text, date, completed: false, createdAt: Date.now(), decoration })
      : todoRepository.update(id, { text, date, decoration })),
    complete: (id: number, completed: boolean) => mutate(() => todoRepository.update(id, { completed })),
    remove: (id: number) => mutate(() => todoRepository.remove(id)),
  };
}

