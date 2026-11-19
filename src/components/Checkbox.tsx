import { Check } from 'lucide-react';
export function Checkbox({ checked = false, disabled = false, onChange, label }: {
  checked?: boolean; disabled?: boolean; onChange?: () => void; label: string;
}) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label}
    disabled={disabled} onClick={onChange} className={`checkbox ${checked ? 'is-checked' : ''}`}>
    <span aria-hidden="true"><Check size={16} strokeWidth={1.7}/></span>
  </button>;
}

