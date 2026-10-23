import { useEffect, useState } from 'react';
import { Check, Type } from 'lucide-react';
import type { FontId } from '../../styles/fontRegistry';
import { fontRegistry, getFontOption, loadFont } from '../../styles/fontRegistry';

export function SettingsPage({ fontId, pendingFontId, onSelect }: {
  fontId: FontId;
  pendingFontId: FontId | null;
  onSelect: (id: FontId) => void;
}) {
  const selected = getFontOption(fontId);
  const [previewsReady, setPreviewsReady] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all(fontRegistry.map(option => loadFont(option.id))).catch(() => undefined).finally(() => { if (active) setPreviewsReady(true); });
    return () => { active = false; };
  }, []);
  return <section className="settings-page" aria-label="应用设置">
    <header className="settings-header">
      <span className="settings-icon"><Type size={20}/></span>
      <div><span className="eyebrow">MAKE IT YOURS</span><h1>字体设置</h1></div>
    </header>
    <p className="settings-intro">选一种喜欢的字，让每个小日子都更像你。</p>
    <section className="font-preview-card" aria-label="当前字体预览">
      <span>实时预览 · {selected.name}</span>
      <p data-testid="font-preview" style={{ fontFamily: selected.familyStack }}>今天也辛苦啦，一件一件来就好。</p>
      <small>把平凡的小日子，过得柔软一点。</small>
    </section>
    <h2 className="font-options-heading">选择字体</h2>
    <div className="font-options" role="radiogroup" aria-label="全应用字体">
      {fontRegistry.map(option => <button
        className={`font-option ${fontId === option.id ? 'is-selected' : ''}`}
        key={option.id}
        type="button"
        role="radio"
        aria-checked={fontId === option.id}
        aria-label={`选择${option.name}`}
        aria-busy={pendingFontId === option.id}
        onClick={() => onSelect(option.id)}
      >
        <span className="font-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
        <span className="font-option-preview" style={{ fontFamily: option.familyStack }}>小日子 Cozy 123</span>
        <span className="font-option-check" aria-hidden="true">{fontId === option.id && (pendingFontId === option.id ? '…' : <Check size={16}/>)}</span>
      </button>)}
    </div>
    {(pendingFontId || !previewsReady) && <p className="font-loading" role="status">正在准备{pendingFontId ? getFontOption(pendingFontId).name : '字体预览'}…</p>}
    <p className="font-settings-note">字体设置仅保存在这台设备上，离线也可以使用。</p>
  </section>;
}
