import { describe, expect, it } from 'vitest';
import { createStarterDocument } from '../src/domain';
import { LocalLayoutRepository, normalizeDocument } from '../src/repository';
import { BrowserStorageService } from '../src/storageService';
import type { LayoutDocument } from '../src/types';

describe('LocalLayoutRepository', () => {
  it('falls back to the starter document when persisted JSON is damaged', async () => {
    window.localStorage.setItem('exposketch.document.v1', '{broken-json');
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    expect(await repository.load()).toEqual(createStarterDocument());
    window.localStorage.clear();
  });

  it('opens a legacy rectangular layout (no obstacles field) as an obstacle-free field', () => {
    const legacy = { version: 1, title: '旧方案', field: { width: 24, height: 16 }, elements: [] };
    const normalized = normalizeDocument(legacy);
    expect(normalized?.obstacles).toEqual([]);
    expect(normalized?.field.width).toBe(24);
  });

  it('round-trips documents containing restricted zones', () => {
    const withObstacles: LayoutDocument = {
      ...createStarterDocument(),
      obstacles: [
        { id: 'pillar-1', kind: 'pillar', name: '中柱', x: 13, y: 8, width: 1, height: 1 },
        { id: 'elevator-1', kind: 'elevator', name: '货梯井', x: 20, y: 12, width: 3, height: 2.5 },
      ],
    };
    expect(normalizeDocument(withObstacles)).toEqual(withObstacles);
  });

  it('rejects documents whose obstacles are malformed rather than guessing', () => {
    const bad = { ...createStarterDocument(), obstacles: [{ id: 'x', kind: 'unknown', name: 'x', x: 1, y: 1, width: 1, height: 1 }] };
    expect(normalizeDocument(bad)).toBeNull();
  });
});
