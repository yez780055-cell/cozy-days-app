import { useState } from 'react';
import { CalendarDays, ChevronRight, DatabaseBackup, Type } from 'lucide-react';
import { Button } from '../../components/Button';
import { CycleInfoPage } from '../period/CycleInfoPage';
import { BackupPage } from './BackupPage';
import { SettingsHeader } from './SettingsHeader';
import { fontRegistry, getFontOption, type FontId } from '../../styles/fontRegistry';

export function SettingsPage({ fontId, pendingFontId, failedFontId, onSelect, onBack }: {
  fontId: FontId; pendingFontId: FontId | null; failedFontId: FontId | null;
  onSelect: (id: FontId) => void; onBack: () => void;
}) {
  const [section, setSection] = useState<'appearance' | 'cycle' | 'backup'>();
  const returnToSettings = () => setSection(undefined);
  const selected = getFontOption(fontId);
  if (section === 'cycle') return <CycleInfoPage onBack={returnToSettings}/>;
  if (section === 'backup') return <BackupPage onBack={returnToSettings}/>;

  if (section === 'appearance') return <section className="settings-page" aria-label="外观与字体">
    <SettingsHeader title="外观与字体" onBack={returnToSettings}/>
    <section className="font-preview-card settings-group" aria-label="当前字体预览">
      <span>实时预览 · {selected.name}</span>
      <p data-testid="font-preview" style={{fontFamily:selected.familyStack}}>字体预览 Cozy Days 123</p>
    </section>
    <h2 className="settings-section-title">选择字体</h2>
    <div className="settings-group font-options" role="radiogroup" aria-label="全应用字体" aria-busy={pendingFontId !== null}>
      {fontRegistry.map(option => <label key={option.id} className="font-option">
        <span><strong>{option.name}</strong><small>{option.description}</small></span>
        <input type="radio" name="app-font" aria-label={`选择${option.name}`}
          checked={fontId === option.id} disabled={pendingFontId !== null}
          onChange={() => onSelect(option.id)}/>
      </label>)}
    </div>
    {pendingFontId && <p className="settings-notice" role="status">正在准备{getFontOption(pendingFontId).name}…</p>}
    {failedFontId && !pendingFontId && <div className="settings-notice settings-notice--error" role="alert">
      <p>字体加载失败，当前字体选择没有更改。</p>
      <Button variant="soft" onClick={() => onSelect(failedFontId)}>重试加载{getFontOption(failedFontId).name}</Button>
    </div>}
  </section>;

  const groups = [
    { id:'appearance', heading:'外观', label:'外观与字体', value:selected.name, Icon:Type },
    { id:'cycle', heading:'记录', label:'周期信息', Icon:CalendarDays },
    { id:'backup', heading:'数据', label:'数据备份与恢复', Icon:DatabaseBackup },
  ] as const;
  return <section className="settings-page" aria-label="应用设置">
    <SettingsHeader title="设置" eyebrow="小饱日常" backLabel="返回上一页" onBack={onBack}/>
    {groups.map(({id, heading, label, Icon, ...item}) => <section key={id} aria-labelledby={`settings-${id}`}>
      <h2 id={`settings-${id}`} className="settings-section-title">{heading}</h2>
      <div className="settings-group">
        <button type="button" className="settings-row" onClick={() => setSection(id)}>
          <Icon size={20} aria-hidden="true"/><span>{label}</span>
          {'value' in item && <small>{item.value}</small>}
          <ChevronRight size={18} aria-hidden="true"/>
        </button>
      </div>
    </section>)}
    <p className="settings-intro">记录保存在本机。换设备前请导出备份。</p>
  </section>;
}
