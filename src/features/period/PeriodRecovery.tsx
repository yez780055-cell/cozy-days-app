import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Download } from 'lucide-react';
import { validPeriodData } from './repository';

export function PeriodRecovery({entries,notice,onClose,onRestore}:{entries:unknown[];notice:string;onClose:()=>void;onRestore:(value:unknown)=>void}) {
  function download(value:unknown) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='cozy-days-period-recovery.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <Modal title="生理期恢复备份" onClose={onClose} className="period-dialog">
    <p className="period-fine">{notice}</p>
    {entries.map((value,index) => {
      const item = value as {database?: unknown; draft?: unknown};
      return <section className="period-recovery-copy" key={index}>
        <h3>恢复副本 {index + 1}</h3>
        <Button variant="soft" onClick={()=>download(value)}><Download size={16}/>导出备份</Button>
        <details><summary>查看完整内容</summary><pre>{JSON.stringify(value,null,2)}</pre></details>
        <div className="period-recovery-actions">
          {validPeriodData(item?.database) && <Button variant="soft" onClick={()=>onRestore(item.database)}>恢复此副本的记录库版本</Button>}
          {validPeriodData(item?.draft) && <Button variant="soft" onClick={()=>onRestore(item.draft)}>恢复此副本的草稿版本</Button>}
        </div>
      </section>;
    })}
  </Modal>;
}
