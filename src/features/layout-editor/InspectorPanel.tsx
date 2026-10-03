import type { BlockedZone, RenderElement } from '../../types';

interface InspectorPanelProps {
  selectedElement: RenderElement | null;
  selectedZone: BlockedZone | null;
  onRename: (name: string) => void;
  onResize: (width: number, height: number) => void;
  onRotate: () => void;
  onDelete: () => void;
  onRenameZone: (name: string) => void;
  onResizeZone: (width: number, height: number) => void;
  onDeleteZone: () => void;
}

export function InspectorPanel({ selectedElement, selectedZone, onRename, onResize, onRotate, onDelete, onRenameZone, onResizeZone, onDeleteZone }: InspectorPanelProps) {
  return <section className="panel inspector-panel">
    <div className="panel-heading"><div><span className="section-kicker">SELECTION</span><h2>属性面板</h2></div><span className="selection-indicator" /></div>
    {selectedElement
      ? <SelectedFields element={selectedElement} onRename={onRename} onResize={onResize} onRotate={onRotate} onDelete={onDelete} />
      : selectedZone
        ? <ZoneFields zone={selectedZone} onRename={onRenameZone} onResize={onResizeZone} onDelete={onDeleteZone} />
        : <div className="empty-inspector"><span>⌁</span><p>点击场地中的元素或不可占用区域<br />开始调整布局</p></div>}
  </section>;
}

interface SelectedFieldsProps { element: RenderElement; onRename: (name: string) => void; onResize: (width: number, height: number) => void; onRotate: () => void; onDelete: () => void; }

function SelectedFields({ element, onRename, onResize, onRotate, onDelete }: SelectedFieldsProps) {
  return <div className="selected-fields">
    <div className="selected-kind"><span className="selected-symbol">{element.kind === 'stage' ? '✦' : element.kind === 'entrance' ? '↗' : element.kind === 'seating' ? '▤' : '▦'}</span><div><strong>{element.kind.toUpperCase()}</strong><small>ID · {element.id.slice(0, 12)}</small></div></div>
    <label className="field-label-input">名称<input aria-label="元素名称" value={element.name} onChange={(event) => onRename(event.target.value)} /></label>
    <div className="dimension-grid"><label>宽度<input aria-label="元素宽度" type="number" min="1" step="0.5" value={element.width} onChange={(event) => onResize(Number(event.target.value), element.height)} /></label><label>深度<input aria-label="元素深度" type="number" min="1" step="0.5" value={element.height} onChange={(event) => onResize(element.width, Number(event.target.value))} /></label></div>
    <div className="transform-readout"><span>位置 <strong>{element.x.toFixed(1)}, {element.y.toFixed(1)}</strong></span><span>旋转 <strong>{element.rotation}°</strong></span><span>占地 <strong>{element.occupiedArea.toFixed(1)} m²</strong></span></div>
    <div className="inspector-actions"><button type="button" className="secondary-button" onClick={onRotate}>↻ 旋转 90°</button><button type="button" className="icon-button danger" aria-label="删除元素" onClick={onDelete}>⌫</button></div>
  </div>;
}

interface ZoneFieldsProps { zone: BlockedZone; onRename: (name: string) => void; onResize: (width: number, height: number) => void; onDelete: () => void; }

function ZoneFields({ zone, onRename, onResize, onDelete }: ZoneFieldsProps) {
  return <div className="selected-fields zone-fields">
    <div className="selected-kind"><span className="selected-symbol zone-symbol">⊘</span><div><strong>BLOCKED</strong><small>承重柱 / 井道 / 配电间</small></div></div>
    <label className="field-label-input">名称<input aria-label="不可占用区域名称" value={zone.name} onChange={(event) => onRename(event.target.value)} /></label>
    <div className="dimension-grid"><label>宽度<input aria-label="不可占用区域宽度" type="number" min="1" step="0.5" value={zone.width} onChange={(event) => onResize(Number(event.target.value), zone.height)} /></label><label>深度<input aria-label="不可占用区域深度" type="number" min="1" step="0.5" value={zone.height} onChange={(event) => onResize(zone.width, Number(event.target.value))} /></label></div>
    <div className="transform-readout"><span>位置 <strong>{zone.x.toFixed(1)}, {zone.y.toFixed(1)}</strong></span><span>占地 <strong>{(zone.width * zone.height).toFixed(1)} m²</strong></span></div>
    <p className="zone-note">元素不能压到该区域，通道与路线检查会自动绕开它。</p>
    <div className="inspector-actions"><button type="button" className="secondary-button danger-text" onClick={onDelete}>⌫ 删除该区域</button></div>
  </div>;
}
