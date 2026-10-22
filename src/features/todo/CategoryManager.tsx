import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { categoryKey, cleanCategoryName, type Category } from '../../data/categories';

export function CategoryManager({categories,onSave,onRemove,onClose}:{
  categories:Category[];onSave:(name:string,id?:string)=>Promise<boolean>;onRemove:(id:string)=>Promise<boolean>;onClose:()=>void;
}) {
  const [name,setName]=useState(''),[editing,setEditing]=useState<string>(),[deleting,setDeleting]=useState<Category>();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;
    try{
      const cleaned=cleanCategoryName(name);
      if(categories.some(c=>c.id!==editing&&c.key===categoryKey(cleaned)))throw new Error('已经有这个分类啦，换一个名字吧。');
      setBusy(true);setError('');
      if(await onSave(cleaned,editing)){setName('');setEditing(undefined);}
      else setError('分类没有保存成功，请检查名称或稍后重试。');
    }catch(error){setError(error instanceof Error?error.message:'请检查分类名称。');}
    finally{setBusy(false);}
  }
  return <Modal title="管理分类" onClose={onClose}>
    {deleting ? <section className="category-delete">
      <p>删除「{deleting.name}」分类？</p><p>其中的任务都会移入「生活」，不会删除任务。</p>
      <div className="confirm-actions"><Button variant="soft" onClick={()=>setDeleting(undefined)} disabled={busy}>取消</Button>
        <Button variant="danger" disabled={busy} onClick={async()=>{setBusy(true);setError('');const success=await onRemove(deleting.id);setBusy(false);if(success){if(editing===deleting.id){setEditing(undefined);setName('');}setDeleting(undefined);}else setError('分类暂时无法删除，请重试。');}}>确认删除分类</Button></div>
    </section> : <>
      <form className="category-form" onSubmit={submit}><label htmlFor="category-name">{editing?'修改分类名称':'新增分类'}</label>
        <div><input id="category-name" aria-label="分类名称" data-autofocus value={name} maxLength={16} placeholder="例如：运动、灵感" onChange={event=>setName(event.target.value)}/>
          <Button type="submit" disabled={busy||!name.trim()}>{editing?'保存分类':'添加分类'}</Button></div>
        {editing && <button className="category-cancel" type="button" onClick={()=>{setEditing(undefined);setName('');setError('');}}>取消修改</button>}
      </form>
      <p className="category-note">工作、生活、学习是默认分类。自定义分类可以改名或删除。</p>
      <ul className="category-manager-list">{categories.map(category=><li key={category.id}><span>{category.name}</span>{category.builtin?<small>默认</small>:<div>
        <button type="button" className="icon-button" aria-label={`修改分类：${category.name}`} onClick={()=>{setEditing(category.id);setName(category.name);setError('');}}><Pencil size={16}/></button>
        <button type="button" className="icon-button" aria-label={`删除分类：${category.name}`} onClick={()=>{setDeleting(category);setError('');}}><Trash2 size={16}/></button>
      </div>}</li>)}</ul>
    </>}
    {error&&<p className="error-message" role="alert">{error}</p>}
  </Modal>;
}
