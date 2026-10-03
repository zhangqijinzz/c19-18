import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import { LocalLayoutRepository, migrateDocument } from '../src/repository';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (): LayoutRepository => ({
  load: vi.fn(async () => createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

const documentWithWall = (): LayoutDocument => ({
  version: 2,
  title: 'wall test',
  field: { width: 20, height: 12 },
  blockedZones: [{ id: 'wall', name: '承重柱墙', x: 9, y: 0, width: 2, height: 12 }],
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 5.5, width: 2, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '舞台', x: 14, y: 4, width: 4, height: 3, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '展位', x: 3, y: 1, width: 4, height: 3, rotation: 0 },
  ],
});

describe('blocked zones in the view model', () => {
  it('adds a blocked zone that persists in the document', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), createStarterDocument());
    vm.addBlockedZone();
    expect(vm.state.document.blockedZones).toHaveLength(1);
    expect(vm.state.selectedZone).not.toBeNull();
  });

  it('constrains dragging so elements cannot cover a zone', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), documentWithWall());
    // booth-1 (4 宽) 想拖到 x=8，会压到 x=9 的墙；应被挡在墙左侧 5
    vm.selectElement('booth-1');
    vm.moveElement('booth-1', 8, 1);
    const moved = vm.state.document.elements.find((element) => element.id === 'booth-1');
    expect(moved?.x).toBe(5);
    expect((moved?.x ?? 0) + (moved?.width ?? 0)).toBeLessThanOrEqual(9);
  });

  it('rejects a resize that would cover a zone and keeps the old size', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), documentWithWall());
    vm.selectElement('booth-1');
    const before = vm.state.document.elements.find((element) => element.id === 'booth-1')?.width;
    vm.resizeSelected(12, 3);
    const after = vm.state.document.elements.find((element) => element.id === 'booth-1')?.width;
    expect(after).toBe(before);
    expect(vm.state.notice.tone).toBe('warning');
  });

  it('warns immediately after drawing a zone that splits the walkable space', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), documentWithWall());
    expect(vm.state.analysis.accessibility.some((issue) => issue.kind === 'space-split')).toBe(true);
    expect(vm.state.analysis.accessibility.some((issue) => issue.kind === 'route-blocked')).toBe(true);
    expect(vm.state.analysis.path?.reachable).toBe(false);
  });

  it('keeps movement behaviour identical to a plain rectangle when no zones exist', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), createStarterDocument());
    vm.moveElement('stage-1', -20, -20);
    const moved = vm.state.document.elements.find((element) => element.id === 'stage-1');
    expect(moved?.x).toBe(-20);
    expect(moved?.y).toBe(-20);
  });

  it('removes a zone and clears the split warning', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), documentWithWall());
    vm.removeZone('wall');
    expect(vm.state.document.blockedZones).toHaveLength(0);
    expect(vm.state.analysis.accessibility).toHaveLength(0);
    expect(vm.state.analysis.path?.reachable).toBe(true);
  });

  it('keeps zones inside the field and disjoint when dragged', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), createStarterDocument());
    vm.addBlockedZone();
    const id = vm.state.document.blockedZones[0].id;
    vm.moveZone(id, -10, -10);
    const moved = vm.state.document.blockedZones[0];
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
  });

  it('refuses to draw a zone that covers an existing element', () => {
    const vm = new ExpoSketchViewModel(fakeRepository(), documentWithWall());
    // stage-1 位于 x=14..18, y=4..7，直接在其上划禁区应被拒绝
    const before = vm.state.document.blockedZones.length;
    vm.addBlockedZoneRect(13, 3, 6, 5);
    expect(vm.state.document.blockedZones).toHaveLength(before);
    expect(vm.state.notice.tone).toBe('warning');
  });

  it('migrated v1 documents behave as a field without any blocked areas', async () => {
    const v1 = {
      version: 1,
      title: 'old rectangle',
      field: { width: 20, height: 12 },
      elements: [{ id: 'b1', kind: 'booth', name: 'b1', x: 1, y: 1, width: 4, height: 3, rotation: 0 }],
      // 旧矩形存档里即使混入了禁区字段也必须被忽略，不能当成有障碍的场地
      blockedZones: [{ id: 'injected', name: 'evil', x: 0, y: 0, width: 10, height: 10 }],
    };
    const migrated = migrateDocument(v1);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(2);
    expect(migrated?.blockedZones).toEqual([]);

    const storage = { read: vi.fn(async () => v1), write: vi.fn(async () => {}) };
    const repository = new LocalLayoutRepository(storage as unknown as ConstructorParameters<typeof LocalLayoutRepository>[0]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.document.blockedZones).toEqual([]);
    expect(vm.state.analysis.zoneIssues).toEqual([]);
    expect(vm.state.analysis.accessibility).toEqual([]);
    // 旧矩形布局的移动行为与以前完全一致
    vm.moveElement('b1', -20, -20);
    const moved = vm.state.document.elements[0];
    expect(moved.x).toBe(-20);
    expect(moved.y).toBe(-20);
  });
});
