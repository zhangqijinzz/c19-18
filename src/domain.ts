import type {
  AccessibilityIssue,
  Analysis,
  BlockedZone,
  BlockedZoneIssue,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  PathPreview,
  OverlapIssue,
} from './types';

export const MIN_CHANNEL = 1.2;
/** 连通性 / 寻路栅格边长（米） */
const GRID_CELL = 0.5;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const createStarterDocument = (): LayoutDocument => ({
  version: 2,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  blockedZones: [],
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
});

export const createElement = (kind: ElementKind, index: number, field: FieldSize): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  const offset = Math.min(index * 0.65, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset)),
    y: Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset)),
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const createBlockedZone = (index: number, field: FieldSize, zones: BlockedZone[]): BlockedZone => {
  // 默认 2×2 的承重柱，避开已有禁区、尽量落在场地中部偏左
  const width = 2;
  const height = 2;
  const preferredX = Math.round((field.width / 2 - 3 - index * 2.5) * 2) / 2;
  const preferredY = Math.round((field.height / 2 - 1) * 2) / 2;
  const candidate: BlockedZone = {
    id: `zone-${Date.now()}-${index}`,
    name: `不可占用区域 ${zones.length + 1}`,
    x: Math.max(0.5, Math.min(field.width - width - 0.5, preferredX)),
    y: Math.max(0.5, Math.min(field.height - height - 0.5, preferredY)),
    width,
    height,
  };
  return candidate;
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement): Rect & { width: number; height: number } => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

export const getZoneRect = (zone: BlockedZone): Rect => ({ left: zone.x, top: zone.y, right: zone.x + zone.width, bottom: zone.y + zone.height });

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

const rectOverlapArea = (first: Rect, second: Rect): number =>
  // 边/角接触（间距为 0）不算压占，元素可以紧贴禁区摆放
  (first.right > second.left && first.left < second.right && first.bottom > second.top && first.top < second.bottom)
    ? intersectionSize(first.left, first.right, second.left, second.right) * intersectionSize(first.top, first.bottom, second.top, second.bottom)
    : 0;

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const overlapX = intersectionSize(first.left, first.right, second.left, second.right);
      const overlapY = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      if (overlapX > 0 && overlapY > 0) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount: Number((overlapX * overlapY).toFixed(1)) });
      }
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: Number(overflow.toFixed(1)) }] : [];
  });

/** 元素与不可占用区域的压占 */
export const findBlockedZoneIssues = (elements: ExpoElement[], zones: BlockedZone[]): BlockedZoneIssue[] => {
  if (!zones.length) return [];
  const issues: BlockedZoneIssue[] = [];
  for (const element of elements) {
    const box = getBoundingBox(element);
    for (const zone of zones) {
      const amount = rectOverlapArea(box, getZoneRect(zone));
      if (amount > 0) issues.push({ elementId: element.id, zoneId: zone.id, amount: Number(amount.toFixed(1)) });
    }
  }
  return issues;
};

const gapBetweenRects = (first: Rect, second: Rect): number => {
  const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
  const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
  const horizontalGap = first.right <= second.left ? second.left - first.right : second.right <= first.left ? first.left - second.right : 0;
  const verticalGap = first.bottom <= second.top ? second.top - first.bottom : second.bottom <= first.top ? first.top - second.bottom : 0;
  return verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
};

export const findNarrowChannels = (elements: ExpoElement[], zones: BlockedZone[] = []): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const gap = gapBetweenRects(first, getBoundingBox(elements[j]));
      if (gap > 0 && gap < MIN_CHANNEL) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
    }
    // 元素与不可占用区域之间的净距同样属于可通行通道
    for (const zone of zones) {
      const gap = gapBetweenRects(first, getZoneRect(zone));
      if (gap > 0 && gap < MIN_CHANNEL) issues.push({ firstId: elements[i].id, secondId: zone.id, zoneId: zone.id, gap: Number(gap.toFixed(1)) });
    }
  }
  return issues;
};

/* ------------------------------------------------------------------ */
/* 连通性分析：把场地划成细栅格，禁区占格，对可通行格做洪水填充          */
/* ------------------------------------------------------------------ */

