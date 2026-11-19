import { useEffect, useState } from 'react';
import { BookImage, ChevronRight, Droplet, Plus, SlidersHorizontal } from 'lucide-react';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { anniversaryRepository, todoRepository, type Todo } from '../../data/database';
import { nextImportantDate, type Anniversary } from '../anniversary/model';
import { todayKey, weekday } from '../todo/dates';
import './home.css';

type Destination = 'todo' | 'period' | 'anniversary';
export function HomePage({onNavigate,onSettings}:{onNavigate:(page:Destination,add?:boolean,all?:boolean)=>void;onSettings:()=>void}) {
  const [todos,setTodos]=useState<Todo[]>([]);
  const [anniversaries,setAnniversaries]=useState<Anniversary[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState(false);
  const [today,setToday]=useState(todayKey);
  useEffect(()=>{
    let alive=true;
    Promise.all([todoRepository.all(),anniversaryRepository.all()]).then(([tasks,dates])=>{if(alive){setTodos(tasks);setAnniversaries(dates);setLoaded(true);}}).catch(()=>{if(alive)setError(true);});
    const refresh=()=>setToday(todayKey());
    const timer=window.setInterval(refresh,30000);
    window.addEventListener('focus',refresh);
    return ()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  const tasks=todos.filter(item=>item.date===today);
  const done=tasks.filter(item=>item.completed).length;
  const overdue=todos.filter(item=>!item.completed && item.date<today).length;
  const upcoming = nextImportantDate(anniversaries, today);
  const date=new Date(today+'T12:00:00');
  const month = new Intl.DateTimeFormat('en', {month:'short'}).format(date).toUpperCase();
  return <section className="home-page" aria-label="首页">
    <header className="home-header">
      <span className="home-brand">Cozy Days</span>
      <button type="button" className="home-settings icon-button" aria-label="打开应用设置" onClick={onSettings}><SlidersHorizontal size={20}/></button>
    </header>
    <div className="home-scene">
      <div className="home-scene-copy">
        <div><p>{date.getFullYear()} 年 {date.getMonth() + 1} 月 · {weekday(today)}</p><h1>今天好呀，小饱</h1></div>
        <time className="home-stamp" dateTime={today}>{date.getDate()}<span>{month}</span></time>
      </div>
      <div className="home-scene-art">
        <Asset name="hero" className="home-room" position="50% 62%"/>
        <Asset name="cat" className="home-cats"/>
      </div>
    </div>
    {error ? <p className="error-message" role="alert">数据读取失败，请重新进入首页重试。</p> : !loaded ? <p className="home-empty" role="status">正在读取…</p> : <>
      <section aria-labelledby="home-today">
        <div className="home-section-heading">
          <h2 id="home-today">今日待办</h2>
          <Button variant="ghost" onClick={()=>onNavigate('todo')}>查看清单 <ChevronRight size={16}/></Button>
        </div>
        {tasks.length ? <div className="home-progress">
          <b>{tasks.length - done}</b>
          <div><strong>件待完成</strong>
            <progress aria-label="今日待办进度" value={done} max={tasks.length}/>
            <small>已完成 {done} / {tasks.length} 件</small>
          </div>
        </div> : <p className="home-empty">今天还没有待办</p>}
        {overdue > 0 && <Button variant="ghost" className="home-reminder" onClick={()=>onNavigate('todo',false,true)}>还有 {overdue} 件过期待办 <ChevronRight size={16}/></Button>}
      </section>
      <section aria-labelledby="home-anniversary">
        <div className="home-section-heading"><h2 id="home-anniversary">最近的纪念日</h2></div>
        {upcoming ? <button type="button" className="home-anniversary" onClick={()=>onNavigate('anniversary')}>
          <span><small>{upcoming.row.theme} · <time dateTime={upcoming.occurrence}>{upcoming.occurrence.slice(5).replace('-', ' / ')}</time></small>
            <strong>{upcoming.row.name}</strong></span>
          <span>{upcoming.days === 0 ? '今天' : <><b>{upcoming.days}</b> 天后</>}</span>
        </button> : <Button variant="soft" onClick={()=>onNavigate('anniversary')}>还没有即将到来的纪念日 <ChevronRight size={16}/></Button>}
      </section>
    </>}
    <section aria-labelledby="home-shortcuts">
      <div className="home-section-heading"><h2 id="home-shortcuts">快捷操作</h2></div>
      <div className="home-actions">
        <Button variant="soft" onClick={()=>onNavigate('todo',true)}><Plus size={16}/>添加待办</Button>
        <Button variant="soft" onClick={()=>onNavigate('period')}><Droplet size={16}/>记录生理期</Button>
        <Button variant="soft" onClick={()=>onNavigate('anniversary',true)}><BookImage size={16}/>新增纪念日</Button>
      </div>
    </section>
  </section>;
}
