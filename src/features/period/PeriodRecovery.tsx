import { Modal } from '../../components/Modal';
import { validPeriodData } from './repository';

export function PeriodRecovery({entries,notice,onClose,onRestore}:{entries:unknown[];notice:string;onClose:()=>void;onRestore:(value:unknown)=>void}) {
  function download(value:unknown) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='cozy-days-period-recovery.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <Modal title="生理期恢复备份" onClose={onClose} className="period-dialog"><p>{notice}</p>{entries.map((value,index)=>{
    const item=value as {database?:unknown;draft?:unknown};
    return <section key={index}><h3>恢复副本 {index+1}</h3><button className="period-primary" onClick={()=>download(value)}>导出备份</button><details><summary>查看完整内容</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(value,null,2)}</pre></details>
      {validPeriodData(item?.database)&&<button onClick={()=>onRestore(item.database)}>恢复此副本的记录库版本</button>}
      {validPeriodData(item?.draft)&&<button onClick={()=>onRestore(item.draft)}>恢复此副本的草稿版本</button>}
    </section>;
  })}</Modal>;
}