interface PassabilityGrid {
  cols: number;
  rows: number;
  cell: number;
  blocked: Uint8Array;
}

const buildGrid = (field: FieldSize, zones: BlockedZone[]): PassabilityGrid => {
  const cell = GRID_CELL;
  const cols = Math.max(1, Math.round(field.width / cell));
  const rows = Math.max(1, Math.round(field.height / cell));
  const blocked = new Uint8Array(cols * rows);
  const zoneRects = zones.map(getZoneRect);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      // 以格子中心是否落在禁区内判定该格不可通行（开区间：贴边墙不封死场地边界）
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      if (zoneRects.some((rect) => cx > rect.left && cx < rect.right && cy > rect.top && cy < rect.bottom)) {
        blocked[row * cols + col] = 1;
      }
    }
  }
  return { cols, rows, cell, blocked };
};

const cellAtPoint = (grid: PassabilityGrid, x: number, y: number): number => {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cell)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / grid.cell)));
  return row * grid.cols + col;
};

const floodComponents = (grid: PassabilityGrid): { count: number; componentOf: Int32Array } => {
  const { cols, rows, blocked } = grid;
  const componentOf = new Int32Array(cols * rows).fill(-1);
  let count = 0;
  for (let start = 0; start < blocked.length; start += 1) {
    if (blocked[start] || componentOf[start] !== -1) continue;
    const queue = [start];
    componentOf[start] = count;
    while (queue.length) {
      const index = queue.shift() as number;
      const col = index % cols;
      const row = (index - col) / cols;
      const neighbors = [index - 1, index + 1, index - cols, index + cols];
      if (col === 0) neighbors[0] = -1;
      if (col === cols - 1) neighbors[1] = -1;
      if (row === 0) neighbors[2] = -1;
      if (row === rows - 1) neighbors[3] = -1;
      for (const next of neighbors) {
        if (next >= 0 && !blocked[next] && componentOf[next] === -1) {
          componentOf[next] = count;
          queue.push(next);
        }
      }
    }
    count += 1;
  }
  return { count, componentOf };
};

/** 从 start 到 end 的 4 邻接最短路，返回网格中心点折线；不可达返回 null */
const shortestGridPath = (grid: PassabilityGrid, start: { x: number; y: number }, end: { x: number; y: number }): Array<{ x: number; y: number }> | null => {
  const { cols, blocked } = grid;
  const startCell = cellAtPoint(grid, start.x, start.y);
  const endCell = cellAtPoint(grid, end.x, end.y);
  if (blocked[startCell] || blocked[endCell]) return null;
  if (startCell === endCell) return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
  const previous = new Int32Array(blocked.length).fill(-2);
  previous[startCell] = -1;
  const queue = [startCell];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    if (index === endCell) break;
    const col = index % cols;
    const row = (index - col) / cols;
    const neighbors = [index - cols, index + cols, index - 1, index + 1];
    if (row === 0) neighbors[0] = -1;
    if (row === grid.rows - 1) neighbors[1] = -1;
    if (col === 0) neighbors[2] = -1;
    if (col === cols - 1) neighbors[3] = -1;
    for (const next of neighbors) {
      if (next >= 0 && !blocked[next] && previous[next] === -2) {
        previous[next] = index;
        queue.push(next);
      }
    }
  }
  if (previous[endCell] === -2) return null;
  const cellPath: number[] = [];
  let cursor = endCell;
  while (cursor !== -1) {
    cellPath.push(cursor);
    cursor = previous[cursor];
  }
  cellPath.reverse();
  // 用真实起止点替换首尾格子中心，并把共线段折叠成拐点
  const points = cellPath.map((cellIndex) => ({
    x: Number(((cellIndex % cols) + 0.5) * grid.cell),
    y: Number(((Math.floor(cellIndex / cols)) + 0.5) * grid.cell),
  }));
  points[0] = { x: start.x, y: start.y };
  points[points.length - 1] = { x: end.x, y: end.y };
  const simplified: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const before = points[i - 1];
    const after = points[i + 1];
    if (!before || !after || (Math.abs(before.x - point.x) > 1e-9 || Math.abs(after.x - point.x) > 1e-9) && (Math.abs(before.y - point.y) > 1e-9 || Math.abs(after.y - point.y) > 1e-9)) {
      simplified.push(point);
    }
  }
  return simplified;
};

