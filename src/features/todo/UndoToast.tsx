import { useEffect, useRef, useState } from 'react';
import { motion, reducedMotion } from '../../styles/motion';
import { registeredAsset } from '../../assets/registry';

const paper = registeredAsset('paper_texture');

export function UndoToast({ label, onUndo, onExpire }: {label: string; onUndo: () => void; onExpire: () => void}) {
  const [leaving,setLeaving]=useState(false);
  const expire=useRef(onExpire);
  expire.current=onExpire;
  useEffect(()=>{
    let exit: ReturnType<typeof setTimeout>;
    const timer=setTimeout(()=>{setLeaving(true);exit=setTimeout(()=>expire.current(),reducedMotion()?0:motion.swipe);},motion.undo);
    return ()=>{clearTimeout(timer);clearTimeout(exit);};
  },[]);
  return <div className={`undo-toast ${leaving?'undo-toast--leaving':''}`} role="status" aria-live="polite" style={{backgroundImage:`url("${paper.file}")`}}>
    <span>{label}</span><button type="button" disabled={leaving} onClick={onUndo}>撤销</button>
    <div className="undo-progress" aria-hidden="true"><i/></div>
  </div>;
}
