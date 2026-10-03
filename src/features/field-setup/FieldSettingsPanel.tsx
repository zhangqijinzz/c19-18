import type { BlockedZone, LayoutDocument } from '../../types';

interface FieldSettingsPanelProps {
  document: LayoutDocument;
  selectedZoneId: string | null;
  onResizeField: (width: number, height: number) => void;
  onReset: () => void;
  onAddZone: () => void;
  onSelectZone: (id: string) => void;
  onDeleteZone: (id: string) => void;
}

export function FieldSettingsPanel({ document, selectedZoneId, onResizeField, onReset, onAddZone, onSelectZone, onDeleteZone }: FieldSettingsPanelProps) {
  return <section className="panel field-settings">
    <div className="panel-heading"><div><span className="section-kicker">FIELD SETUP</span><h2>场地设置</h2></div></div>
    <div className="field-summary"><span>当前尺寸</span><strong>{document.field.width} × {document.field.height} m</strong></div>
    <div className="field-inputs"><label>宽度 <input aria-label="场地宽度" type="number" min="12" step="0.5" defaultValue={document.field.width} key={`width-${document.field.width}`} onBlur={(event) => onResizeField(Number(event.target.value), document.field.height)} /></label><span>×</span><label>深度 <input aria-label="场地深度" type="number" min="10" step="0.5" defaultValue={document.field.height} key={`height-${document.field.height}`} onBlur={(event) => onResizeField(document.field.width, Number(event.target.value))} /></label></div>

    <div className="zones-heading"><span className="section-kicker">BLOCKED AREAS</span><strong>不可占用区域 · {document.blockedZones.length}</strong></div>
    <p className="zones-hint">承重柱、货梯井、配电间等占地结构。元素无法压到上面，通道与路线检查会自动绕开。</p>
    {document.blockedZones.length ? <ul className="zone-list">
      {document.blockedZones.map((zone: BlockedZone) => (
        <li key={zone.id} className={selectedZoneId === zone.id ? 'is-selected' : ''}>
          <button type="button" className="zone-item" onClick={() => onSelectZone(zone.id)}><span className="zone-item-swatch">⊘</span><span><strong>{zone.name}</strong><small>{zone.width.toFixed(1)} × {zone.height.toFixed(1)} m · ({zone.x.toFixed(1)}, {zone.y.toFixed(1)})</small></span></button>
          <button type="button" className="zone-item-delete" aria-label={`删除 ${zone.name}`} onClick={() => onDeleteZone(zone.id)}>⌫</button>
        </li>
      ))}
    </ul> : <div className="zones-empty">当前场地没有不可占用区域，行为与完整矩形场地一致。</div>}
    <button type="button" className="add-zone-button" onClick={onAddZone}><span>⊘</span> 添加不可占用区域</button>

    <button type="button" className="text-button" onClick={onReset}>↺ 恢复示例布局</button>
  </section>;
}
