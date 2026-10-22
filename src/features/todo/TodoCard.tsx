import { useEffect, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Todo } from '../../data/database';
import { Checkbox } from '../../components/Checkbox';
import { Asset } from '../../components/Asset';
import { animateElement, motion } from '../../styles/motion';
import { formatDate } from './dates';
import { decorationIdentity, resolveDecoration } from './decorations';
export function TodoCard({ todo, showDate, onToggle, onEdit, onDelete }: {
  todo: Todo; showDate?: boolean; onToggle: (todo: Todo) => Promise<void> | void;
  onEdit: (todo: Todo) => void; onDelete: (todo: Todo) => void;
}) {
  const element = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
  useEffect(() => { animateElement(element.current, [{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'translateY(0)' }]); }, []);
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    if (!todo.completed) {
      element.current?.classList.add('is-completing');
      const animation = animateElement(element.current, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96) translateX(10px)' }], motion.list);
      if (animation) await animation.finished.catch(() => {});
    }
    await onToggle(todo);
    element.current?.classList.remove('is-completing');
    busy.current = false;
  };
  return <article ref={element} className={`task-card ${todo.completed ? 'task-card--done' : ''}`} data-testid="todo-card"
    data-theme={decoration.theme} data-layout={decoration.seed % 3} data-seed={decoration.seed}>
    <Checkbox checked={todo.completed} label={`${todo.completed ? '恢复' : '完成'}：${todo.text}`} onChange={() => void toggle()}/>
    <button className="task-content" aria-label={`编辑：${todo.text}`} onClick={() => onEdit(todo)}>
      <span>{todo.text}</span>{showDate && <small>{formatDate(todo.date)}</small>}
    </button><div className="task-art" aria-hidden="true" data-illustration={decoration.illustrationId} data-sticker={decoration.stickerId}>
      <Asset name={decoration.illustrationId} className="task-illustration"/><Asset name={decoration.stickerId} className="task-sticker"/>
    </div><div className="task-actions"><button className="icon-button" aria-label={`修改：${todo.text}`} onClick={() => onEdit(todo)}><Pencil size={16}/></button>
      <button className="icon-button" aria-label={`删除：${todo.text}`} onClick={() => onDelete(todo)}><Trash2 size={16}/></button></div>
  </article>;
}

