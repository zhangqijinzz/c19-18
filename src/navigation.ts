import { getBoundingBox, getObstacles, obstacleBox } from './domain';
import type { LayoutDocument, PartitionIssue, PathPreview } from './types';

/** 栅格边长（m），精度与计算量的折中 */
const STEP = 0.4;
/** 障碍物外扩余量，避免路线视觉上贴着墙边走 */
const INFLATE = 0.05;
/** 小于约 1 m²（7 个栅格）的孤立缝隙不计为被隔断的区域 */
const MIN_REGION_CELLS = 7;

export interface NavigationResult {
  partition: PartitionIssue | null;
  path: PathPreview | null;
}

interface Grid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

const buildGrid = (document: LayoutDocument): Grid => {
  const cols = Math.max(1, Math.round(document.field.width / STEP));
  const rows = Math.max(1, Math.round(document.field.height / STEP));
  const blocked = new Uint8Array(cols * rows);
  const rects = getObstacles(document).map(obstacleBox);
  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.5) * STEP;
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * STEP;
      const hit = rects.some((rect) =>
        x >= rect.left - INFLATE && x <= rect.right + INFLATE && y >= rect.top - INFLATE && y <= rect.bottom + INFLATE);
      blocked[row * cols + col] = hit ? 1 : 0;
    }
  }
  return { cols, rows, blocked };
};

/**
 * 洪水填充划分连通区域。返回分区结论：
 * 障碍物把可通行空间切成多个彼此不可达的区域时给出提示。
 */
