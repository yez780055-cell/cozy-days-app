import { useState } from 'react';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import type { Todo } from '../data/database';
import { TodoView, type InitialDialog, type TodoStore } from '../features/todo/TodoPage';
import { todayKey } from '../features/todo/dates';
import { resolveDecoration, reviseDecoration } from '../features/todo/decorations';

export const scenarios = {
  normal: '普通列表', empty: '空列表', completed: '全部完成', long: '长列表与多行',
  add: '新增弹窗', edit: '编辑弹窗', delete: '删除确认', undo: '完成撤销', components: '公共组件状态',
};
type Scenario = keyof typeof scenarios;
function fixtures(scenario: Scenario): Todo[] {
  const texts = ['准备下周的设计稿', '整理一下房间', '看一本喜欢的书', '晚上做十分钟拉伸'];
  if (scenario === 'empty' || scenario === 'components' || scenario === 'add') return [];
  if (scenario === 'long') texts.push('给自己留一个没有安排的下午，去楼下的咖啡店读几页书。\n如果下雨，就在窗边听一会儿喜欢的歌。', ...Array.from({length:15}, (_, i) => `第 ${i + 5} 件小事：记录今天的一个小小进步`));
  return texts.map((text, i) => ({ id: i + 1, text, date: todayKey(), completed: scenario === 'completed' || (scenario === 'undo' && i === 0), createdAt: i }));
}
function PreviewStage({ scenario }: { scenario: Scenario }) {
  const [todos, setTodos] = useState(() => fixtures(scenario));
  const store: TodoStore = {
    todos, error: '', loading: false,
    save: async (text, date, id, decoration) => {
      setTodos(items => id === undefined ? [...items, {id: Date.now(), text, date, completed:false, createdAt:Date.now(), decoration: reviseDecoration(text, decoration)}] : items.map(item => item.id === id ? {...item,text,date, decoration: reviseDecoration(text, decoration ?? resolveDecoration(item.text, item.decoration))} : item)); return true;
    },
    complete: async (id, completed) => { setTodos(items => items.map(item => item.id === id ? {...item,completed} : item)); return true; },
    remove: async id => { setTodos(items => items.filter(item => item.id !== id)); return true; },
  };
  if (scenario === 'components') return <section className="component-preview"><h1>公共组件</h1><p>开发专用，演示数据不写入本地数据库。</p><h2>按钮</h2><Button>默认</Button><Button className="force-pressed">按下</Button><Button variant="soft">次要</Button><Button disabled>禁用</Button><h2>复选框</h2><div className="checkbox-preview"><Checkbox label="未选中"/><Checkbox checked label="已选中"/><Checkbox disabled label="禁用未选中"/><Checkbox checked disabled label="禁用选中"/></div><h2>选中状态</h2><div className="view-tabs"><button className="active">已选中</button><button>默认</button></div></section>;
  return <TodoView store={store} initialDialog={(['add','edit','delete','undo'].includes(scenario) ? scenario : undefined) as InitialDialog}/>;
}
export default function PreviewStates() {
  const initial = new URLSearchParams(location.search).get('scenario') as Scenario | null;
  const [scenario, setScenario] = useState<Scenario>(initial && initial in scenarios ? initial : 'normal');
  return <><div className="preview-selector"><label>开发状态 <select aria-label="开发状态" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{Object.entries(scenarios).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><span>演示数据 · 不会保存</span></div><PreviewStage key={scenario} scenario={scenario}/></>;
}