const routeEndpoints = (elements: ExpoElement[]) => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  return {
    entrance,
    target,
    start: { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 },
    end: { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 },
  };
};

/**
 * 连通性结论：
 * - 禁区把可通行空间切成多块时给出 space-split
 * - 入口与重点区域落在不同连通块（或被压住）时给出 route-blocked
 */
export const analyzePassability = (field: FieldSize, zones: BlockedZone[], elements: ExpoElement[]): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  if (!zones.length) return issues;
  const grid = buildGrid(field, zones);
  const { count, componentOf } = floodComponents(grid);
  if (count > 1) {
    issues.push({ kind: 'space-split', message: `不可占用区域把可通行空间切成了 ${count} 块，部分区域将无法到达` });
  }
  const endpoints = routeEndpoints(elements);
  if (endpoints && count > 1) {
    const startCell = cellAtPoint(grid, endpoints.start.x, endpoints.start.y);
    const endCell = cellAtPoint(grid, endpoints.end.x, endpoints.end.y);
    if (grid.blocked[startCell] || grid.blocked[endCell] || componentOf[startCell] !== componentOf[endCell]) {
      issues.push({ kind: 'route-blocked', message: `${endpoints.entrance.name} 到 ${endpoints.target.name} 被不可占用区域阻断，没有可绕行的通路` });
    }
  }
  return issues;
};

const polylineDistance = (points: Array<{ x: number; y: number }>): number =>
  points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);

export const createPathPreview = (elements: ExpoElement[], zones: BlockedZone[] = [], field?: FieldSize): PathPreview | null => {
  const endpoints = routeEndpoints(elements);
  if (!endpoints) return null;
  const { start, end, entrance, target } = endpoints;
  // 没有禁区时保持原有折线行为完全不变
  if (!zones.length || !field) {
    const elbow = { x: end.x, y: start.y };
    return { points: [start, elbow, end], distance: Number((polylineDistance([start, elbow, end])).toFixed(1)), fromName: entrance.name, toName: target.name, reachable: true };
  }
  const grid = buildGrid(field, zones);
  const routed = shortestGridPath(grid, start, end);
  if (!routed) {
    return { points: [start, end], distance: 0, fromName: entrance.name, toName: target.name, reachable: false };
  }
  return { points: routed, distance: Number(polylineDistance(routed).toFixed(1)), fromName: entrance.name, toName: target.name, reachable: true };
};

export const analyzeLayout = (document: LayoutDocument): Analysis => {
  const zones = document.blockedZones ?? [];
  return {
    overlaps: findOverlaps(document.elements),
    bounds: findBoundsIssues(document.field, document.elements),
    channels: findNarrowChannels(document.elements, zones),
    zoneIssues: findBlockedZoneIssues(document.elements, zones),
    accessibility: analyzePassability(document.field, zones, document.elements),
    path: createPathPreview(document.elements, zones, document.field),
  };
};

/* ------------------------------------------------------------------ */
/* 放置约束：拖动 / 改尺寸都不能压到禁区，且必须在场地内（仅在有禁区时） */
/* ------------------------------------------------------------------ */

const rectAt = (x: number, y: number, width: number, height: number): Rect => ({ left: x, top: y, right: x + width, bottom: y + height });

export const canPlaceRect = (rect: Rect, field: FieldSize, zones: BlockedZone[]): boolean => {
  if (rect.left < 0 || rect.top < 0 || rect.right > field.width || rect.bottom > field.height) return false;
  return zones.every((zone) => rectOverlapArea(rect, getZoneRect(zone)) === 0);
};

