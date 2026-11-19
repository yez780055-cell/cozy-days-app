import { useState } from 'react';
import { Button } from '../../components/Button';
import { SettingsHeader } from '../settings/SettingsHeader';
import { CycleSummary } from './CycleSummary';
import { PeriodEditor, PeriodHistory, PeriodSettings } from './PeriodForms';
import { clearPeriodDraft } from './recovery';
import { localToday, validatePeriod, type PeriodEntry } from './model';
import { usePeriod } from './usePeriod';
import './period.css';

export function CycleInfoPage({onBack}:{onBack:()=>void}) {
  const {data, ready, saving, error, conflict, update, retry} = usePeriod();
  const [panel, setPanel] = useState<'history'|'settings'>();
  const [editing, setEditing] = useState<PeriodEntry>();
  const today = localToday();

  function close() {
    if (editing) clearPeriodDraft('editor-'+editing.id);
    if (panel === 'settings') clearPeriodDraft('settings');
    setEditing(undefined);
    setPanel(undefined);
  }

  return <section className="settings-page cycle-info-page" aria-label="周期信息">
    <SettingsHeader title="周期信息" onBack={onBack}/>
    {error && <div className="period-error" role="alert"><p>{error}</p>
      {conflict ? <p>请返回生理期页面处理恢复冲突。</p> : <Button variant="soft" disabled={saving} onClick={retry}>重试</Button>}
    </div>}
    {ready && <>
      <CycleSummary data={data} today={today} onHistory={()=>setPanel('history')} onSettings={()=>setPanel('settings')}/>
      {panel === 'history' && !editing && <PeriodHistory data={data} onClose={close} error={error} saving={saving} onRetry={()=>void retry()}
        onEdit={setEditing} onRemove={id=>update(d=>({...d,periods:d.periods.filter(p=>p.id!==id)}))}/>}
      {editing && <PeriodEditor entry={editing} data={data} today={today} onClose={close} onSave={async entry => {
        const ok = await update(d => {
          const previous = d.periods.find(p => p.id === editing.id);
          const unchanged = previous?.start === editing.start && previous.end === editing.end;
          const alreadyApplied = previous?.start === entry.start && previous.end === entry.end;
          if ((!unchanged && !alreadyApplied) || validatePeriod(entry, d.periods)) return d;
          return {...d,periods:d.periods.map(p=>p.id===entry.id?entry:p)};
        });
        if (ok) close();
        return ok;
      }}/>}
      {panel === 'settings' && <PeriodSettings data={data} today={today} onClose={close} onSave={async settings => {
        const ok = await update(d=>({...d,settings}));
        if (ok) close();
        return ok;
      }}/>}
    </>}
  </section>;
}
