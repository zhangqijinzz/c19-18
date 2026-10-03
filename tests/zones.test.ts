import { describe, expect, it } from 'vitest';
import {
  analyzeLayout,
  analyzePassability,
  canRotateElement,
  constrainElementMove,
  constrainElementResize,
  createPathPreview,
  findBlockedZoneIssues,
  findNarrowChannels,
} from '../src/domain';
import type { BlockedZone, ExpoElement, FieldSize } from '../src/types';

const FIELD: FieldSize = { width: 20, height: 12 };
const item = (id: string, x: number, y: number, width = 4, height = 3): ExpoElement => ({ id, kind: 'booth', name: id, x, y, width, height, rotation: 0 });
const zone = (id: string, x: number, y: number, width: number, height: number): BlockedZone => ({ id, name: id, x, y, width, height });

describe('blocked zone collision rules', () => {
  it('flags an element overlapping a blocked zone with the overlap area', () => {
    expect(findBlockedZoneIssues([item('a', 1, 1)], [zone('z1', 3, 2, 4, 4)]))
      .toEqual([{ elementId: 'a', zoneId: 'z1', amount: 4 }]);
  });

  it('does not flag an element merely touching a zone edge', () => {
    // 元素右边 x=5，禁区左边 x=5：边接触不算压占
    expect(findBlockedZoneIssues([item('a', 1, 1)], [zone('z1', 5, 1, 4, 4)])).toEqual([]);
  });

  it('measures narrow channels between an element and a blocked zone', () => {
    expect(findNarrowChannels([item('a', 1, 1)], [zone('z1', 5.5, 1, 4, 4)])).toEqual([
      { firstId: 'a', secondId: 'z1', zoneId: 'z1', gap: 0.5 },
    ]);
  });

  it('keeps channel results unchanged when no zones exist', () => {
    expect(findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)])).toEqual([
      { firstId: 'a', secondId: 'b', gap: 0.5 },
    ]);
  });
});

