import { useState, type ChangeEvent } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Upload } from 'lucide-react';
import type { Anniversary } from './model';
import { AnniversaryArt } from './AnniversaryArt';

async function prepareImage(file:File):Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的图片。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片处理失败，请重试。');
    context.fillStyle = '#fff8ef';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let quality = .82;
    let output = canvas.toDataURL('image/jpeg',quality);
    while (output.length > 600000 && quality > .32) {
      quality -= .1;
      output = canvas.toDataURL('image/jpeg',quality);
    }
    if (output.length > 600000) throw new Error('图片过大，请选择另一张图片。');
    return output;
  } finally { URL.revokeObjectURL(url); }
}

export function PhotoEditor({value,busy,error:saveError,onClose,onSave}:{value:Anniversary;busy:boolean;error:string;onClose:()=>void;onSave:(value:Anniversary)=>Promise<void>}) {
  const [image,setImage]=useState(value.backgroundImage);
  const [x,setX]=useState(value.backgroundX ?? 50);
  const [y,setY]=useState(value.backgroundY ?? 50);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function select(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.target.value='';
    if (!file) return;
    setLoading(true);setError('');
    try { setImage(await prepareImage(file));setX(50);setY(50); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取图片，请重试。'); }
    finally { setLoading(false); }
  }
  const dirty = image !== value.backgroundImage || !!image && (x !== (value.backgroundX ?? 50) || y !== (value.backgroundY ?? 50));
  return <Modal title="背景图片" onClose={onClose} className="ann-modal" dirty={dirty} canClose={()=>!busy && !loading}>
    {requestClose => <>
    <AnniversaryArt image={image} x={x} y={y} onPan={busy || loading ? undefined : focus => { setX(focus.x); setY(focus.y); }}/>
    <label className="ann-photo-picker"><Upload size={18} aria-hidden="true"/>{image ? '选择其他图片' : '选择图片'}
      <input type="file" accept="image/*" disabled={busy || loading} onChange={select}/>
    </label>
    {image && <div className="ann-photo-controls">
      <label>水平位置<input type="range" min="0" max="100" value={x} disabled={busy || loading} onChange={e=>setX(Number(e.target.value))}/></label>
      <label>垂直位置<input type="range" min="0" max="100" value={y} disabled={busy || loading} onChange={e=>setY(Number(e.target.value))}/></label>
      <Button variant="ghost" className="ann-destructive-link" disabled={busy || loading} onClick={()=>setImage(undefined)}>移除图片</Button>
    </div>}
    {image && <p className="ann-hint">拖动照片或使用滑块调整详情图的裁切位置。</p>}
    {loading && <p role="status">正在处理图片…</p>}
    {(error || saveError) && <p className="error-message" role="alert">{error || saveError}</p>}
    <footer className="modal-actions">
      <Button variant="soft" disabled={busy || loading} onClick={requestClose}>取消</Button>
      <Button disabled={busy || loading || !dirty} onClick={()=>void onSave({...value,backgroundImage:image,backgroundX:image ? x : undefined,backgroundY:image ? y : undefined})}>{busy ? '正在保存…' : '保存背景'}</Button>
    </footer>
    </>}
  </Modal>;
}
