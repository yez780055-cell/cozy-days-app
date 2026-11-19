import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { animateElement, motion } from '../styles/motion';

export function Modal({ title, onClose, children, className = '', headerAction, canClose, dirty = false, closeText, layout = 'sheet' }: {
  title: string; onClose: () => void; children: ReactNode | ((requestClose: () => void) => ReactNode); className?: string; headerAction?: ReactNode; canClose?: () => boolean; dirty?: boolean;
  closeText?: string; layout?: 'sheet' | 'confirm';
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const warning = useRef<HTMLDivElement>(null);
  const beforeWarning = useRef<HTMLElement | null>(null);
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
    if (dirtyRef.current) {
      if (!warning.current) beforeWarning.current = document.activeElement as HTMLElement | null;
      setConfirmClose(true);
      return;
    }
    closing.current = true;
    const animation = animateElement(panel.current, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: layout === 'sheet' ? 'translateY(32px)' : 'translateY(0)' }], motion.modal);
    if (animation) await animation.finished.catch(() => {});
    if (canCloseRef.current?.() === false) {
      closing.current = false;
      return;
    }
    closeRef.current();
  }, [layout]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current!;
    animateElement(element, [{ opacity: 0, transform: layout === 'sheet' ? 'translateY(32px)' : 'translateY(0)' }, { opacity: 1, transform: 'translateY(0)' }], motion.modal);
    element.focus({ preventScroll: true });
    const timer = window.setTimeout(() => {
      if (document.activeElement !== element) return;
      const input = element.querySelector<HTMLElement>('[data-autofocus]');
      (input ?? element.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    }, motion.modal);
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void close(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), summary:first-of-type, [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!items.includes(document.activeElement as HTMLElement) || document.activeElement === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handleKeys); previous?.focus({ preventScroll: true }); };
  }, [close, layout]);
  return <div className={`modal-backdrop modal-backdrop--${layout}`} onClick={event => { if (event.target === event.currentTarget) void close(); }}>
    <section ref={panel} tabIndex={-1} className={`modal modal--${layout} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h2>{title}</h2>{headerAction}<button type="button" className="icon-button" aria-label={closeText ?? '关闭弹窗'} onClick={() => void close()}>{closeText ?? <X size={20}/>}</button></header>
      {confirmClose && <div ref={warning} tabIndex={-1} className="unsaved-warning" role="alert"><p>还有未保存的修改，是否放弃？</p><div className="confirm-actions"><Button variant="soft" onClick={() => {
        setConfirmClose(false);
        const previous = beforeWarning.current;
        (previous && panel.current?.contains(previous) ? previous : panel.current)?.focus();
      }}>继续编辑</Button><Button variant="danger" onClick={() => { if (canCloseRef.current?.() !== false) closeRef.current(); }}>放弃修改</Button></div></div>}
      {typeof children === 'function' ? children(() => void close()) : children}
    </section>
  </div>;
}

