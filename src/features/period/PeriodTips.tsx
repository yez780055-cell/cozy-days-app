import { BookOpen, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { dateStatus, type PeriodData } from './model';
import { PeriodArt } from './PeriodArt';
export function PeriodTips({ data, today }: {data:PeriodData;today:string}) {
  const [open,setOpen]=useState(false), status=dateStatus(today,data,today);
  const title=status==='actual'?'经期里，给自己一点暖意':status==='fertile'||status==='ovulation'?'跟着自己的感受，轻轻运动':status==='predicted'?'备好小物，安心迎接下一次':'每个阶段，都值得被好好照顾';
  const text=status==='actual'?'隔着毛巾温热敷、轻缓散步，可能帮助舒缓经期不适。':'记下身体感受，按自己的状态安排活动和休息。';
  return <><section className="period-card period-tips"><header><h2><BookOpen size={19}/>生理期小贴士 <em>♡</em></h2></header><button onClick={()=>setOpen(true)} aria-label="查看小贴士详情"><b>{title}</b><p>{text}</p><span>读一读 <ChevronRight size={15}/></span></button><PeriodArt slot="tips"/></section>
    {open&&<Modal title="给自己的温柔小贴士" onClose={()=>setOpen(false)} className="period-dialog"><h3>{title}</h3><p>{text}</p><p>热敷时包裹毛巾，避免烫伤。轻柔活动与充足睡眠可以作为日常照护的一部分。</p><p>如果疼痛严重、比平时明显加重，或出血和不适影响日常生活，请及时咨询专业医护人员。</p><p>日历根据记录估算，经期与排卵时间可能变化；易孕期范围并不代表其他日期安全，不能作为避孕依据，也不是医疗诊断。</p><a href="https://www.nhs.uk/symptoms/period-pain/" target="_blank" rel="noreferrer">照护内容参考：NHS · Period pain ↗</a></Modal>}
  </>;
}
