import { createStarterDocument } from './domain';
import type { DocumentStorageService } from './storageService';
import type { BlockedZone, ExpoElement, FieldSize, LayoutDocument } from './types';

export interface LayoutRepository {
  load(): Promise<LayoutDocument>;
  save(document: LayoutDocument): Promise<void>;
}

const isElement = (value: unknown): value is ExpoElement => {
  if (!value || typeof value !== 'object') return false;
  const element = value as Record<string, unknown>;
  return typeof element.id === 'string' && typeof element.kind === 'string' && typeof element.x === 'number' && typeof element.y === 'number' && typeof element.width === 'number' && typeof element.height === 'number' && typeof element.rotation === 'number';
};

const isFieldSize = (value: unknown): value is FieldSize => {
  if (!value || typeof value !== 'object') return false;
  const field = value as Record<string, unknown>;
  return typeof field.width === 'number' && typeof field.height === 'number';
};

const isZone = (value: unknown): value is BlockedZone => {
  if (!value || typeof value !== 'object') return false;
  const zone = value as Record<string, unknown>;
  return typeof zone.id === 'string' && typeof zone.name === 'string' && typeof zone.x === 'number' && typeof zone.y === 'number' && typeof zone.width === 'number' && typeof zone.height === 'number';
};

/**
 * 兼容两种存档：
 * - v1：只有矩形场地、没有 blockedZones，迁移成空禁区的 v2，行为与以前完全一致
 * - v2：携带 blockedZones
 * 旧格式里即便混入了 blockedZones 字段也一律忽略，绝不把旧矩形布局当成有障碍场地。
 */
export const migrateDocument = (value: unknown): LayoutDocument | null => {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Record<string, unknown>;
  if (typeof saved.title !== 'string' || !isFieldSize(saved.field) || !Array.isArray(saved.elements) || !saved.elements.every(isElement)) return null;

  if (saved.version === 1) {
    return { version: 2, title: saved.title, field: saved.field as FieldSize, elements: saved.elements as ExpoElement[], blockedZones: [] };
  }
  if (saved.version === 2) {
    const rawZones = Array.isArray(saved.blockedZones) ? saved.blockedZones.filter(isZone) : [];
    // 裁剪 / 丢弃越界数据，保证载入后的禁区一定落在场地内
    const field = saved.field as FieldSize;
    const blockedZones: BlockedZone[] = rawZones
      .map((zone) => {
        const x = Math.max(0, zone.x);
        const y = Math.max(0, zone.y);
        return { ...zone, x, y, width: Math.min(zone.width, field.width - x), height: Math.min(zone.height, field.height - y) };
      })
      .filter((zone) => zone.width > 0 && zone.height > 0);
    return { version: 2, title: saved.title, field, elements: saved.elements as ExpoElement[], blockedZones };
  }
  return null;
};

export class LocalLayoutRepository implements LayoutRepository {
  constructor(private readonly storage: DocumentStorageService) {}

  async load(): Promise<LayoutDocument> {
    try {
      const saved = await this.storage.read();
      return migrateDocument(saved) ?? createStarterDocument();
    } catch {
      return createStarterDocument();
    }
  }

  async save(document: LayoutDocument): Promise<void> {
    await this.storage.write(document);
  }
}
