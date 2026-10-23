import { ArrowLeft, Check, Type } from 'lucide-react';
import type { FontId } from '../../styles/fontRegistry';
import { fontRegistry, getFontOption } from '../../styles/fontRegistry';

export function SettingsPage({ fontId, pendingFontId, onSelect, onBack }: {
  fontId: FontId;
  pendingFontId: FontId | null;
  onSelect: (id: FontId) => void;
  onBack: () => void;
}) {
  const selected = getFontOption(fontId);
  return <section className="settings-page" aria-label="应用设置">
    <header className="settings-header">
      <button type="button" className="settings-back icon-button" aria-label="返回上一页" onClick={onBack}><ArrowLeft size={19}/></button>
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
        disabled={pendingFontId !== null}
        onClick={() => onSelect(option.id)}
      >
        <span className="font-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
        <span className="font-option-preview" style={{ fontFamily: fontId === option.id ? option.familyStack : undefined }}>小日子 Cozy 123</span>
        <span className="font-option-check" aria-hidden="true">{fontId === option.id && (pendingFontId === option.id ? '…' : <Check size={16}/>)}</span>
      </button>)}
    </div>
    {pendingFontId && <p className="font-loading" role="status">正在准备{getFontOption(pendingFontId).name}…</p>}
    <p className="font-settings-note">字体设置仅保存在这台设备上，离线也可以使用。</p>
  </section>;
}
