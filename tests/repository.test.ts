import { describe, expect, it } from 'vitest';
import { createStarterDocument } from '../src/domain';
import { LocalLayoutRepository, migrateDocument } from '../src/repository';
import { BrowserStorageService } from '../src/storageService';

describe('LocalLayoutRepository', () => {
  it('falls back to the starter document when persisted JSON is damaged', async () => {
    window.localStorage.setItem('exposketch.document.v1', '{broken-json');
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    expect(await repository.load()).toEqual(createStarterDocument());
    window.localStorage.clear();
  });

  it('migrates a v1 rectangle document to v2 with no blocked zones', () => {
    const v1 = {
      version: 1,
      title: 'legacy hall',
      field: { width: 24, height: 16 },
      elements: [{ id: 'b1', kind: 'booth', name: '展位', x: 1, y: 1, width: 4, height: 3, rotation: 0 }],
    };
    expect(migrateDocument(v1)).toEqual({ version: 2, title: 'legacy hall', field: { width: 24, height: 16 }, elements: v1.elements, blockedZones: [] });
  });

  it('ignores any blockedZones smuggled into a v1 document', () => {
    const v1 = {
      version: 1,
      title: 'legacy hall',
      field: { width: 24, height: 16 },
      elements: [],
      blockedZones: [{ id: 'z1', name: '柱', x: 0, y: 0, width: 5, height: 5 }],
    };
    expect(migrateDocument(v1)?.blockedZones).toEqual([]);
  });

  it('loads valid v2 zones and drops malformed ones', () => {
    const v2 = {
      version: 2,
      title: 'with columns',
      field: { width: 24, height: 16 },
      elements: [],
      blockedZones: [
        { id: 'z1', name: '承重柱', x: 3, y: 3, width: 2, height: 2 },
        { id: 'bad', name: 123 },
      ],
    };
    const migrated = migrateDocument(v2);
    expect(migrated?.blockedZones).toEqual([{ id: 'z1', name: '承重柱', x: 3, y: 3, width: 2, height: 2 }]);
  });

  it('clamps v2 zones that overflow the field', () => {
    const v2 = {
      version: 2,
      title: 'overflow',
      field: { width: 10, height: 10 },
      elements: [],
      blockedZones: [{ id: 'z1', name: '井道', x: 8, y: 8, width: 6, height: 6 }],
    };
    expect(migrateDocument(v2)?.blockedZones).toEqual([{ id: 'z1', name: '井道', x: 8, y: 8, width: 2, height: 2 }]);
  });
});
