import { describe, expect, it } from 'vitest';
import {
  analyzeLayout,
  clampBoxPosition,
  clampBoxSize,
  findBoundsIssues,
  findNarrowChannels,
  findObstacleHits,
  getObstacles,
  obstacleBox,
} from '../src/domain';
import type { ExpoElement, LayoutDocument, Obstacle } from '../src/types';

const item = (id: string, x: number, y: number, width = 4, height = 3, kind: ExpoElement['kind'] = 'booth'): ExpoElement =>
  ({ id, kind, name: id, x, y, width, height, rotation: 0 });

const pillar = (id: string, x: number, y: number, width = 1, height = 1): Obstacle =>
  ({ id, kind: 'pillar', name: id, x, y, width, height });

const doc = (elements: ExpoElement[], obstacles: Obstacle[] = [], field = { width: 20, height: 12 }): LayoutDocument =>
  ({ version: 1, title: 'x', field, elements, obstacles });

describe('obstacle domain rules', () => {
  it('detects an element pressed onto a restricted zone', () => {
    expect(findObstacleHits([item('a', 1, 1, 4, 3)], [pillar('p', 4, 2, 1, 1)])).toEqual([
      { elementId: 'a', obstacleId: 'p', amount: 1 },
    ]);
  });

  it('counts obstacles in narrow channel checks', () => {
    // 元素右边 x=5，柱子左边 x=5.5，间隙 0.5 < 最小通道
    expect(findNarrowChannels([item('a', 1, 1)], [pillar('p', 5.5, 1.5, 1, 1)])).toEqual([
      { firstId: 'a', secondId: 'p', gap: 0.5 },
    ]);
  });

  it('flags obstacles that overflow the field', () => {
    const analysis = analyzeLayout(doc([], [pillar('p', 19.5, 0, 1, 1)]));
    expect(analysis.obstacleBounds).toEqual([{ obstacleId: 'p', overflow: 0.5 }]);
  });

  it('slides a dragged box out of a pillar instead of letting it overlap', () => {
    const solids = [obstacleBox(pillar('p', 8, 4, 2, 2))];
    // 水平拖动撞上柱子时沿拖动方向滑到柱边，而不是绕过柱子
    const moved = clampBoxPosition({ x: 6, y: 4, width: 4, height: 2 }, { x: 0, y: 4 }, { width: 20, height: 12 }, solids);
    expect(moved).toEqual({ x: 4, y: 4 });
    expect(moved.x + 4).toBeLessThanOrEqual(8);
  });

  it('slides along the drag axis preferentially and never leaves the field', () => {
    const solids = [obstacleBox(pillar('p', 9, 0, 2, 12))];
    const moved = clampBoxPosition({ x: 8, y: 2, width: 4, height: 3 }, { x: 2, y: 2 }, { width: 20, height: 12 }, solids);
    expect(moved.x).toBeLessThanOrEqual(5);
    expect(moved.y).toBe(2);
  });

  it('limits resize growth before it reaches a pillar (top-left anchored)', () => {
    const solids = [obstacleBox(pillar('p', 8, 2, 1, 1))];
    const fitted = clampBoxSize({ x: 3, y: 2 }, { width: 10, height: 10 }, { width: 20, height: 12 }, solids);
    expect(fitted.width).toBe(5);
    expect(fitted.height).toBeLessThanOrEqual(10);
  });
});

describe('navigation with obstacles', () => {
  const entrance = () => item('entry', 1, 5.25, 2, 1.5, 'entrance');
  const stage = () => item('stage', 15, 4, 4, 3, 'stage');

  it('keeps the legacy L-shaped path when no obstacles exist', () => {
    const analysis = analyzeLayout(doc([entrance(), stage()]));
    expect(analysis.partition).toBeNull();
    expect(analysis.path?.status).toBe('ok');
    expect(analysis.path?.points).toHaveLength(3);
  });

  it('routes around a pillar standing between entrance and stage', () => {
    // L 形折线的水平段 (y=6, x:3→17) 会穿过该柱子，新路线必须绕开
    const obstacles = [pillar('p', 9, 5, 2, 2)];
    const analysis = analyzeLayout(doc([entrance(), stage()], obstacles));
    expect(analysis.path?.status).toBe('ok');
    expect(analysis.path?.points.length).toBeGreaterThan(3);
    const hits = analysis.path?.points.some((point) => point.x >= 9 && point.x <= 11 && point.y >= 5 && point.y <= 7);
    expect(hits).toBe(false);
  });

  it('reports a blocked route when the wall cannot be bypassed', () => {
    // 竖墙从北墙到南墙，只留 1 栅格（0.4m）的墙缝——入口侧无法到达舞台侧
    const wall: Obstacle = { id: 'wall', kind: 'elevator', name: '货梯井', x: 10, y: 0, width: 9.6, height: 12 };
    const analysis = analyzeLayout(doc([entrance(), stage()], [wall]));
    expect(analysis.path?.status).toBe('blocked');
    expect(analysis.path?.points).toHaveLength(0);
    expect(analysis.partition).not.toBeNull();
  });

  it('warns as soon as obstacles split the traversable space in two', () => {
    // 一个从北到南贯穿的承重柱墙把场地切成两半
    const wall = pillar('wall', 9.5, 0, 1, 12);
    const analysis = analyzeLayout(doc([], [wall]));
    expect(analysis.partition?.regions).toBe(2);
    expect(analysis.partition?.strandedArea).toBeGreaterThan(80);
  });

  it('does not treat an existing rectangular document as an obstructed field', () => {
    const legacy = { version: 1 as const, title: 'old', field: { width: 20, height: 12 }, elements: [entrance(), stage()] };
    expect(getObstacles(legacy)).toEqual([]);
    const analysis = analyzeLayout(legacy);
    expect(analysis.obstacleHits).toEqual([]);
    expect(analysis.obstacleBounds).toEqual([]);
    expect(analysis.partition).toBeNull();
    expect(analysis.path?.status).toBe('ok');
  });

  it('still reports ordinary bounds issues unchanged on obstacle-free fields', () => {
    expect(findBoundsIssues({ width: 10, height: 10 }, [{ ...item('rotated', 8, 2, 2, 5), rotation: 90 }]))
      .toEqual([{ elementId: 'rotated', overflow: 3 }]);
  });
});
