import { useRef, useState } from 'react';
import { ELEMENT_SPECS } from '../../domain';
import type { AccessibilityIssue, BlockedZone, BlockedZoneIssue, LayoutMode, PathPreview, RenderElement } from '../../types';

interface FieldCanvasProps {
  field: { width: number; height: number };
  elements: RenderElement[];
  zones: BlockedZone[];
  selectedId: string | null;
  selectedZoneId: string | null;
  mode: LayoutMode;
  overlaps: Array<{ firstId: string; secondId: string }>;
  bounds: Array<{ elementId: string }>;
  channels: Array<{ firstId: string; secondId: string; zoneId?: string }>;
  zoneIssues: BlockedZoneIssue[];
  accessibility: AccessibilityIssue[];
  path: PathPreview | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSelectZone: (id: string) => void;
  onMoveZone: (id: string, x: number, y: number) => void;
  onAddZoneRect: (x: number, y: number, width: number, height: number) => void;
  onClearSelection: () => void;
}

const roundHalf = (value: number) => Math.max(0, Math.round(value * 2) / 2);

export function FieldCanvas({ field, elements, zones, selectedId, selectedZoneId, mode, overlaps, bounds, channels, zoneIssues, accessibility, path, onSelect, onMove, onSelectZone, onMoveZone, onAddZoneRect, onClearSelection }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [zoneDrag, setZoneDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const issueIds = new Set(overlaps.flatMap((item) => [item.firstId, item.secondId]));
  const channelIds = new Set(channels.flatMap((item) => [item.firstId, item.secondId]));
  const boundsIds = new Set(bounds.map((item) => item.elementId));
  const blockedElementIds = new Set(zoneIssues.map((item) => item.elementId));
  const blockedZoneIds = new Set(zoneIssues.map((item) => item.zoneId));
  const routeBlocked = accessibility.some((issue) => issue.kind === 'route-blocked');
  const canvasWidth = 100 / Math.max(1, field.width / (field.height * 1.35));

  const pointFromEvent = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) * field.width / box.width, y: (event.clientY - box.top) * field.height / box.height };
  };

  const zoneStyle = (zone: BlockedZone) => ({
    left: `${zone.x / field.width * 100}%`,
    top: `${zone.y / field.height * 100}%`,
    width: `${zone.width / field.width * 100}%`,
    height: `${zone.height / field.height * 100}%`,
  });

  return <div className="canvas-wrap">
    <div className="canvas-ruler top-ruler"><span>0 m</span><span>{Math.round(field.width / 2)} m</span><span>{field.width} m</span></div>
    <div className="canvas-ruler side-ruler"><span>0</span><span>{Math.round(field.height / 2)} m</span><span>{field.height} m</span></div>
    <div className={`field-canvas mode-${mode} ${drawing ? 'is-drawing' : ''}`} ref={canvasRef} style={{ width: `${Math.min(100, canvasWidth)}%`, aspectRatio: `${field.width} / ${field.height}` }}
      onPointerDown={(event) => {
        if (!drawing) {
          if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('grid-overlay')) onClearSelection();
          return;
        }
        const point = pointFromEvent(event);
        setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        if (!drawing || !draft) return;
        const point = pointFromEvent(event);
        setDraft({ ...draft, width: point.x - draft.x, height: point.y - draft.y });
      }}
      onPointerUp={() => {
        if (!drawing || !draft) return;
        const width = Math.abs(draft.width);
        const height = Math.abs(draft.height);
        if (width >= 1 && height >= 1) {
          onAddZoneRect(roundHalf(Math.min(draft.x, draft.x + draft.width)), roundHalf(Math.min(draft.y, draft.y + draft.height)), roundHalf(width), roundHalf(height));
        }
        setDraft(null);
        setDrawing(false);
      }}
      onPointerCancel={() => { setDraft(null); setDrawing(false); }}
    >
      <div className="grid-overlay" />
      <div className="field-label"><span>EXPO HALL A</span><strong>{field.width} × {field.height} m</strong></div>
      {zones.map((zone) => (
        <div key={zone.id} role="button" tabIndex={0} aria-label={zone.name}
          className={`blocked-zone ${selectedZoneId === zone.id ? 'is-selected' : ''} ${blockedZoneIds.has(zone.id) && mode !== 'edit' ? 'is-conflict' : ''}`}
          style={zoneStyle(zone)}
          onPointerDown={(event) => {
            if (drawing) return;
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = pointFromEvent(event);
            setZoneDrag({ id: zone.id, dx: point.x - zone.x, dy: point.y - zone.y });
            onSelectZone(zone.id);
          }}
          onPointerMove={(event) => {
            if (!zoneDrag || zoneDrag.id !== zone.id) return;
            const point = pointFromEvent(event);
            onMoveZone(zone.id, point.x - zoneDrag.dx, point.y - zoneDrag.dy);
          }}
          onPointerUp={() => setZoneDrag(null)}
          onPointerCancel={() => setZoneDrag(null)}
        >
          <span className="blocked-zone-icon">⊘</span>
          <span className="blocked-zone-name">{zone.name}</span>
          <small>{zone.width.toFixed(1)} × {zone.height.toFixed(1)} m · 不可占用</small>
        </div>
      ))}
      {draft ? <div className={`blocked-zone is-draft ${Math.abs(draft.width) >= 1 && Math.abs(draft.height) >= 1 ? '' : 'is-too-small'}`} style={{ left: `${Math.min(draft.x, draft.x + draft.width) / field.width * 100}%`, top: `${Math.min(draft.y, draft.y + draft.height) / field.height * 100}%`, width: `${Math.abs(draft.width) / field.width * 100}%`, height: `${Math.abs(draft.height) / field.height * 100}%` }}><span>不可占用区域</span></div> : null}
      {path && mode === 'path' ? <svg className="path-layer" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none">
        {path.reachable
          ? <polyline points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#ef795f" strokeWidth="0.3" strokeDasharray="0.75 0.55" />
          : <line x1={path.points[0].x} y1={path.points[0].y} x2={path.points[1].x} y2={path.points[1].y} stroke="#c2828e" strokeWidth="0.25" strokeDasharray="0.6 0.6" />}
        <circle cx={path.points[0].x} cy={path.points[0].y} r="0.45" fill={path.reachable ? '#ef795f' : '#c2828e'} />
        {path.reachable
          ? <circle cx={path.points[path.points.length - 1].x} cy={path.points[path.points.length - 1].y} r="0.45" fill="#ef795f" />
          : <g><circle cx={path.points[1].x} cy={path.points[1].y} r="0.55" fill="#f6dad6" stroke="#d4594b" strokeWidth="0.15" /><line x1={path.points[1].x - 0.3} y1={path.points[1].y - 0.3} x2={path.points[1].x + 0.3} y2={path.points[1].y + 0.3} stroke="#d4594b" strokeWidth="0.18" /><line x1={path.points[1].x + 0.3} y1={path.points[1].y - 0.3} x2={path.points[1].x - 0.3} y2={path.points[1].y + 0.3} stroke="#d4594b" strokeWidth="0.18" /></g>}
      </svg> : null}
      {elements.map((element) => {
        const spec = ELEMENT_SPECS[element.kind];
        const classes = ['canvas-element', selectedId === element.id ? 'is-selected' : '', (issueIds.has(element.id) || blockedElementIds.has(element.id)) && mode !== 'edit' ? 'is-overlap' : '', channelIds.has(element.id) && mode !== 'edit' ? 'is-channel' : '', boundsIds.has(element.id) ? 'is-out' : '', blockedElementIds.has(element.id) ? 'is-on-zone' : ''].filter(Boolean).join(' ');
        return <button key={element.id} type="button" className={classes} style={{ left: `${element.x / field.width * 100}%`, top: `${element.y / field.height * 100}%`, width: `${element.displayWidth / field.width * 100}%`, height: `${element.displayHeight / field.height * 100}%`, background: spec.color, transform: `rotate(${element.rotation}deg)` }}
          onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event); setDrag({ id: element.id, dx: point.x - element.x, dy: point.y - element.y }); onSelect(element.id); }}
          onPointerMove={(event) => { if (!drag || drag.id !== element.id) return; const point = pointFromEvent(event); onMove(element.id, point.x - drag.dx, point.y - drag.dy); }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}>
          <span className="element-icon">{spec.icon}</span><span className="element-name">{element.name}</span><small>{element.displayWidth.toFixed(1)} × {element.displayHeight.toFixed(1)} m</small>
          {((issueIds.has(element.id) || blockedElementIds.has(element.id)) && mode !== 'edit') ? <span className="issue-dot">!</span> : null}
        </button>;
      })}
      <div className="axis-hint">{drawing ? '拖出矩形以划出不可占用区域 · 再次点击按钮取消' : '拖动元素 · 点击选中'}</div>
      {routeBlocked && mode === 'path' ? <div className="route-blocked-banner">通行路线被不可占用区域阻断</div> : null}
    </div>
    <div className="canvas-actions-row">
      <button type="button" className={`draw-zone-button ${drawing ? 'is-active' : ''}`} onClick={() => { setDrawing((value) => !value); setDraft(null); onClearSelection(); }}><span>⊘</span>{drawing ? '取消划出' : '划出不可占用区域'}</button>
    </div>
    <div className="canvas-legend"><span><i className="legend-dot green" />可通行</span><span><i className="legend-dot coral" />需关注</span><span><i className="legend-swatch" />不可占用</span><span><i className="legend-line" />访问路径</span></div>
  </div>;
}
