import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

describe('ExpoSketchViewModel', () => {
  it('initializes and updates the selected layout', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count + 1);
    expect(vm.state.selectedId).toContain('booth-');
  });

  it('updates analysis immediately after moving an element into an overlap', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('recovers the example if repository loading fails', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => { throw new Error('bad storage'); }), save: vi.fn(async () => {}) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.document.title).toContain('春日创意市集');
  });

  it('shows a save error without dropping the working document', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => createStarterDocument()), save: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.addElement('stage');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vm.state.document.elements.some((element) => element.kind === 'stage' && element.id.startsWith('stage-'))).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });

  it('ignores invalid dimensions instead of corrupting the working selection', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.document.elements[0].width;
    vm.resizeSelected(0, 0);
    expect(vm.state.document.elements[0].width).toBe(before);
  });

  it('keeps a dragged element off restricted zones and warns about the slide', async () => {
    const document: LayoutDocument = {
      version: 1,
      title: 'obstructed',
      field: { width: 24, height: 16 },
      obstacles: [{ id: 'pillar-1', kind: 'pillar', name: '承重柱 1', x: 10, y: 6, width: 1, height: 1 }],
      elements: [{ id: 'booth-1', kind: 'booth', name: '展位', x: 2, y: 5, width: 4, height: 3, rotation: 0 }],
    };
    const vm = new ExpoSketchViewModel(fakeRepository(document));
    await vm.initialize();
    vm.selectElement('booth-1');
    // 请求位置 (8,5) 的盒子会压住 x=10 的柱子，应自动滑到最近的可行位置
    vm.moveElement('booth-1', 8, 5);
    const moved = vm.state.document.elements[0];
    // 无论滑向哪一侧，盒子都不得与柱子 (10,6)-(11,7) 相交
    const separated = moved.x + moved.width <= 10 || moved.x >= 11 || moved.y + moved.height <= 6 || moved.y >= 7;
    expect(separated).toBe(true);
    expect(vm.state.analysis.obstacleHits).toHaveLength(0);
    expect(vm.state.notice.tone).toBe('warning');
  });

  it('caps resizing before the element reaches a pillar', async () => {
    const document: LayoutDocument = {
      version: 1,
      title: 'obstructed',
      field: { width: 24, height: 16 },
      obstacles: [{ id: 'pillar-1', kind: 'pillar', name: '承重柱 1', x: 9, y: 2, width: 1, height: 1 }],
      elements: [{ id: 'booth-1', kind: 'booth', name: '展位', x: 3, y: 2, width: 4, height: 3, rotation: 0 }],
    };
    const vm = new ExpoSketchViewModel(fakeRepository(document));
    await vm.initialize();
    vm.selectElement('booth-1');
    vm.resizeSelected(10, 3);
    expect(vm.state.document.elements[0].width).toBe(6);
    expect(vm.state.analysis.obstacleHits).toHaveLength(0);
  });

  it('warns immediately when a dragged wall splits the field into two regions', async () => {
    const document: LayoutDocument = {
      version: 1,
      title: 'split',
      field: { width: 20, height: 12 },
      obstacles: [{ id: 'wall', kind: 'elevator', name: '货梯井', x: 9.5, y: 0, width: 1, height: 4 }],
      elements: [],
    };
    const vm = new ExpoSketchViewModel(fakeRepository(document));
    await vm.initialize();
    expect(vm.state.analysis.partition).toBeNull();
    // 向下拖到贯穿南北，把可通行空间切成两半
    vm.moveObstacle('wall', 9.5, 0);
    vm.resizeObstacleById('wall', 1, 12);
    expect(vm.state.analysis.partition?.regions).toBe(2);
    expect(vm.state.notice.tone).toBe('warning');
    expect(vm.state.notice.message).toContain('切成');
  });

  it('places newly added elements in free space and can add and remove obstacles', async () => {
    const document: LayoutDocument = {
      version: 1,
      title: 'obstructed',
      field: { width: 24, height: 16 },
      obstacles: [{ id: 'pillar-1', kind: 'pillar', name: '承重柱 1', x: 11.5, y: 6, width: 1, height: 4 }],
      elements: [],
    };
    const vm = new ExpoSketchViewModel(fakeRepository(document));
    await vm.initialize();
    vm.addElement('booth');
    expect(vm.state.analysis.obstacleHits).toHaveLength(0);
    vm.addObstacle('electrical');
    expect(vm.state.document.obstacles ?? []).toHaveLength(2);
    const newId = (vm.state.document.obstacles ?? [])[1].id;
    vm.removeObstacle(newId);
    expect(vm.state.document.obstacles ?? []).toHaveLength(1);
  });
});
