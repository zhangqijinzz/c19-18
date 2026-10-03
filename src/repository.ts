import { createStarterDocument } from './domain';
import type { DocumentStorageService } from './storageService';
import type { ExpoElement, LayoutDocument, Obstacle, ObstacleKind } from './types';

export interface LayoutRepository {
  load(): Promise<LayoutDocument>;
  save(document: LayoutDocument): Promise<void>;
}

const isElement = (value: unknown): value is ExpoElement => {
  if (!value || typeof value !== 'object') return false;
  const element = value as Record<string, unknown>;
  return typeof element.id === 'string' && typeof element.kind === 'string' && typeof element.x === 'number' && typeof element.y === 'number' && typeof element.width === 'number' && typeof element.height === 'number' && typeof element.rotation === 'number';
};

const OBSTACLE_KINDS: ObstacleKind[] = ['pillar', 'elevator', 'electrical'];

const isObstacle = (value: unknown): value is Obstacle => {
  if (!value || typeof value !== 'object') return false;
  const obstacle = value as Record<string, unknown>;
  return typeof obstacle.id === 'string'
    && typeof obstacle.kind === 'string' && OBSTACLE_KINDS.includes(obstacle.kind as ObstacleKind)
    && typeof obstacle.name === 'string'
    && typeof obstacle.x === 'number' && typeof obstacle.y === 'number'
    && typeof obstacle.width === 'number' && typeof obstacle.height === 'number';
};

const isDocumentShape = (value: unknown): value is LayoutDocument => {
  if (!value || typeof value !== 'object') return false;
  const document = value as Record<string, unknown>;
  const field = document.field as Record<string, unknown> | undefined;
  return document.version === 1 && typeof document.title === 'string' && !!field && typeof field.width === 'number' && typeof field.height === 'number' && Array.isArray(document.elements) && document.elements.every(isElement);
};

/**
 * 规范化已校验的文档：旧版本保存的矩形布局没有 obstacles 字段，
 * 统一补成空数组，打开后仍是没有任何不可占用区域的场地。
 */
export const normalizeDocument = (value: unknown): LayoutDocument | null => {
  if (!isDocumentShape(value)) return null;
  const rawObstacles = (value as unknown as Record<string, unknown>).obstacles;
  if (rawObstacles !== undefined && rawObstacles !== null) {
    if (!Array.isArray(rawObstacles) || !rawObstacles.every(isObstacle)) return null;
    return { ...value, obstacles: rawObstacles };
  }
  return { ...value, obstacles: [] };
};

export class LocalLayoutRepository implements LayoutRepository {
  constructor(private readonly storage: DocumentStorageService) {}

  async load(): Promise<LayoutDocument> {
    try {
      const saved = await this.storage.read();
      return normalizeDocument(saved) ?? createStarterDocument();
    } catch {
      return createStarterDocument();
    }
  }

  async save(document: LayoutDocument): Promise<void> {
    await this.storage.write(document);
  }
}