describe('move and resize constraints', () => {
  it('leaves movement completely untouched when there are no zones', () => {
    const element = item('a', 1, 1);
    expect(constrainElementMove(element, -3, 40, FIELD, [])).toEqual({ x: -3, y: 40 });
  });

  it('prevents a dragged element from covering a zone by sliding along it', () => {
    const element = item('a', 1, 1);
    // 想拖到 (3,2) 会压到禁区，应被推到禁区旁边的合法位置
    const result = constrainElementMove(element, 3, 2, FIELD, [zone('z1', 6, 2, 3, 3)]);
    const moved = { ...element, x: result.x, y: result.y };
    expect(findBlockedZoneIssues([moved], [zone('z1', 6, 2, 3, 3)])).toHaveLength(0);
    // 期望 x 应贴在禁区左侧（6 - 4 = 2），y 保持期望值 2
    expect(result).toEqual({ x: 2, y: 2 });
  });

  it('keeps the element inside the field while zones exist', () => {
    const result = constrainElementMove(item('a', 1, 1), -5, -5, FIELD, [zone('z1', 14, 8, 2, 2)]);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it('leaves the element where it was when no legal position exists', () => {
    // 一个几乎占满场地的禁区，只留一条放不进 4×3 元素的窄缝
    const result = constrainElementMove(item('a', 0, 0), 10, 5, FIELD, [zone('big', 0.5, 0, 19, 11.5)]);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('accepts a resize that clears the zones but rejects one that covers them', () => {
    const element = item('a', 1, 1);
    expect(constrainElementResize(element, 4, 3, FIELD, [zone('z1', 6, 1, 3, 3)])).toEqual({ width: 4, height: 3 });
    expect(constrainElementResize(element, 8, 3, FIELD, [zone('z1', 6, 1, 3, 3)])).toBeNull();
  });

  it('still rejects non-positive resize dimensions with zones present', () => {
    expect(constrainElementResize(item('a', 1, 1), 0, 3, FIELD, [zone('z1', 14, 8, 2, 2)])).toBeNull();
  });

  it('blocks rotation when the rotated footprint would cover a zone', () => {
    const tall = item('a', 1, 1, 2, 5);
    expect(canRotateElement(tall, FIELD, [zone('z1', 3, 1, 2, 2)])).toBe(false);
    expect(canRotateElement(tall, FIELD, [])).toBe(true);
  });
});

describe('passability analysis', () => {
  it('reports no accessibility issues without zones', () => {
    expect(analyzePassability(FIELD, [], [])).toEqual([]);
  });

  it('detects a zone wall splitting the walkable space in two', () => {
    // 一道贯穿上下的禁区墙，把场地切成两半
    const wall = zone('wall', 9, 0, 2, 12);
    const issues = analyzePassability(FIELD, [wall], []);
    expect(issues.some((issue) => issue.kind === 'space-split')).toBe(true);
  });

  it('does not report a split when the wall leaves a passage on one side', () => {
    const shortWall = zone('wall', 9, 0, 2, 10);
    expect(analyzePassability(FIELD, [shortWall], [])).toEqual([]);
  });

  it('warns when entrance and focus area end up in different components', () => {
    const wall = zone('wall', 9, 0, 2, 12);
    const entrance = { ...item('entry', 1, 5, 2, 1), kind: 'entrance' as const };
    const stage = { ...item('stage', 14, 4, 4, 3), kind: 'stage' as const };
    const issues = analyzePassability(FIELD, [wall], [entrance, stage]);
    expect(issues.some((issue) => issue.kind === 'route-blocked')).toBe(true);
  });

  it('finds a detour route around a partial obstacle and marks it reachable', () => {
    // 墙从下往上但顶部留有通道：原 L 形直线路线被挡，绕行应可达
    const wall = zone('wall', 8, 4, 2, 8);
    const entrance = { ...item('entry', 1, 5.5, 2, 1), kind: 'entrance' as const };
    const stage = { ...item('stage', 15, 5, 3, 2), kind: 'stage' as const };
    const preview = createPathPreview([entrance, stage], [wall], FIELD);
    expect(preview).not.toBeNull();
    expect(preview?.reachable).toBe(true);
    // 绕行路径的折点应绕过墙顶（y < 4）
    expect(preview?.points.some((point) => point.y <= 4)).toBe(true);
  });

  it('marks the route unreachable when a full wall blocks it', () => {
    const wall = zone('wall', 9, 0, 2, 12);
    const entrance = { ...item('entry', 1, 5.5, 2, 1), kind: 'entrance' as const };
    const stage = { ...item('stage', 14, 5, 3, 2), kind: 'stage' as const };
    const preview = createPathPreview([entrance, stage], [wall], FIELD);
    expect(preview?.reachable).toBe(false);
  });

  it('preserves the original elbow path behaviour exactly when no zones exist', () => {
    const entrance = { ...item('entry', 1, 5, 2, 1), kind: 'entrance' as const };
    const stage = { ...item('stage', 10, 2, 5, 3), kind: 'stage' as const };
    const preview = createPathPreview([entrance, stage]);
    expect(preview?.reachable).toBe(true);
    expect(preview?.points).toHaveLength(3);
    expect(preview?.distance).toBeGreaterThan(0);
  });

  it('surfaces zone issues inside the full analysis', () => {
    const document = {
      version: 2 as const,
      title: 'x',
      field: FIELD,
      blockedZones: [zone('wall', 9, 0, 2, 12)],
      elements: [
        { ...item('entry', 1, 5, 2, 1), kind: 'entrance' as const },
        { ...item('stage', 14, 4, 4, 3), kind: 'stage' as const },
      ],
    };
    const analysis = analyzeLayout(document);
    expect(analysis.accessibility.some((issue) => issue.kind === 'space-split')).toBe(true);
    expect(analysis.path?.reachable).toBe(false);
  });
});