const placementCandidates = (desiredX: number, desiredY: number, width: number, height: number, field: FieldSize, zones: BlockedZone[], current: { x: number; y: number }): Array<{ x: number; y: number }> => {
  const raw = [
    { x: desiredX, y: desiredY },
    { x: current.x, y: desiredY },
    { x: desiredX, y: current.y },
    { x: current.x, y: current.y },
  ];
  // 贴着禁区边缘滑动：只在元素当前所在的一侧给出停靠点，避免拖动物件穿过禁区跳到另一侧
  for (const zone of zones) {
    const rect = getZoneRect(zone);
    const overlaps = current.x + width > rect.left && current.x < rect.right && current.y + height > rect.top && current.y < rect.bottom;
    const edgeSnaps: number[] = [];
    if (overlaps) {
      // 元素已被禁区压住（如禁区后画）：朝指针方向提供最近的逃离边，保证元素总能被拖出
      edgeSnaps.push(Number((rect.left - width).toFixed(1)), Number(rect.right.toFixed(1)));
    } else if (current.x + width <= rect.left) edgeSnaps.push(Number((rect.left - width).toFixed(1)));
    else if (current.x >= rect.right) edgeSnaps.push(Number(rect.right.toFixed(1)));
    for (const snapX of edgeSnaps) {
      raw.push({ x: snapX, y: desiredY });
      raw.push({ x: snapX, y: current.y });
    }
    const verticalSnaps: number[] = [];
    if (overlaps) {
      verticalSnaps.push(Number((rect.top - height).toFixed(1)), Number(rect.bottom.toFixed(1)));
    } else if (current.y + height <= rect.top) verticalSnaps.push(Number((rect.top - height).toFixed(1)));
    else if (current.y >= rect.bottom) verticalSnaps.push(Number(rect.bottom.toFixed(1)));
    for (const snapY of verticalSnaps) {
      raw.push({ x: desiredX, y: snapY });
      raw.push({ x: current.x, y: snapY });
    }
    if (overlaps) {
      for (const snapX of edgeSnaps) for (const snapY of verticalSnaps) raw.push({ x: snapX, y: snapY });
    } else if (edgeSnaps.length && verticalSnaps.length) {
      raw.push({ x: edgeSnaps[0], y: verticalSnaps[0] });
    }
  }
  const seen = new Set<string>();
  return raw.filter((candidate) => {
    const key = `${candidate.x},${candidate.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return canPlaceRect(rectAt(candidate.x, candidate.y, width, height), field, zones);
  });
};

/** 拖动约束：无禁区时原样返回期望位置；有禁区时沿障碍滑动到最近的合法位置 */
export const constrainElementMove = (
  element: ExpoElement,
  desiredX: number,
  desiredY: number,
  field: FieldSize,
  zones: BlockedZone[],
): { x: number; y: number } => {
  if (!zones.length) return { x: desiredX, y: desiredY };
  const box = getBoundingBox(element);
  const candidates = placementCandidates(desiredX, desiredY, box.width, box.height, field, zones, { x: element.x, y: element.y });
  if (!candidates.length) return { x: element.x, y: element.y };
  return candidates.reduce((best, candidate) =>
    Math.hypot(candidate.x - desiredX, candidate.y - desiredY) < Math.hypot(best.x - desiredX, best.y - desiredY) ? candidate : best,
  );
};

/** 改尺寸约束：保持左上角固定，新尺寸压禁区或超出场地时返回 null，由调用方拒绝 */
export const constrainElementResize = (
  element: ExpoElement,
  width: number,
  height: number,
  field: FieldSize,
  zones: BlockedZone[],
): { width: number; height: number } | null => {
  if (width <= 0 || height <= 0) return null;
  if (!zones.length) return { width, height };
  return canPlaceRect(rectAt(element.x, element.y, width, height), field, zones) ? { width, height } : null;
};

/** 旋转后是否会压到禁区 */
export const canRotateElement = (element: ExpoElement, field: FieldSize, zones: BlockedZone[]): boolean => {
  if (!zones.length) return true;
  const rotated = { ...element, rotation: normalizeRotation(element.rotation + 90) };
  const box = getBoundingBox(rotated);
  return canPlaceRect(box, field, zones);
};

export const isValidZone = (zone: BlockedZone, field: FieldSize): boolean =>
  zone.width > 0 && zone.height > 0 && zone.x < field.width && zone.y < field.height && zone.x + zone.width > 0 && zone.y + zone.height > 0;

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const findZone = (document: LayoutDocument, id: string | null) => (document.blockedZones ?? []).find((zone) => zone.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
