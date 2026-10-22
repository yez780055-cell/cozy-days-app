import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Ellipsis, RotateCcw, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Todo } from '../../data/database';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { motion, reducedMotion } from '../../styles/motion';
import { formatDate } from './dates';
import { decorationIdentity, resolveDecoration } from './decorations';
import { canonicalTime } from '../../data/categories';

const REVEAL = 80;
const OPEN_EVENT = 'cozy-card-open';
export function TodoCard({ todo, showDate, onToggle, onEdit, onDelete }: {
  todo: Todo; showDate?: boolean; onToggle: (todo: Todo) => Promise<boolean>;
  onEdit: (todo: Todo) => void; onDelete: (todo: Todo) => Promise<boolean>;
}) {
  const shell = useRef<HTMLDivElement>(null), surface = useRef<HTMLElement>(null);
  const leftAction = useRef<HTMLButtonElement>(null), rightAction = useRef<HTMLButtonElement>(null);
  const busy = useRef(false), alive = useRef(true), offset = useRef(0);
  const suppressClickUntil = useRef(0);
  const animations = useRef(new Set<Animation>());
  const gesture = useRef<{id:number; x:number; y:number; base:number; axis:'pending'|'x'|'y'} | null>(null);
  const [menu, setMenu] = useState(false);
  const decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
  function paint(x: number, settle = false) {
    offset.current = x;
    if (!surface.current || !shell.current) return;
    surface.current.style.transition = settle && !reducedMotion() ? 'transform 300ms ease-out' : 'none';
    surface.current.style.transform = `translate3d(${x}px,0,0)`;
    shell.current.dataset.offset = String(x);
    shell.current.dataset.phase = settle ? (x ? 'snapped' : 'idle') : 'dragging';
    shell.current.style.setProperty('--delete-reveal', String(x < 0 ? Math.min(1, -x / 16) : 0));
    shell.current.style.setProperty('--complete-reveal', String(x > 0 ? Math.min(1, x / 16) : 0));
    if (leftAction.current) leftAction.current.disabled = x <= 0 || busy.current;
    if (rightAction.current) rightAction.current.disabled = x >= 0 || busy.current;
  }
  useEffect(() => {
    alive.current = true;
    paint(0);
    const closeOther = (event: Event) => {
      if ((event as CustomEvent).detail !== todo.id && !busy.current) { gesture.current = null; paint(0,true); }
    };
    const closeOnScroll = () => { if (!busy.current && gesture.current?.axis !== 'x') paint(0,true); };
    window.addEventListener(OPEN_EVENT,closeOther);
    const list = shell.current?.closest('.task-area');
    list?.addEventListener('scroll',closeOnScroll,{passive:true});
    return () => {
      alive.current = false; gesture.current = null;
      window.removeEventListener(OPEN_EVENT,closeOther); list?.removeEventListener('scroll',closeOnScroll);
      animations.current.forEach(animation=>animation.cancel()); animations.current.clear();
    };
  },[todo.id]);
  async function animate(element: HTMLElement, frames: Keyframe[]) {
    if (reducedMotion()) return true;
    const animation = element.animate(frames,{duration:motion.swipe,easing:'ease-out',fill:'forwards'});
    animations.current.add(animation);
    try { await animation.finished; return true; } catch { return false; }
    finally { animations.current.delete(animation); }
  }
  async function perform(kind: 'delete'|'toggle') {
    if (busy.current || !shell.current || !surface.current) return;
    busy.current = true; gesture.current = null; setMenu(false);
    suppressClickUntil.current = performance.now()+600;
    const wrapper=shell.current, card=surface.current;
    const direction=kind==='delete' ? -1 : 1;
    const height=wrapper.getBoundingClientRect().height, width=card.getBoundingClientRect().width;
    wrapper.dataset.phase='exiting'; card.style.transition='none';
    const finished = await Promise.all([
      animate(card,[{transform:`translateX(${offset.current}px)`,opacity:1},{transform:`translateX(${direction*width*1.2}px)`,opacity:0}]),
      animate(wrapper,[{height:`${height}px`,paddingBottom:getComputedStyle(wrapper).paddingBottom,opacity:1},{height:'0px',paddingBottom:'0px',opacity:0}]),
    ]);
    if (!alive.current || finished.some(value=>!value)) return;
    // Persist only after the card has slid out and the list has closed the gap.
    const success=await (kind==='delete' ? onDelete(todo) : onToggle(todo));
    if (alive.current) {
      // A failed write returns the card to its original state; no undo is offered.
      if (!success) {
        wrapper.getAnimations().forEach(a=>a.cancel()); card.getAnimations().forEach(a=>a.cancel());
        busy.current=false; wrapper.style.height=''; wrapper.style.paddingBottom=''; paint(0,true);
      }
    }
  }
  function down(event: ReactPointerEvent<HTMLElement>) {
    if (busy.current || event.button!==0 || !event.isPrimary || (event.target as HTMLElement).closest('.card-more')) return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT,{detail:todo.id}));
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,base:offset.current,axis:'pending'};
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    const drag=gesture.current;
    if (!drag || drag.id!==event.pointerId || busy.current) return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if (drag.axis==='pending') {
      if (Math.max(Math.abs(dx),Math.abs(dy))<8) return;
      if (Math.abs(dy)>Math.abs(dx)*1.15) { drag.axis='y'; paint(0,true); return; }
      if (Math.abs(dx)<=Math.abs(dy)*1.15) return;
      drag.axis='x'; event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (drag.axis!=='x') return;
    if (event.cancelable) event.preventDefault();
    suppressClickUntil.current=performance.now()+400;
    const width=event.currentTarget.getBoundingClientRect().width;
    paint(Math.max(-width,Math.min(width,drag.base+dx)));
  }
  function up(event: ReactPointerEvent<HTMLElement>) {
    const drag=gesture.current;
    if (!drag || drag.id!==event.pointerId) return;
    gesture.current=null;
    if (drag.axis!=='x') return;
    suppressClickUntil.current=performance.now()+400;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const x=offset.current,width=event.currentTarget.getBoundingClientRect().width;
    if (Math.abs(x)>width*.5) void perform(x<0?'delete':'toggle');
    else paint(Math.abs(x)>=REVEAL ? Math.sign(x)*REVEAL : 0,true);
  }
  return <div ref={shell} className="swipe-shell" data-offset="0" data-phase="idle">
    <div className="swipe-rail swipe-rail--complete"><button ref={leftAction} type="button" className="swipe-action" tabIndex={-1}
      aria-label={`${todo.completed?'滑动恢复':'滑动完成'}：${todo.text}`} onClick={()=>void perform('toggle')}>
      {todo.completed ? <RotateCcw size={22}/> : <Check size={24}/>}<span>{todo.completed?'恢复':'完成'}</span></button></div>
    <div className="swipe-rail swipe-rail--delete"><button ref={rightAction} type="button" className="swipe-action" tabIndex={-1}
      aria-label={`滑动删除：${todo.text}`} onClick={()=>void perform('delete')}><Trash2 size={22}/><span>删除</span></button></div>
    <article ref={surface} className={`task-card ${todo.completed?'task-card--done':''}`} data-testid="todo-card"
      data-theme={decoration.theme} data-layout={decoration.seed%3} data-seed={decoration.seed}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={()=>{gesture.current=null; if(!busy.current) paint(0,true);}}
      onClickCapture={event=>{if(performance.now()<suppressClickUntil.current){event.preventDefault();event.stopPropagation();}}}>
      <button className="task-content" aria-label={`编辑：${todo.text}`} onClick={()=>{paint(0,true);onEdit(todo);}}>
        <span>{todo.text}</span>{(showDate || canonicalTime(todo.time)) && <small className="task-meta">{showDate&&<span>{formatDate(todo.date)}</span>}{canonicalTime(todo.time)&&<time dateTime={`${todo.date}T${canonicalTime(todo.time)}`}>{canonicalTime(todo.time)}</time>}</small>}
      </button>
      <div className="task-art" aria-hidden="true" data-illustration={decoration.illustrationId} data-sticker={decoration.stickerId}>
        <Asset name={decoration.illustrationId} className="task-illustration"/><Asset name={decoration.stickerId} className="task-sticker"/>
      </div>
      {todo.favorite===true && <Asset name="star" className="task-favorite"/>}
      <div className="task-actions"><button type="button" className="icon-button card-more" aria-label={`更多操作：${todo.text}`}
        onClick={()=>{window.dispatchEvent(new CustomEvent(OPEN_EVENT,{detail:null}));setMenu(true);}}><Ellipsis size={20}/></button></div>
    </article>
    {menu && createPortal(<Modal title="这件小事" onClose={()=>setMenu(false)}>
      <p className="card-menu-copy">左滑删除，右滑{todo.completed?'恢复':'完成'}。也可以在这里轻点操作。</p>
      <div className="card-menu-actions">
        <Button variant="soft" onClick={()=>{setMenu(false);onEdit(todo);}}>编辑待办与收藏</Button>
        <Button aria-label={`${todo.completed?'恢复':'完成'}：${todo.text}`} onClick={()=>void perform('toggle')}>{todo.completed?'恢复未完成':'完成这件小事'}</Button>
        <Button variant="danger" aria-label={`删除：${todo.text}`} onClick={()=>void perform('delete')}>删除这件小事</Button>
      </div>
    </Modal>,shell.current?.closest('.phone') ?? document.body)}
  </div>;
}
