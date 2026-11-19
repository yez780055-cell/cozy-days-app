import { useRef, type PointerEvent } from 'react';
import { Asset } from '../../components/Asset';

type Focus = { x: number; y: number };

export function AnniversaryArt({ image, x = 50, y = 50, onPan }: {
  image?: string; x?: number; y?: number; onPan?: (value: Focus) => void;
}) {
  const photo = useRef<HTMLImageElement>(null);
  const pan = useRef<(Focus & { id: number; startX: number; startY: number; width: number; height: number }) | null>(null);

  function begin(event: PointerEvent<HTMLSpanElement>) {
    const img = photo.current;
    if (!onPan || !img?.naturalWidth || !event.isPrimary || event.button !== 0) return;
    const { width, height } = event.currentTarget.getBoundingClientRect();
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const overflowX = img.naturalWidth * scale - width;
    const overflowY = img.naturalHeight * scale - height;
    if (overflowX < 1 && overflowY < 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { id: event.pointerId, x, y, startX: event.clientX, startY: event.clientY, width: overflowX, height: overflowY };
  }

  function move(event: PointerEvent<HTMLSpanElement>) {
    const start = pan.current;
    if (!start || start.id !== event.pointerId) return;
    const adjust = (focus: number, distance: number, overflow: number) =>
      overflow < 1 ? focus : Math.round(Math.max(0, Math.min(100, focus - 100 * distance / overflow)));
    onPan?.({
      x: adjust(start.x, event.clientX - start.startX, start.width),
      y: adjust(start.y, event.clientY - start.startY, start.height),
    });
  }

  return <span className={`ann-art${image && onPan ? ' ann-art--interactive' : ''}`} aria-hidden="true"
    onPointerDown={begin} onPointerMove={move} onLostPointerCapture={() => { pan.current = null; }}>
    {image
      ? <img ref={photo} className="ann-art-photo" src={image} alt="" draggable={false} style={{ objectPosition: `${x}% ${y}%` }}/>
      : <Asset name="empty"/>}
  </span>;
}
