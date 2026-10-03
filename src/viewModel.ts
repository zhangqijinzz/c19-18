import {
  analyzeLayout,
  canRotateElement,
  constrainElementMove,
  constrainElementResize,
  createBlockedZone,
  createElement,
  createStarterDocument,
  findElement,
  findZone,
  getBoundingBox,
  isValidZone,
  normalizeRotation,
} from './domain';
import type { LayoutRepository } from './repository';
import type { Analysis, BlockedZone, ElementKind, LayoutDocument, LayoutMode, Notice, RenderElement, ViewPhase } from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  selectedZone: BlockedZone | null;
  mode: LayoutMode;
  analysis: Analysis;
  notice: Notice;
  lastSavedAt: number | null;
}

const toRenderElements = (document: LayoutDocument): RenderElement[] => document.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.width, displayHeight: box.height, occupiedArea: Number((box.width * box.height).toFixed(1)) };
});

const round1 = (value: number) => Number(value.toFixed(1));

const starter = createStarterDocument();

type Listener = () => void;

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  private stateValue: ExpoSketchState;

  constructor(private readonly repository: LayoutRepository, initialDocument: LayoutDocument = starter) {
    const initialRenderElements = toRenderElements(initialDocument);
    this.stateValue = {
      phase: 'loading',
      document: initialDocument,
      renderElements: initialRenderElements,
      selectedId: initialDocument.elements[0]?.id ?? null,
      selectedElement: initialRenderElements[0] ?? null,
      selectedZone: null,
      mode: 'edit',
      analysis: analyzeLayout(initialDocument),
      notice: { tone: 'info', message: '正在恢复最近布局…' },
      lastSavedAt: null,
    };
  }

  get state() { return this.stateValue; }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize() {
    try {
      const document = await this.repository.load();
      this.commit({ document, selectedId: document.elements[0]?.id ?? null, selectedZone: null, phase: 'ready', notice: { tone: 'success', message: '布局已就绪，可开始编辑' } });
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '布局读取失败，已载入安全示例' } });
    }
  }

  selectElement(id: string) { this.commit({ selectedId: id, selectedZone: null }); }

  selectZone(id: string) { this.commit({ selectedZone: findZone(this.stateValue.document, id), selectedId: null }); }

  clearSelection() { this.commit({ selectedId: null, selectedZone: null }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const element = createElement(kind, this.stateValue.document.elements.length, this.stateValue.document.field);
    const document = { ...this.stateValue.document, elements: [...this.stateValue.document.elements, element] };
    this.commitAndPersist({ document, selectedId: element.id, selectedZone: null, notice: { tone: 'success', message: `${element.name} 已加入场地` } });
  }

  removeSelected() {
    if (!this.stateValue.selectedId) return;
    const removed = findElement(this.stateValue.document, this.stateValue.selectedId);
    const elements = this.stateValue.document.elements.filter((element) => element.id !== this.stateValue.selectedId);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removed?.name ?? '元素'} 已移除` } });
  }

  moveElement(id: string, x: number, y: number) {
    const current = findElement(this.stateValue.document, id);
    if (!current) return;
    const { field, blockedZones } = this.stateValue.document;
    // 拖动受禁区约束：沿障碍滑动，元素无法压到不可占用区域上
    const constrained = constrainElementMove(current, round1(x), round1(y), field, blockedZones);
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, x: constrained.x, y: constrained.y } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } }, { notify: false });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const current = findElement(this.stateValue.document, id);
    if (!current) return;
    const { field, blockedZones } = this.stateValue.document;
    // 改尺寸受禁区约束：新尺寸压到禁区或超出场地时直接拒绝
    const allowed = constrainElementResize(current, Number(width), Number(height), field, blockedZones);
    if (!allowed) {
      this.commit({ notice: { tone: 'warning', message: '该尺寸会压到不可占用区域或超出场地，已保持原大小' } });
      return;
    }
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, width: round1(allowed.width), height: round1(allowed.height) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } }, { notify: false });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const current = findElement(this.stateValue.document, id);
    if (!current) return;
    if (!canRotateElement(current, this.stateValue.document.field, this.stateValue.document.blockedZones)) {
      this.commit({ notice: { tone: 'warning', message: '旋转后会压到不可占用区域，方向保持不变' } });
      return;
    }
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, rotation: normalizeRotation(element.rotation + 90) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name: name.trim() } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } }, { notify: false });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    const field = { width: round1(width), height: round1(height) };
    // 场地缩小时同步收进越界的禁区
    const blockedZones = this.stateValue.document.blockedZones
      .map((zone) => ({ ...zone, x: Math.min(zone.x, field.width), y: Math.min(zone.y, field.height), width: Math.min(zone.width, Math.max(0, field.width - zone.x)), height: Math.min(zone.height, Math.max(0, field.height - zone.y)) }))
      .filter((zone) => zone.width > 0 && zone.height > 0);
    this.commitAndPersist({ document: { ...this.stateValue.document, field, blockedZones }, notice: { tone: 'success', message: '场地尺寸已更新' } });
  }

  renameProject(title: string) {
    if (!title.trim()) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, title: title.trim() } });
  }

  resetExample() {
    const document = createStarterDocument();
    this.commitAndPersist({ document, selectedId: 'stage-1', selectedZone: null, mode: 'edit', notice: { tone: 'success', message: '已恢复示例布局' } });
  }

  /* ------------------------- 不可占用区域 ------------------------- */

  addBlockedZone() {
    const { field, blockedZones } = this.stateValue.document;
    let zone = createBlockedZone(blockedZones.length, field, blockedZones);
    // 默认位置若压到元素或其他禁区，则在场地内寻找第一个空位
    if (this.zoneCoversElements(zone) || this.zoneOverlapsZones(zone, blockedZones)) {
      const shifted = this.findFreeZoneSlot(zone.width, zone.height);
      if (!shifted) {
        this.commit({ notice: { tone: 'warning', message: '场地内已没有足够空间添加不可占用区域' } });
        return;
      }
      zone = { ...zone, ...shifted };
    }
    const document = { ...this.stateValue.document, blockedZones: [...blockedZones, zone] };
    this.commitAndPersist({ document, selectedZone: zone, selectedId: null, notice: { tone: 'success', message: `${zone.name} 已划出，拖动可移动、属性面板可调整大小` } });
  }

  /** 在画布上直接拖出一块不可占用区域 */
  addBlockedZoneRect(x: number, y: number, width: number, height: number) {
    const { field, blockedZones } = this.stateValue.document;
    const zone: BlockedZone = {
      id: `zone-${Date.now()}-${blockedZones.length}`,
      name: `不可占用区域 ${blockedZones.length + 1}`,
      x: round1(Math.max(0, x)),
      y: round1(Math.max(0, y)),
      width: round1(Math.min(width, field.width - Math.max(0, x))),
      height: round1(Math.min(height, field.height - Math.max(0, y))),
    };
    if (!isValidZone(zone, field)) {
      this.commit({ notice: { tone: 'warning', message: '不可占用区域需要完全落在场地内' } });
      return;
    }
    if (this.zoneOverlapsZones(zone, blockedZones)) {
      this.commit({ notice: { tone: 'warning', message: '该区域与已有不可占用区域重叠' } });
      return;
    }
    if (this.zoneCoversElements(zone)) {
      this.commit({ notice: { tone: 'warning', message: '不可占用区域不能压到现有元素，请先移开元素或换个位置划出' } });
      return;
    }
    const document = { ...this.stateValue.document, blockedZones: [...blockedZones, zone] };
    this.commitAndPersist({ document, selectedZone: zone, selectedId: null, notice: { tone: 'success', message: `${zone.name} 已划出` } });
  }

  moveZone(id: string, x: number, y: number) {
    const { field, blockedZones } = this.stateValue.document;
    const current = blockedZones.find((zone) => zone.id === id);
    if (!current) return;
    // 禁区本身也必须留在场地内、不与其他禁区交叠、不压到元素
    const desiredX = round1(Math.max(0, Math.min(field.width - current.width, x)));
    const desiredY = round1(Math.max(0, Math.min(field.height - current.height, y)));
    const candidate = { ...current, x: desiredX, y: desiredY };
    if (this.zoneOverlapsZones(candidate, blockedZones) || this.zoneCoversElements(candidate)) return;
    const next = blockedZones.map((zone) => zone.id === id ? candidate : zone);
    this.commitAndPersist({ document: { ...this.stateValue.document, blockedZones: next }, selectedZone: candidate }, { notify: false });
  }

  resizeSelectedZone(width: number, height: number) {
    const id = this.stateValue.selectedZone?.id;
    if (!id) return;
    const { field, blockedZones } = this.stateValue.document;
    const candidate: BlockedZone = { ...(blockedZones.find((zone) => zone.id === id) as BlockedZone), width: round1(width), height: round1(height) };
    if (!isValidZone(candidate, field)) {
      this.commit({ notice: { tone: 'warning', message: '不可占用区域不能超出场地范围' } });
      return;
    }
    if (this.zoneOverlapsZones(candidate, blockedZones)) {
      this.commit({ notice: { tone: 'warning', message: '不可占用区域之间不能重叠' } });
      return;
    }
    if (this.zoneCoversElements(candidate)) {
      this.commit({ notice: { tone: 'warning', message: '扩大会压到现有元素，已保持原大小' } });
      return;
    }
    this.updateZone(candidate, false);
  }

  renameSelectedZone(name: string) {
    const id = this.stateValue.selectedZone?.id;
    if (!id || !name.trim()) return;
    this.updateZone({ ...(this.stateValue.selectedZone as BlockedZone), name: name.trim() }, false);
  }

  removeSelectedZone() {
    const zone = this.stateValue.selectedZone;
    if (!zone) return;
    this.removeZone(zone.id);
  }

  removeZone(id: string) {
    const zone = findZone(this.stateValue.document, id);
    if (!zone) return;
    const blockedZones = this.stateValue.document.blockedZones.filter((item) => item.id !== id);
    this.commitAndPersist({ document: { ...this.stateValue.document, blockedZones }, selectedZone: null, notice: { tone: 'info', message: `${zone.name} 已删除` } });
  }

  private zoneOverlapsZones(zone: BlockedZone, zones: BlockedZone[]): boolean {
    return zones.some((other) => other.id !== zone.id &&
      zone.x < other.x + other.width && zone.x + zone.width > other.x &&
      zone.y < other.y + other.height && zone.y + zone.height > other.y);
  }

  private zoneCoversElements(zone: BlockedZone): boolean {
    return this.stateValue.document.elements.some((element) => {
      const box = getBoundingBox(element);
      return box.right > zone.x && box.left < zone.x + zone.width && box.bottom > zone.y && box.top < zone.y + zone.height;
    });
  }

  /** 在场地内按栅格寻找一块能容纳给定尺寸、且不压任何元素/禁区的空位 */
  private findFreeZoneSlot(width: number, height: number): { x: number; y: number } | null {
    const { field, blockedZones } = this.stateValue.document;
    for (let y = 0.5; y + height <= field.height - 0.5; y += 0.5) {
      for (let x = 0.5; x + width <= field.width - 0.5; x += 0.5) {
        const candidate: BlockedZone = { id: 'probe', name: '', x: round1(x), y: round1(y), width, height };
        if (!this.zoneOverlapsZones(candidate, blockedZones) && !this.zoneCoversElements(candidate)) {
          return { x: candidate.x, y: candidate.y };
        }
      }
    }
    return null;
  }

  private updateZone(zone: BlockedZone, notify: boolean) {
    const blockedZones = this.stateValue.document.blockedZones.map((item) => item.id === zone.id ? zone : item);
    this.commitAndPersist({ document: { ...this.stateValue.document, blockedZones }, selectedZone: zone }, { notify });
  }

  /* ----------------------------- 基础设施 ----------------------------- */

  private commitAndPersist(patch: Partial<ExpoSketchState>, options: { notify?: boolean } = {}) {
    this.commit(patch, options);
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

  private commit(patch: Partial<ExpoSketchState>, options: { notify?: boolean } = {}) {
    const next = { ...this.stateValue, ...patch };
    const renderElements = toRenderElements(next.document);
    const analysis = analyzeLayout(next.document);
    // 禁区把可通行空间切断时立刻提示，不必等元素摆完；仅在文档变更时更新
    let notice = next.notice;
    if (options.notify !== false && patch.document !== undefined) {
      const blocking = analysis.accessibility.find((issue) => issue.kind === 'route-blocked');
      const split = analysis.accessibility.find((issue) => issue.kind === 'space-split');
      if (blocking) notice = { tone: 'error', message: blocking.message };
      else if (split) notice = { tone: 'warning', message: split.message };
    }
    this.stateValue = {
      ...next,
      renderElements,
      analysis,
      notice,
      selectedElement: renderElements.find((element) => element.id === next.selectedId) ?? null,
      selectedZone: next.selectedId ? null : (next.selectedZone ? (next.document.blockedZones ?? []).find((zone) => zone.id === next.selectedZone?.id) ?? null : null),
    };
    this.listeners.forEach((listener) => listener());
  }
}
