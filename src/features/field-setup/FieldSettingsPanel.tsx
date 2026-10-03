import { OBSTACLE_SPECS } from '../../domain';
import type { LayoutDocument, ObstacleKind } from '../../types';

interface FieldSettingsPanelProps {
  document: LayoutDocument;
  selectedId: string | null;
  onResizeField: (width: number, height: number) => void;
  onReset: () => void;
  onAddObstacle: (kind: ObstacleKind) => void;
  onRenameObstacle: (id: string, name: string) => void;
  onResizeObstacle: (id: string, width: number, height: number) => void;
  onDeleteObstacle: (id: string) => void;
  onSelectObstacle: (id: string) => void;
}

export function FieldSettingsPanel({ document, selectedId, onResizeField, onReset, onAddObstacle, onRenameObstacle, onResizeObstacle, onDeleteObstacle, onSelectObstacle }: FieldSettingsPanelProps) {
  const obstacles = document.obstacles ?? [];
  return <section className="panel field-settings">
    <div className="panel-heading"><div><span className="section-kicker">FIELD SETUP</span><h2>场地设置</h2></div></div>
    <div className="field-summary"><span>当前尺寸</span><strong>{document.field.width} × {document.field.height} m</strong></div>
    <div className="field-inputs"><label>宽度 <input aria-label="场地宽度" type="number" min="12" step="0.5" defaultValue={document.field.width} key={`width-${document.field.width}`} onBlur={(event) => onResizeField(Number(event.target.value), document.field.height)} /></label><span>×</span><label>深度 <input aria-label="场地深度" type="number" min="10" step="0.5" defaultValue={document.field.height} key={`height-${document.field.height}`} onBlur={(event) => onResizeField(document.field.width, Number(event.target.value))} /></label></div>

    <div className="obstacle-block">
      <div className="obstacle-heading"><span className="section-kicker">RESTRICTED ZONES</span><strong>不可占用区域</strong><small>承重柱、货梯井与配电间不参与布展</small></div>
      <div className="obstacle-adds">
        {(Object.keys(OBSTACLE_SPECS) as ObstacleKind[]).map((kind) => {
          const spec = OBSTACLE_SPECS[kind];
          return <button type="button" key={kind} className="obstacle-add" onClick={() => onAddObstacle(kind)}>
            <span className="obstacle-add-icon">{spec.icon}</span>
            <span><strong>{spec.label}</strong><small>{spec.width} × {spec.height} m</small></span>
            <span className="add-mark">+</span>
          </button>;
        })}
      </div>
      {obstacles.length === 0 ? <p className="obstacle-empty">当前场地没有不可占用区域，行为与普通矩形场地一致。</p> : <div className="obstacle-list">
        {obstacles.map((obstacle) => {
          const spec = OBSTACLE_SPECS[obstacle.kind];
          return <div key={obstacle.id} className={`obstacle-item ${selectedId === obstacle.id ? 'is-selected' : ''}`} onFocus={() => onSelectObstacle(obstacle.id)} onClick={() => onSelectObstacle(obstacle.id)}>
            <div className="obstacle-item-head">
              <span className="obstacle-item-icon">{spec.icon}</span>
              <input aria-label="不可占用区域名称" value={obstacle.name} onChange={(event) => onRenameObstacle(obstacle.id, event.target.value)} />
              <button type="button" className="obstacle-delete" aria-label={`删除${obstacle.name}`} onClick={() => onDeleteObstacle(obstacle.id)}>⌫</button>
            </div>
            <div className="obstacle-item-dims">
              <label>宽 <input aria-label="不可占用区域宽度" type="number" min="0.5" step="0.5" value={obstacle.width} onChange={(event) => onResizeObstacle(obstacle.id, Number(event.target.value), obstacle.height)} /></label>
              <label>深 <input aria-label="不可占用区域深度" type="number" min="0.5" step="0.5" value={obstacle.height} onChange={(event) => onResizeObstacle(obstacle.id, obstacle.width, Number(event.target.value))} /></label>
              <span className="obstacle-pos">{obstacle.x.toFixed(1)}, {obstacle.y.toFixed(1)}</span>
            </div>
          </div>;
        })}
      </div>}
    </div>

    <button type="button" className="text-button" onClick={onReset}>↺ 恢复示例布局</button>
  </section>;
}
