import { BrowserWindow, ipcMain, screen } from 'electron';

/**
 * 透明窗口（transparent: true）在 Electron 官方限制里“无法原生 resize”：
 * - 也就是系统的“拖边缘缩放”不会生效
 * - 但主进程仍然可以通过 setBounds() 主动改变窗口大小
 *
 * 这里实现一套“边缘热区 + 主进程轮询鼠标位置”的自定义缩放：
 * - 渲染进程只负责在四边/四角放透明拖拽热区，并通过 IPC 通知开始/结束
 * - 主进程根据方向与鼠标位移计算新的 bounds，实时 setBounds
 *
 * 这样可以在保持透明/无边框风格的同时，让应用支持边缘拉拽放大缩小。
 */

export type WindowEdgeResizeDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

const ALLOWED_DIRECTIONS = new Set<WindowEdgeResizeDirection>([
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

type Bounds = { x: number; y: number; width: number; height: number };

type ResizeState = {
  direction: WindowEdgeResizeDirection;
  startCursor: { x: number; y: number };
  startBounds: Bounds;
  minWidth: number;
  minHeight: number;
};

let installed = false;

export function setupWindowEdgeResizeIpc(getWindow: () => BrowserWindow | null) {
  // 避免重复注册 IPC（例如热重载/多次 init）
  if (installed) return;
  installed = true;

  let state: ResizeState | null = null;
  let timer: NodeJS.Timeout | null = null;
  let lastApplied: Bounds | null = null;

  const stop = () => {
    state = null;
    lastApplied = null;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    const win = getWindow();
    if (!win || win.isDestroyed() || !state) {
      stop();
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - state.startCursor.x;
    const dy = cursor.y - state.startCursor.y;

    const start = state.startBounds;
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;

    const dir = state.direction;
    const resizeLeft = dir === 'left' || dir.endsWith('-left');
    const resizeRight = dir === 'right' || dir.endsWith('-right');
    const resizeTop = dir === 'top' || dir.startsWith('top-');
    const resizeBottom = dir === 'bottom' || dir.startsWith('bottom-');

    if (resizeLeft) {
      x = start.x + dx;
      width = start.width - dx;
    } else if (resizeRight) {
      width = start.width + dx;
    }

    if (resizeTop) {
      y = start.y + dy;
      height = start.height - dy;
    } else if (resizeBottom) {
      height = start.height + dy;
    }

    // 最小尺寸约束（避免 width/height 变成 0 或负数）
    const minWidth = Math.max(1, state.minWidth);
    const minHeight = Math.max(1, state.minHeight);

    if (width < minWidth) {
      if (resizeLeft) {
        // 保持右边缘不动（向左拖到最小宽度时，x 需要回退）
        x = start.x + (start.width - minWidth);
      }
      width = minWidth;
    }

    if (height < minHeight) {
      if (resizeTop) {
        // 保持下边缘不动
        y = start.y + (start.height - minHeight);
      }
      height = minHeight;
    }

    const next: Bounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };

    // 小优化：bounds 没变化就不 set（避免抖动/多余调用）
    if (
      lastApplied &&
      lastApplied.x === next.x &&
      lastApplied.y === next.y &&
      lastApplied.width === next.width &&
      lastApplied.height === next.height
    ) {
      return;
    }
    lastApplied = next;

    try {
      // animate 在 macOS 才有意义；这里统一 false，避免动画造成的“拖拽延迟感”
      win.setBounds(next, false);
    } catch {
      // 窗口销毁/切换瞬间可能抛错，直接停止即可
      stop();
    }
  };

  ipcMain.on('window-edge-resize-start', (_event, direction: WindowEdgeResizeDirection) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (!ALLOWED_DIRECTIONS.has(direction)) return;

    // 全屏模式不允许 resize
    if (win.isFullScreen()) return;

    // 最大化时先还原，否则 setBounds 体验怪/可能不生效
    if (win.isMaximized()) {
      win.unmaximize();
    }

    const startCursor = screen.getCursorScreenPoint();
    const startBounds = win.getBounds();
    const [minW, minH] = win.getMinimumSize();

    state = {
      direction,
      startCursor,
      startBounds,
      // 如果没有设置最小尺寸，给一个合理兜底（与你 createWindow 的逻辑一致）
      minWidth: minW || 800,
      minHeight: minH || 600,
    };

    lastApplied = null;

    if (!timer) {
      timer = setInterval(tick, 16); // ~60fps
    }
  });

  ipcMain.on('window-edge-resize-stop', stop);
}

