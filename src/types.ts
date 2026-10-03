export type ElementKind = 'booth' | 'stage' | 'seating' | 'entrance';
export type LayoutMode = 'edit' | 'inspect' | 'path';
export type ViewPhase = 'loading' | 'ready' | 'error';

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

export interface RenderElement extends ExpoElement {
  displayWidth: number;
  displayHeight: number;
  occupiedArea: number;
}

export interface FieldSize {
  width: number;
  height: number;
}

/**
 * 场地内不可占用区域：承重柱、货梯井、配电间等固定结构。
 * 元素不能压到其上，通道与路线分析也会将其视为障碍。
 */
export interface BlockedZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutDocument {
  version: 2;
  title: string;
  field: FieldSize;
  elements: ExpoElement[];
  blockedZones: BlockedZone[];
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

export interface OverlapIssue {
  firstId: string;
  secondId: string;
  amount: number;
}

export interface BoundsIssue {
  elementId: string;
  overflow: number;
}

/** 通道过窄问题；zoneId 存在时表示另一侧是不可占用区域 */
export interface ChannelIssue {
  firstId: string;
  secondId: string;
  gap: number;
  zoneId?: string;
}

/** 元素压到不可占用区域 */
export interface BlockedZoneIssue {
  elementId: string;
  zoneId: string;
  amount: number;
}

/** 可通行空间的连通性问题（禁区把场地切断等） */
export interface AccessibilityIssue {
  kind: 'space-split' | 'route-blocked';
  message: string;
}

export interface PathPreview {
  points: Array<{ x: number; y: number }>;
  distance: number;
  fromName: string;
  toName: string;
  /** 路线是否真的能绕开障碍抵达目标 */
  reachable: boolean;
}

export interface Analysis {
  overlaps: OverlapIssue[];
  bounds: BoundsIssue[];
  channels: ChannelIssue[];
  zoneIssues: BlockedZoneIssue[];
  accessibility: AccessibilityIssue[];
  path: PathPreview | null;
}

export interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
