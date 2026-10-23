import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { animateElement, motion } from '../styles/motion';

export function Modal({ title, onClose, children, className = '', headerAction }: {
  title: string; onClose: () => void; children: ReactNode; className?: string; headerAction?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const closing = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const animation = animateElement(panel.current, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(32px)' }], motion.modal);
    if (animation) await animation.finished.catch(() => {});
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
      const items = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]'));
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
      {children}
    </section>
  </div>;
}

