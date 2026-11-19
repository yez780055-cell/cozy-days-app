import { ChevronLeft } from 'lucide-react';

export function SettingsHeader({ title, onBack, backLabel = '返回设置', disabled = false, eyebrow }: {
  title: string; onBack: () => void; backLabel?: string; disabled?: boolean; eyebrow?: string;
}) {
  return <header className="settings-header">
    <div>{eyebrow && <p>{eyebrow}</p>}<h1>{title}</h1></div>
    <button type="button" className="icon-button" aria-label={backLabel} disabled={disabled} onClick={onBack}><ChevronLeft size={20}/></button>
  </header>;
}
