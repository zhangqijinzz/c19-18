import type {
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  Obstacle,
  ObstacleBoundsIssue,
  ObstacleIssue,
  ObstacleKind,
  ObstacleSpec,
  OverlapIssue,
} from './types';
import { analyzeNavigation } from './navigation';

export const MIN_CHANNEL = 1.2;

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  pillar: { kind: 'pillar', label: '承重柱', eyebrow: 'PILLAR', icon: '▞', width: 1, height: 1 },
  elevator: { kind: 'elevator', label: '货梯井', eyebrow: 'SHAFT', icon: '▣', width: 3, height: 2.5 },
  electrical: { kind: 'electrical', label: '配电间', eyebrow: 'ELECTRICAL', icon: '⚡', width: 2.5, height: 2 },
};

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const getObstacles = (document: LayoutDocument): Obstacle[] => document.obstacles ?? [];

export const boxOf = (x: number, y: number, width: number, height: number): Box => ({ left: x, top: y, right: x + width, bottom: y + height });

export const obstacleBox = (obstacle: Obstacle): Box => boxOf(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

export const createStarterDocument = (): LayoutDocument => ({
  version: 1,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  obstacles: [],
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
});

const round1 = (value: number) => Number(value.toFixed(1));

export const createElement = (kind: ElementKind, index: number, field: FieldSize): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  const offset = Math.min(index * 0.65, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: round1(Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset))),
    y: round1(Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset))),
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const createObstacle = (kind: ObstacleKind, index: number, field: FieldSize): Obstacle => {
  const spec = OBSTACLE_SPECS[kind];
  const offset = Math.min(index * 0.8, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: round1(Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset))),
    y: round1(Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset))),
    width: spec.width,
    height: spec.height,
  };
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement): Box => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height };
};

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

const boxesOverlap = (first: Box, second: Box) =>
  intersectionSize(first.left, first.right, second.left, second.right) > 0
    && intersectionSize(first.top, first.bottom, second.top, second.bottom) > 0;

const overlapArea = (first: Box, second: Box) =>
  round1(intersectionSize(first.left, first.right, second.left, second.right) * intersectionSize(first.top, first.bottom, second.top, second.bottom));

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const amount = overlapArea(first, second);
      if (amount > 0) issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount });
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: round1(overflow) }] : [];
  });

/** 不可占用区域本身也必须落在场地内 */
export const findObstacleBoundsIssues = (field: FieldSize, obstacles: Obstacle[]): ObstacleBoundsIssue[] =>
  obstacles.flatMap((obstacle) => {
    const box = obstacleBox(obstacle);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ obstacleId: obstacle.id, overflow: round1(overflow) }] : [];
  });

/** 元素压到不可占用区域 */
export const findObstacleHits = (elements: ExpoElement[], obstacles: Obstacle[]): ObstacleIssue[] =>
  obstacles.length === 0 ? [] : elements.flatMap((element) => {
    const elementBox = getBoundingBox(element);
    return obstacles.flatMap((obstacle) => {
      const amount = overlapArea(elementBox, obstacleBox(obstacle));
      return amount > 0 ? [{ elementId: element.id, obstacleId: obstacle.id, amount }] : [];
    });
  });

/** 通道宽度检查：元素之间、元素与不可占用区域之间都要保持最小通道 */
export const findNarrowChannels = (elements: ExpoElement[], obstacles: Obstacle[] = []): ChannelIssue[] => {
  const solids: Array<{ id: string; box: Box }> = [
    ...elements.map((element) => ({ id: element.id, box: getBoundingBox(element) })),
    ...obstacles.map((obstacle) => ({ id: obstacle.id, box: obstacleBox(obstacle) })),
  ];
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < solids.length; i += 1) {
    for (let j = i + 1; j < solids.length; j += 1) {
      const first = solids[i].box;
      const second = solids[j].box;
      const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
      const horizontalGap = first.right <= second.left ? second.left - first.right : second.right <= first.left ? first.left - second.right : 0;
      const verticalGap = first.bottom <= second.top ? second.top - first.bottom : second.bottom <= first.top ? first.top - second.bottom : 0;
      const gap = verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
      if (gap > 0 && gap < MIN_CHANNEL) issues.push({ firstId: solids[i].id, secondId: solids[j].id, gap: round1(gap) });
    }
  }
  return issues;
};

/**
 * 把一个指定尺寸的矩形钳制到场地内、且不与任何固定实体相交的位置。
 * 拖动时使用：先沿轴向滑出实体，找不到可行位置时退回原位置。
 */
