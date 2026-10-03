import {
  analyzeLayout,
  clampBoxPosition,
  clampBoxSize,
  createElement,
  createObstacle,
  createStarterDocument,
  findElement,
  findObstacle,
  getBoundingBox,
  getObstacles,
  normalizeRotation,
  obstacleBox,
  type Box,
} from './domain';
import type { LayoutRepository } from './repository';
import type { Analysis, ElementKind, ExpoElement, LayoutDocument, LayoutMode, Notice, Obstacle, ObstacleKind, RenderElement, ViewPhase } from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  selectedObstacle: Obstacle | null;
  mode: LayoutMode;
  analysis: Analysis;
  notice: Notice;
  lastSavedAt: number | null;
}

type Listener = () => void;

const elementRect = (element: ExpoElement): Box => getBoundingBox(element);

const round1 = (value: number) => Number(value.toFixed(1));

const starter = createStarterDocument();
const starterRenderElements = starter.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.right - box.left, displayHeight: box.bottom - box.top, occupiedArea: Number(((box.right - box.left) * (box.bottom - box.top)).toFixed(1)) };
});

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  private stateValue: ExpoSketchState = {
    phase: 'loading',
    document: starter,
    renderElements: starterRenderElements,
    selectedId: 'stage-1',
    selectedElement: starterRenderElements.find((element) => element.id === 'stage-1') ?? null,
    selectedObstacle: null,
    mode: 'edit',
    analysis: analyzeLayout(createStarterDocument()),
    notice: { tone: 'info', message: '正在恢复最近布局…' },
    lastSavedAt: null,
  };

  constructor(private readonly repository: LayoutRepository) {}

  get state() { return this.stateValue; }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize() {
    try {
      const document = await this.repository.load();
      this.commit({ document, selectedId: document.elements[0]?.id ?? null, phase: 'ready', notice: { tone: 'success', message: '布局已就绪，可开始编辑' } }, { silent: true });
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '布局读取失败，已载入安全示例' } }, { silent: true });
    }
  }

  selectElement(id: string) { this.commit({ selectedId: id }); }
  selectObstacle(id: string) { this.commit({ selectedId: id }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const document = this.stateValue.document;
    const element = createElement(kind, document.elements.length, document.field);
    const obstacles = getObstacles(document);
    let placed = element;
    if (obstacles.length > 0) {
      // 新元素直接落在可行区域，避免一加入就压到承重柱/配电间
      const start = { x: element.x, y: element.y };
      const position = clampBoxPosition(element, start, document.field, obstacles.map(obstacleBox));
      placed = { ...element, x: position.x, y: position.y };
    }
    const nextDocument = { ...document, elements: [...document.elements, placed] };
    this.commitAndPersist({ document: nextDocument, selectedId: element.id, notice: { tone: 'success', message: `${placed.name} 已加入场地` } });
  }

  addObstacle(kind: ObstacleKind) {
    const document = this.stateValue.document;
    const obstacles = getObstacles(document);
    const obstacle = createObstacle(kind, obstacles.length, document.field);
    const solids: Box[] = [
      ...document.elements.map(elementRect),
      ...obstacles.map(obstacleBox),
    ];
    const position = clampBoxPosition(obstacle, { x: obstacle.x, y: obstacle.y }, document.field, solids);
    const placed = { ...obstacle, x: position.x, y: position.y };
    const nextDocument = { ...document, obstacles: [...obstacles, placed] };
    this.commitAndPersist({ document: nextDocument, selectedId: obstacle.id, notice: { tone: 'success', message: `${placed.name}已标记为不可占用区域` } });
  }

  removeSelected() {
    const { selectedId } = this.stateValue;
    if (!selectedId) return;
    const removedElement = findElement(this.stateValue.document, selectedId);
    const removedObstacle = removedElement ? null : findObstacle(this.stateValue.document, selectedId);
    if (removedElement) {
      const elements = this.stateValue.document.elements.filter((element) => element.id !== selectedId);
      this.commitAndPersist({ document: { ...this.stateValue.document, elements }, selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removedElement.name} 已移除` } });
      return;
    }
    if (removedObstacle) {
      const obstacles = getObstacles(this.stateValue.document).filter((obstacle) => obstacle.id !== selectedId);
      this.commitAndPersist({ document: { ...this.stateValue.document, obstacles }, selectedId: null, notice: { tone: 'info', message: `${removedObstacle.name} 已删除，该区域恢复可占用` } });
    }
  }

  moveElement(id: string, x: number, y: number) {
    const document = this.stateValue.document;
    const element = findElement(document, id);
    if (!element) return;
    const rawX = round1(x);
    const rawY = round1(y);
    const obstacles = getObstacles(document);
    let nextX = rawX;
    let nextY = rawY;
    let clamped = false;
    if (obstacles.length > 0) {
      const box = elementRect(element);
      const position = clampBoxPosition(
        { x: rawX, y: rawY, width: box.right - box.left, height: box.bottom - box.top },
        { x: element.x, y: element.y },
        document.field,
        obstacles.map(obstacleBox),
      );
      nextX = position.x;
      nextY = position.y;
      clamped = nextX !== rawX || nextY !== rawY;
    }
    const elements = document.elements.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item);
    this.commitAndPersist(
      { document: { ...document, elements } },
      clamped ? { tone: 'warning', message: '该位置与不可占用区域冲突，已自动滑动到可行位置' } : undefined,
    );
  }

  moveObstacle(id: string, x: number, y: number) {
    const document = this.stateValue.document;
    const obstacle = findObstacle(document, id);
    if (!obstacle) return;
    const rawX = round1(x);
    const rawY = round1(y);
    const obstacles = getObstacles(document);
    const solids: Box[] = [
      ...document.elements.map(elementRect),
      ...obstacles.filter((item) => item.id !== id).map(obstacleBox),
    ];
    const position = clampBoxPosition(
      { x: rawX, y: rawY, width: obstacle.width, height: obstacle.height },
      { x: obstacle.x, y: obstacle.y },
      document.field,
      solids,
    );
    const nextObstacles = obstacles.map((item) => item.id === id ? { ...item, x: position.x, y: position.y } : item);
    const clamped = position.x !== rawX || position.y !== rawY;
    this.commitAndPersist(
      { document: { ...document, obstacles: nextObstacles } },
      clamped ? { tone: 'warning', message: '不可占用区域不能压到展位或越出场地，已自动滑动' } : undefined,
    );
  }

  renameObstacle(id: string, name: string) {
    if (!name.trim()) return;
    const document = this.stateValue.document;
    if (!findObstacle(document, id)) return;
    const trimmed = name.trim();
    const obstacles = getObstacles(document).map((item) => item.id === id ? { ...item, name: trimmed } : item);
    this.commitAndPersist({ document: { ...document, obstacles } });
  }

  resizeObstacleById(id: string, width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const obstacle = findObstacle(this.stateValue.document, id);
    if (obstacle) this.resizeObstacle(obstacle, width, height);
  }

  removeObstacle(id: string) {
    const document = this.stateValue.document;
    const obstacle = findObstacle(document, id);
    if (!obstacle) return;
    const obstacles = getObstacles(document).filter((item) => item.id !== id);
    this.commitAndPersist({
      document: { ...document, obstacles },
      selectedId: this.stateValue.selectedId === id ? null : this.stateValue.selectedId,
      notice: { tone: 'info', message: `${obstacle.name} 已删除，该区域恢复可占用` },
    });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const document = this.stateValue.document;
    const element = findElement(document, id);
    if (element) {
      const obstacles = getObstacles(document);
      let displayWidth = width;
      let displayHeight = height;
      if (obstacles.length > 0) {
        const fitted = clampBoxSize({ x: element.x, y: element.y }, { width, height }, document.field, obstacles.map(obstacleBox));
        displayWidth = fitted.width;
        displayHeight = fitted.height;
      }
      const quarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
      const nextWidth = quarterTurn ? displayHeight : displayWidth;
      const nextHeight = quarterTurn ? displayWidth : displayHeight;
      const elements = document.elements.map((item) => item.id === id ? { ...item, width: round1(nextWidth), height: round1(nextHeight) } : item);
      const clamped = displayWidth < width - 0.05 || displayHeight < height - 0.05;
      this.commitAndPersist(
        { document: { ...document, elements } },
        clamped ? { tone: 'warning', message: '尺寸已限制到不压占不可用区域、不越界的最大值' } : undefined,
      );
      return;
    }

    const obstacle = findObstacle(document, id);
    if (obstacle) {
      this.resizeObstacle(obstacle, width, height);
    }
  }

  private resizeObstacle(obstacle: Obstacle, width: number, height: number) {
    const document = this.stateValue.document;
    const obstacles = getObstacles(document);
    const solids: Box[] = [
      ...document.elements.map(elementRect),
      ...obstacles.filter((item) => item.id !== obstacle.id).map(obstacleBox),
    ];
    const fitted = clampBoxSize({ x: obstacle.x, y: obstacle.y }, { width, height }, document.field, solids);
    const nextObstacles = obstacles.map((item) => item.id === obstacle.id ? { ...item, width: fitted.width, height: fitted.height } : item);
    const clamped = fitted.width < width - 0.05 || fitted.height < height - 0.05;
    this.commitAndPersist(
      { document: { ...document, obstacles: nextObstacles } },
      clamped ? { tone: 'warning', message: '不可占用区域尺寸已限制到不压展位、不越界的最大值' } : undefined,
    );
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id || findObstacle(this.stateValue.document, id)) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, rotation: normalizeRotation(element.rotation + 90) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  renameSelected(name: string) {
    if (!name.trim()) return;
    const id = this.stateValue.selectedId;
    if (!id) return;
    const trimmed = name.trim();
    const document = this.stateValue.document;
    if (findElement(document, id)) {
      const elements = document.elements.map((element) => element.id === id ? { ...element, name: trimmed } : element);
      this.commitAndPersist({ document: { ...document, elements } });
      return;
    }
    const obstacles = getObstacles(document).map((obstacle) => obstacle.id === id ? { ...obstacle, name: trimmed } : obstacle);
    this.commitAndPersist({ document: { ...document, obstacles } });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, field: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } }, notice: { tone: 'success', message: '场地尺寸已更新' } });
  }

  renameProject(title: string) {
    if (!title.trim()) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, title: title.trim() } });
  }

  resetExample() {
    const document = createStarterDocument();
    this.commitAndPersist({ document, selectedId: 'stage-1', mode: 'edit', notice: { tone: 'success', message: '已恢复示例布局' } });
  }

  private commitAndPersist(patch: Partial<ExpoSketchState>, forcedNotice?: Notice) {
    this.commit(patch, { forcedNotice });
    void this.persist();
  }

  private async persist() {
    try {
      await this.repository.save(this.stateValue.document);
      this.commit({ lastSavedAt: Date.now() });
    } catch {
      this.commit({ notice: { tone: 'error', message: '本地保存失败，当前编辑仍保留在页面中' } });
    }
  }

  private commit(patch: Partial<ExpoSketchState>, options: { silent?: boolean; forcedNotice?: Notice } = {}) {
    const next = { ...this.stateValue, ...patch };
    const renderElements = this.renderElementsOf(next.document);
    const obstacles = getObstacles(next.document);
    const analysis = analyzeLayout(next.document);
    const selectedObstacle = obstacles.find((obstacle) => obstacle.id === next.selectedId) ?? null;
    const selectedElement = renderElements.find((element) => element.id === next.selectedId) ?? null;

    let notice = next.notice;
    if (options.forcedNotice) {
      notice = options.forcedNotice;
    } else if (!options.silent) {
      const hadPartition = this.stateValue.analysis.partition !== null;
      const hasPartition = analysis.partition !== null;
      if (hasPartition && !hadPartition) {
        notice = { tone: 'warning', message: `不可占用区域把场地切成 ${analysis.partition?.regions} 块，部分区域将无法通行，请先调整` };
      }
    }

    this.stateValue = { ...next, renderElements, selectedElement, selectedObstacle, analysis, notice };
    this.listeners.forEach((listener) => listener());
  }

  private renderElementsOf(document: LayoutDocument): RenderElement[] {
    return document.elements.map((element) => {
      const box = getBoundingBox(element);
      return { ...element, displayWidth: box.right - box.left, displayHeight: box.bottom - box.top, occupiedArea: Number(((box.right - box.left) * (box.bottom - box.top)).toFixed(1)) };
    });
  }
}