const analyzePartition = (grid: Grid): PartitionIssue | null => {
  const { cols, rows, blocked } = grid;
  const labels = new Int32Array(cols * rows).fill(-1);
  const sizes: number[] = [];

  for (let start = 0; start < labels.length; start += 1) {
    if (blocked[start] || labels[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const queue = [start];
    labels[start] = id;
    while (queue.length) {
      const index = queue.pop() as number;
      size += 1;
      const col = index % cols;
      const row = (index - col) / cols;
      const neighbors = [col > 0 ? index - 1 : -1, col < cols - 1 ? index + 1 : -1, row > 0 ? index - cols : -1, row < rows - 1 ? index + cols : -1];
      for (const next of neighbors) {
        if (next >= 0 && !blocked[next] && labels[next] === -1) {
          labels[next] = id;
          queue.push(next);
        }
      }
    }
    sizes.push(size);
  }

  if (sizes.length < 2) return null;
  const meaningful = sizes.filter((size) => size >= MIN_REGION_CELLS);
  if (meaningful.length < 2) return null;
  const largest = meaningful.reduce((max, size) => Math.max(max, size), 0);
  let largestAccounted = false;
  const strandedCells = meaningful.reduce((sum, size) => {
    if (!largestAccounted && size === largest) {
      largestAccounted = true;
      return sum;
    }
    return sum + size;
  }, 0);
  if (strandedCells === 0) return null;
  return { regions: meaningful.length, strandedArea: Number((strandedCells * STEP * STEP).toFixed(1)) };
};

const routeEndpoints = (document: LayoutDocument) => {
  const entrance = document.elements.find((element) => element.kind === 'entrance');
  const target = document.elements.find((element) => element.kind === 'stage')
    ?? document.elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  return {
    name: { from: entrance.name, to: target.name },
    start: { x: startBox.left + (startBox.right - startBox.left) / 2, y: startBox.top + (startBox.bottom - startBox.top) / 2 },
    end: { x: targetBox.left + (targetBox.right - targetBox.left) / 2, y: targetBox.top + (targetBox.bottom - targetBox.top) / 2 },
  };
};

/** 无障碍物时沿用旧版的直角 L 形路径，结论与过去完全一致 */
const createElbowPath = (document: LayoutDocument): PathPreview | null => {
  const endpoints = routeEndpoints(document);
  if (!endpoints) return null;
  const { start, end } = endpoints;
  const elbow = { x: end.x, y: start.y };
  const points = [start, elbow, end];
  const distance = points.reduce((sum, point, index) => index === 0 ? 0 : sum + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y), 0);
  return { points, distance: Number(distance.toFixed(1)), fromName: endpoints.name.from, toName: endpoints.name.to, end, status: 'ok' };
};

/** A* 四邻接寻路，绕开不可占用区域 */
const findRoutedPath = (document: LayoutDocument, grid: Grid): PathPreview | null => {
  const endpoints = routeEndpoints(document);
  if (!endpoints) return null;
  const { cols, rows, blocked } = grid;
  const { start, end } = endpoints;

  const startCol = Math.min(cols - 1, Math.max(0, Math.floor(start.x / STEP)));
  const startRow = Math.min(rows - 1, Math.max(0, Math.floor(start.y / STEP)));
  const endCol = Math.min(cols - 1, Math.max(0, Math.floor(end.x / STEP)));
  const endRow = Math.min(rows - 1, Math.max(0, Math.floor(end.y / STEP)));
  const startIndex = startRow * cols + startCol;
  const goalIndex = endRow * cols + endCol;

  const blockedResult = (): PathPreview => ({ points: [], distance: 0, fromName: endpoints.name.from, toName: endpoints.name.to, end, status: 'blocked' });
  if (blocked[startIndex] || blocked[goalIndex]) return blockedResult();

  const heuristic = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const gScore = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  heuristic[startIndex] = Math.hypot(startCol - endCol, startRow - endRow);
  gScore[startIndex] = 0;
  const open = new Set<number>([startIndex]);

  const cellPoint = (index: number) => ({ x: (index % cols + 0.5) * STEP, y: (Math.floor(index / cols) + 0.5) * STEP });

  while (open.size) {
    let current = -1;
    let bestF = Number.POSITIVE_INFINITY;
    open.forEach((index) => {
      const f = gScore[index] + heuristic[index];
      if (f < bestF) { bestF = f; current = index; }
    });
    if (current === goalIndex) break;
    open.delete(current);
    const col = current % cols;
    const row = (current - col) / cols;
    const neighbors = [col > 0 ? current - 1 : -1, col < cols - 1 ? current + 1 : -1, row > 0 ? current - cols : -1, row < rows - 1 ? current + cols : -1];
    for (const next of neighbors) {
      if (next < 0 || blocked[next]) continue;
      const tentative = gScore[current] + 1;
      if (tentative < gScore[next]) {
        cameFrom[next] = current;
        gScore[next] = tentative;
        if (heuristic[next] === Number.POSITIVE_INFINITY) {
          const nextCol = next % cols;
          const nextRow = (next - nextCol) / cols;
          heuristic[next] = Math.hypot(nextCol - endCol, nextRow - endRow);
        }
        open.add(next);
      }
    }
  }

  if (cameFrom[goalIndex] === -1 && goalIndex !== startIndex) return blockedResult();

  const cellPath: number[] = [];
  for (let index: number = goalIndex; index !== -1; index = cameFrom[index]) cellPath.push(index);
  cellPath.reverse();

  const points = cellPath.map(cellPoint);
  points[0] = start;
  points[points.length - 1] = end;

  // 去掉同一直线上的中间拐点，只保留转弯处
  const simplified = points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    return Math.abs((point.x - previous.x) * (next.y - previous.y) - (point.y - previous.y) * (next.x - previous.x)) > 1e-9;
  });

  const total = simplified.reduce((sum, point, index) => index === 0 ? 0 : sum + Math.hypot(point.x - simplified[index - 1].x, point.y - simplified[index - 1].y), 0);
  return {
    points: simplified.map((point) => ({ x: Number(point.x.toFixed(1)), y: Number(point.y.toFixed(1)) })),
    distance: Number(total.toFixed(1)),
    fromName: endpoints.name.from,
    toName: endpoints.name.to,
    end,
    status: 'ok',
  };
};

export const analyzeNavigation = (document: LayoutDocument): NavigationResult => {
  const obstacles = getObstacles(document);
  if (obstacles.length === 0) {
    // 没有任何不可占用区域：分区不分析，路径保持旧版 L 形结论
    return { partition: null, path: createElbowPath(document) };
  }
  const grid = buildGrid(document);
  return { partition: analyzePartition(grid), path: findRoutedPath(document, grid) };
};
