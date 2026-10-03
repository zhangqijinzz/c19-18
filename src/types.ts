export type ElementKind = 'booth' | 'stage' | 'seating' | 'entrance';
export type ObstacleKind = 'pillar' | 'elevator' | 'electrical';
export type LayoutMode = 'edit' | 'inspect' | 'path';
export type ViewPhase = 'loading' | 'ready' | 'error';
export type RouteStatus = 'ok' | 'blocked';

export interface ExpoElement {
  id: string;
  kind: ElementKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** 不可占用区域：承重柱、货梯井、配电间等，轴对齐且不可旋转 */
export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderElement extends ExpoElement {
  displayWidth: number;
  displayHeight: number;
  occupiedArea: number;
}

export interface FieldSize {
  width: number;
  height: number;
}

export interface LayoutDocument {
  version: 1;
  title: string;
  field: FieldSize;
  elements: ExpoElement[];
  /** 缺省视为空数组：旧版本保存的矩形布局打开后仍是无障碍物场地 */
  obstacles?: Obstacle[];
}

export interface ElementSpec {
  kind: ElementKind;
  label: string;
  eyebrow: string;
  icon: string;
  color: string;
  width: number;
  height: number;
}

export interface ObstacleSpec {
  kind: ObstacleKind;
  label: string;
  eyebrow: string;
  icon: string;
  width: number;
  height: number;
}

export interface OverlapIssue {
  firstId: string;
  secondId: string;
  amount: number;
}

export interface BoundsIssue {
  elementId: string;
  overflow: number;
}

export interface ObstacleBoundsIssue {
  obstacleId: string;
  overflow: number;
}

export interface ChannelIssue {
  firstId: string;
  secondId: string;
  gap: number;
}

/** 元素压到不可占用区域 */
export interface ObstacleIssue {
  elementId: string;
  obstacleId: string;
  amount: number;
}

/** 不可占用区域把可通行空间切成多个互不连通的区域 */
export interface PartitionIssue {
  regions: number;
  /** 无法从最大连通区到达的可通行面积（m²） */
  strandedArea: number;
}

export interface PathPreview {
  points: Array<{ x: number; y: number }>;
  distance: number;
  fromName: string;
  toName: string;
  /** 终点中心，blocked 时用于在平面图上标注无法到达的位置 */
  end: { x: number; y: number };
  /** blocked 时 points 为空，表示路线被不可占用区域切断且无法绕行 */
  status: RouteStatus;
}

export interface Analysis {
  overlaps: OverlapIssue[];
  bounds: BoundsIssue[];
  channels: ChannelIssue[];
  obstacleHits: ObstacleIssue[];
  obstacleBounds: ObstacleBoundsIssue[];
  partition: PartitionIssue | null;
  path: PathPreview | null;
}

export interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