export const clampBoxPosition = (
  target: { x: number; y: number; width: number; height: number },
  start: { x: number; y: number },
  field: FieldSize,
  solids: Box[],
): { x: number; y: number } => {
  const fit = (x: number, y: number) => {
    const candidate = boxOf(x, y, target.width, target.height);
    if (candidate.left < 0 || candidate.top < 0 || candidate.right > field.width || candidate.bottom > field.height) return false;
    return solids.every((solid) => !boxesOverlap(candidate, solid));
  };

  const x = Math.min(Math.max(0, target.x), Math.max(0, field.width - target.width));
  const y = Math.min(Math.max(0, target.y), Math.max(0, field.height - target.height));

  const candidates = new Set<string>();
  const xs = [x];
  const ys = [y];
  solids.forEach((solid) => {
    xs.push(solid.left - target.width, solid.right);
    ys.push(solid.top - target.height, solid.bottom);
  });

  for (const cx of xs) {
    for (const cy of ys) {
      candidates.add(`${round1(cx)},${y}`);
      candidates.add(`${x},${round1(cy)}`);
      candidates.add(`${round1(cx)},${round1(cy)}`);
    }
  }

  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSideStep = Number.POSITIVE_INFINITY;
  // 主拖动方向：等距候选里优先沿该方向滑动，减少垂直方向的意外偏移
  const motionX = Math.abs(target.x - start.x);
  const motionY = Math.abs(target.y - start.y);
  candidates.forEach((key) => {
    const [cx, cy] = key.split(',').map(Number);
    if (!fit(cx, cy)) return;
    const dist = Math.hypot(cx - target.x, cy - target.y);
    const sideStep = motionX >= motionY ? Math.abs(cy - start.y) : Math.abs(cx - start.x);
    if (dist < bestDistance || (dist === bestDistance && sideStep < bestSideStep)) {
      bestDistance = dist;
      bestSideStep = sideStep;
      best = { x: round1(cx), y: round1(cy) };
    }
  });

  if (best) return best;
  return fit(start.x, start.y) ? { x: round1(start.x), y: round1(start.y) } : { x: round1(x), y: round1(y) };
};

/**
 * 改尺寸时（左上角固定）返回不越界、不压实体的最大宽高。
 * 最多两轮即可在宽、高限制之间收敛。
 */
export const clampBoxSize = (
  origin: { x: number; y: number },
  requested: { width: number; height: number },
  field: FieldSize,
  solids: Box[],
): { width: number; height: number } => {
  let width = Math.min(requested.width, field.width - origin.x);
  let height = Math.min(requested.height, field.height - origin.y);

  for (let pass = 0; pass < 2; pass += 1) {
    const nextWidth = solids.reduce((limit, solid) => {
      // 实体在锚点左/上方不限制向右下扩展
      if (solid.right <= origin.x || solid.bottom <= origin.y) return limit;
      const verticalOverlap = intersectionSize(origin.y, origin.y + height, solid.top, solid.bottom);
      if (verticalOverlap > 0 && solid.left > origin.x) return Math.min(limit, solid.left - origin.x);
      return limit;
    }, width);
    width = Math.max(0.1, nextWidth);

    const nextHeight = solids.reduce((limit, solid) => {
      if (solid.right <= origin.x || solid.bottom <= origin.y) return limit;
      const horizontalOverlap = intersectionSize(origin.x, origin.x + width, solid.left, solid.right);
      if (horizontalOverlap > 0 && solid.top > origin.y) return Math.min(limit, solid.top - origin.y);
      return limit;
    }, height);
    height = Math.max(0.1, nextHeight);
  }

  return { width: round1(width), height: round1(height) };
};

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const findObstacle = (document: LayoutDocument, id: string | null) => getObstacles(document).find((obstacle) => obstacle.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;

export const analyzeLayout = (document: LayoutDocument): Analysis => {
  const obstacles = getObstacles(document);
  const navigation = analyzeNavigation(document);
  return {
    overlaps: findOverlaps(document.elements),
    bounds: findBoundsIssues(document.field, document.elements),
    channels: obstacles.length === 0
      ? findNarrowChannels(document.elements)
      : findNarrowChannels(document.elements, obstacles),
    obstacleHits: findObstacleHits(document.elements, obstacles),
    obstacleBounds: findObstacleBoundsIssues(document.field, obstacles),
    partition: navigation.partition,
    path: navigation.path,
  };
};

export const countAnalysisIssues = (analysis: Analysis): number =>
  analysis.overlaps.length
  + analysis.bounds.length
  + analysis.channels.length
  + analysis.obstacleHits.length
  + analysis.obstacleBounds.length
  + (analysis.partition ? 1 : 0)
  + (analysis.path?.status === 'blocked' ? 1 : 0);
