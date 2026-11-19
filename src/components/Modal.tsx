import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { animateElement, motion } from '../styles/motion';

export function Modal({ title, onClose, children, className = '', headerAction, canClose, dirty = false }: {
  title: string; onClose: () => void; children: ReactNode; className?: string; headerAction?: ReactNode; canClose?: () => boolean; dirty?: boolean;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const warning = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirmClose) warning.current?.focus(); }, [confirmClose]);
  const panel = useRef<HTMLElement>(null);
  const closing = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const close = useCallback(async () => {
    if (closing.current || canCloseRef.current?.() === false) return;
    if (dirtyRef.current) { setConfirmClose(true); return; }
    closing.current = true;
    const animation = animateElement(panel.current, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(32px)' }], motion.modal);
    if (animation) await animation.finished.catch(() => {});
    if (canCloseRef.current?.() === false) {
      closing.current = false;
      return;
    }
    closeRef.current();
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current!;
    animateElement(element, [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'translateY(0)' }], motion.modal);
    const timer = window.setTimeout(() => {
      const input = element.querySelector<HTMLElement>('[data-autofocus]');
      (input ?? element.querySelector<HTMLElement>('button'))?.focus();
    }, motion.modal);
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void close(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handleKeys); previous?.focus(); };
  }, [close]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) void close(); }}>
    <section ref={panel} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h2>{title}</h2>{headerAction}<button className="icon-button" aria-label="关闭弹窗" onClick={() => void close()}><X size={20}/></button></header>
      {confirmClose && <div ref={warning} tabIndex={-1} className="unsaved-warning" role="alert"><p>还有未保存的修改，是否放弃？</p><div className="confirm-actions"><button type="button" onClick={() => { setConfirmClose(false); panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }}>继续编辑</button><button type="button" onClick={() => { if (canCloseRef.current?.() !== false) closeRef.current(); }}>放弃修改</button></div></div>}
      {children}
    </section>
  </div>;
}

