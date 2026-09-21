import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import type { LibraryCanvasTransform } from "../utils/libraryCanvas";

const KEYBOARD_PAN_SPEED = 540;
const KEYBOARD_PAN_ACCELERATION = 16;
const KEYBOARD_PAN_DECELERATION = 11;

export type LibraryCanvasKeyboardAction =
  | { kind: "pan"; x: number; y: number }
  | { kind: "zoom"; factor: number }
  | { kind: "reset" };

/**
 * 将键盘按键转换为画布控制动作。
 *
 * @param key - 浏览器键盘事件中的按键名称。
 * @returns 对应的平移、缩放或复位动作；不支持的按键返回 null。
 */
export function getLibraryCanvasKeyboardAction(
  key: string,
): LibraryCanvasKeyboardAction | null {
  switch (key) {
    case "ArrowLeft":
      return { kind: "pan", x: 1, y: 0 };
    case "ArrowRight":
      return { kind: "pan", x: -1, y: 0 };
    case "ArrowUp":
      return { kind: "pan", x: 0, y: 1 };
    case "ArrowDown":
      return { kind: "pan", x: 0, y: -1 };
    case "+":
    case "=":
      return { kind: "zoom", factor: 1.16 };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / 1.16 };
    case "0":
    case "Home":
      return { kind: "reset" };
    default:
      return null;
  }
}

interface LibraryCanvasControlsOptions {
  active: boolean;
  defaultScale: number;
  maxScale: number;
  minScale: number;
  surfaceRef: Ref<HTMLElement | null>;
  onPaint?: (transform: LibraryCanvasTransform) => void;
  shouldCommit?: (
    next: LibraryCanvasTransform,
    committed: LibraryCanvasTransform,
  ) => boolean;
}

/**
 * 创建资料库画布的统一交互控制器。
 *
 * 变换先写入实时引用并按帧绘制，只有达到提交条件时才更新响应式状态。
 * 这样拖拽和滚轮过程不会让页面层承担每个指针事件的持久化判断。
 *
 * @param options - 画布边界、初始缩放和绘制/提交回调。
 * @returns 画布变换状态、缩放状态和各类指针/键盘事件处理器。
 */
export function useLibraryCanvasControls(
  options: LibraryCanvasControlsOptions,
) {
  const {
    active,
    defaultScale,
    maxScale,
    minScale,
    surfaceRef,
    onPaint,
    shouldCommit,
  } = options;
  const initialTransform: LibraryCanvasTransform = {
    x: 0,
    y: 0,
    scale: defaultScale,
  };
  let defaultScaleValue = defaultScale;
  const transform = ref<LibraryCanvasTransform>({ ...initialTransform });
  const liveTransformRef = { current: { ...initialTransform } };
  let pendingTransform = { ...initialTransform };
  let committedTransform = { ...initialTransform };
  let transformFrame: number | null = null;
  let initialFrame: number | null = null;
  let forceCommit = false;

  const pressedPanKeys = new Set<string>();
  const keyboardMotion = {
    frame: null as number | null,
    velocityX: 0,
    velocityY: 0,
  };
  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null = null;
  let suppressClickUntil = 0;

  /**
   * 应用一帧实时变换，并在需要时通知持久化层。
   *
   * @param next - 当前动画帧计算出的画布变换。
   * @param shouldForceCommit - 是否忽略节流条件立即提交。
   * @returns 无返回值；绘制回调和提交回调按条件执行。
   */
  function applyFrame(
    next: LibraryCanvasTransform,
    shouldForceCommit: boolean,
  ): void {
    // 实时引用和画布绘制每帧更新；响应式值只在提交条件满足时更新，避免拖动过程触发整页响应。
    liveTransformRef.current = next;
    pendingTransform = next;
    onPaint?.(next);

    const unchanged =
      next.x === committedTransform.x &&
      next.y === committedTransform.y &&
      next.scale === committedTransform.scale;
    if (unchanged && !shouldForceCommit) return;

    const canCommit =
      shouldForceCommit ||
      !shouldCommit ||
      shouldCommit(next, committedTransform);
    if (!canCommit) return;

    committedTransform = next;
    if (
      transform.value.x !== next.x ||
      transform.value.y !== next.y ||
      transform.value.scale !== next.scale
    ) {
      transform.value = next;
    }
  }

  /**
   * 合并连续变换请求，避免每个指针事件都触发一次重绘。
   *
   * @param update - 基于当前待提交变换计算下一次变换的函数。
   * @param shouldForceCommit - 是否在本帧结束时强制提交。
   * @returns 无返回值；重复请求会合并到同一条动画帧。
   */
  function scheduleTransform(
    update: (current: LibraryCanvasTransform) => LibraryCanvasTransform,
    shouldForceCommit = false,
  ): void {
    // 指针、滚轮和键盘事件可能在同一帧内连续到达，先合并到待处理值再统一绘制。
    const current = pendingTransform;
    const next = update(current);
    const unchanged =
      next.x === current.x &&
      next.y === current.y &&
      next.scale === current.scale;

    if (unchanged) {
      if (shouldForceCommit) forceCommit = true;
    } else {
      pendingTransform = next;
      liveTransformRef.current = next;
      if (shouldForceCommit) forceCommit = true;
    }

    if (unchanged && !shouldForceCommit) return;
    if (transformFrame !== null) return;
    transformFrame = window.requestAnimationFrame(() => {
      transformFrame = null;
      const shouldPaintCommit = forceCommit;
      forceCommit = false;
      applyFrame(pendingTransform, shouldPaintCommit);
    });
  }

  /**
   * 立即提交当前待应用的变换。
   *
   * @returns 无返回值；会取消尚未执行的动画帧并同步响应式状态。
   */
  function flushCommit(): void {
    if (transformFrame !== null) {
      window.cancelAnimationFrame(transformFrame);
      transformFrame = null;
    }
    forceCommit = false;
    applyFrame(pendingTransform, true);
  }

  /**
   * 将画布恢复到默认位置和缩放比例。
   *
   * @returns 无返回值；复位请求会在下一帧统一绘制。
   */
  function reset(): void {
    scheduleTransform(
      () => ({ x: 0, y: 0, scale: defaultScaleValue }),
      true,
    );
  }

  /**
   * 修改默认缩放，并同步当前画布缩放。
   *
   * @param nextScale - 新的默认缩放比例。
   * @returns 无返回值；非法比例会被忽略。
   */
  function setDefaultScale(nextScale: number): void {
    if (!Number.isFinite(nextScale) || nextScale <= 0) return;
    defaultScaleValue = nextScale;
    reset();
  }

  /**
   * 以当前画布状态调整缩放。
   *
   * @param factor - 应用于当前比例的乘数。
   * @returns 无返回值；结果会限制在最小和最大缩放范围内。
   */
  function zoom(factor: number): void {
    scheduleTransform(
      (current) => ({
        ...current,
        scale: Math.min(
          maxScale,
          Math.max(minScale, current.scale * factor),
        ),
      }),
      true,
    );
  }

  /**
   * 将当前按下的方向键合成为单位移动方向。
   *
   * @returns 已归一化的横向和纵向移动方向。
   */
  function keyboardDirection(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    pressedPanKeys.forEach((key) => {
      const action = getLibraryCanvasKeyboardAction(key);
      if (action?.kind === "pan") {
        x += action.x;
        y += action.y;
      }
    });
    const magnitude = Math.hypot(x, y);
    return magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
  }

  /**
   * 启动按住方向键时的连续平移动画。
   *
   * @returns 无返回值；已有动画循环时不会重复创建。
   */
  function startKeyboardMotion(): void {
    if (keyboardMotion.frame !== null) return;
    let previousTime = performance.now();

    /**
     * 计算当前动画帧的速度并提交位移。
     *
     * @param time - requestAnimationFrame 提供的高精度时间戳。
     * @returns 无返回值；仍需移动时会请求下一帧。
     */
    function tick(time: number): void {
      const elapsed = Math.min(
        0.05,
        Math.max(0.001, (time - previousTime) / 1000),
      );
      previousTime = time;
      const direction = keyboardDirection();
      const hasDirection = direction.x !== 0 || direction.y !== 0;
      const targetX = direction.x * KEYBOARD_PAN_SPEED;
      const targetY = direction.y * KEYBOARD_PAN_SPEED;
      const response = hasDirection
        ? KEYBOARD_PAN_ACCELERATION
        : KEYBOARD_PAN_DECELERATION;
      const blend = 1 - Math.exp(-response * elapsed);
      // 速度采用指数逼近，按下时平滑加速，释放后平滑减速，避免键盘平移突然跳变。
      keyboardMotion.velocityX +=
        (targetX - keyboardMotion.velocityX) * blend;
      keyboardMotion.velocityY +=
        (targetY - keyboardMotion.velocityY) * blend;

      if (Math.abs(keyboardMotion.velocityX) < 0.5) {
        keyboardMotion.velocityX = 0;
      }
      if (Math.abs(keyboardMotion.velocityY) < 0.5) {
        keyboardMotion.velocityY = 0;
      }

      if (keyboardMotion.velocityX !== 0 || keyboardMotion.velocityY !== 0) {
        scheduleTransform((current) => ({
          ...current,
          x: current.x + keyboardMotion.velocityX * elapsed,
          y: current.y + keyboardMotion.velocityY * elapsed,
        }));
      }

      if (
        pressedPanKeys.size > 0 ||
        keyboardMotion.velocityX !== 0 ||
        keyboardMotion.velocityY !== 0
      ) {
        keyboardMotion.frame = window.requestAnimationFrame(tick);
      } else {
        keyboardMotion.frame = null;
        flushCommit();
      }
    }

    keyboardMotion.frame = window.requestAnimationFrame(tick);
  }

  /**
   * 停止键盘平移动画并提交最后位置。
   *
   * @returns 无返回值；同时清理已按下的方向键和速度。
   */
  function stopKeyboardMotion(): void {
    pressedPanKeys.clear();
    if (keyboardMotion.frame !== null) {
      window.cancelAnimationFrame(keyboardMotion.frame);
    }
    keyboardMotion.frame = null;
    keyboardMotion.velocityX = 0;
    keyboardMotion.velocityY = 0;
    flushCommit();
  }

  /**
   * 记录资料库画布的指针按下状态。
   *
   * @param event - 指针按下事件。
   * @returns 无返回值；交互控件上的按下事件不会启动画布拖拽。
   */
  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const primaryCardAction = target?.closest("[data-canvas-card-action]");
    const interactive = target?.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
    );
    if (interactive && interactive !== primaryCardAction) return;

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: liveTransformRef.current.x,
      originY: liveTransformRef.current.y,
      dragging: false,
    };
  }

  /**
   * 根据指针移动更新画布平移。
   *
   * @param event - 当前指针移动事件。
   * @returns 无返回值；首次超过阈值时才进入真正拖拽状态。
   */
  function handlePointerMove(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.dragging) {
      if (dx * dx + dy * dy < 36) return;
      drag.dragging = true;
      suppressClickUntil = performance.now() + 400;
      window.getSelection()?.removeAllRanges();
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.closest("[data-canvas-card-action]")
      ) {
        activeElement.blur();
      }
      const surface = event.currentTarget as HTMLElement;
      surface.dataset.dragging = "true";
      surface.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    scheduleTransform((current) => ({
      ...current,
      x: drag!.originX + dx,
      y: drag!.originY + dy,
    }));
  }

  /**
   * 结束指针拖拽并在拖动完成后提交位置。
   *
   * @param event - 指针结束事件。
   * @returns 无返回值；释放捕获并提交最后的画布变换。
   */
  function finishPointer(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDragging = drag.dragging;
    drag = null;
    if (wasDragging) suppressClickUntil = performance.now() + 250;

    const surface = event.currentTarget as HTMLElement;
    delete surface.dataset.dragging;
    if (surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    if (wasDragging) flushCommit();
  }

  /**
   * 抑制拖拽结束后紧跟着产生的误点击。
   *
   * @param event - 点击事件。
   * @returns 无返回值；只有处于拖拽抑制窗口时才阻止事件。
   */
  function handleClickCapture(event: MouseEvent): void {
    if (performance.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * 处理 Ctrl/Meta 缩放和普通滚轮平移。
   *
   * @param event - 浏览器滚轮事件。
   * @returns 无返回值；缩放围绕指针位置计算，普通滚轮则平移画布。
   */
  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const surface = surfaceRef.value;
    if (!surface) return;

    if (event.ctrlKey || event.metaKey) {
      const rect = surface.getBoundingClientRect();
      const pointerX = event.clientX - rect.left - rect.width / 2;
      const pointerY = event.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-event.deltaY * 0.002);
      scheduleTransform((current) => {
        const scale = Math.min(
          maxScale,
          Math.max(minScale, current.scale * factor),
        );
        const ratio = scale / current.scale;
        // 同步调整位置，使缩放前后指针下方仍指向画布中的同一内容。
        return {
          scale,
          x: pointerX - (pointerX - current.x) * ratio,
          y: pointerY - (pointerY - current.y) * ratio,
        };
      });
      return;
    }

    const baseMultiplier =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 24
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight * 0.82
          : 1;
    const multiplier = baseMultiplier * 1.15;
    const horizontalDelta =
      event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
    const verticalDelta =
      event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;

    scheduleTransform((current) => ({
      ...current,
      x: current.x - horizontalDelta * multiplier,
      y: current.y - verticalDelta * multiplier,
    }));
  }

  /**
   * 处理资料库键盘快捷键和方向键。
   *
   * @param event - 浏览器键盘事件。
   * @returns 无返回值；只处理画布自身获得焦点时的快捷键。
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    const action = getLibraryCanvasKeyboardAction(event.key);
    if (!action) return;

    event.preventDefault();
    if (action.kind === "reset") {
      reset();
    } else if (action.kind === "zoom") {
      zoom(action.factor);
    } else {
      pressedPanKeys.add(event.key);
      startKeyboardMotion();
    }
  }

  /**
   * 释放方向键并在没有按键后停止连续移动。
   *
   * @param event - 浏览器键盘事件。
   * @returns 无返回值；方向键释放后继续处理减速过程。
   */
  function handleKeyUp(event: KeyboardEvent): void {
    const action = getLibraryCanvasKeyboardAction(event.key);
    if (action?.kind !== "pan") return;
    event.preventDefault();
    pressedPanKeys.delete(event.key);
    startKeyboardMotion();
  }

  onMounted(() => {
    if (!active) return;
    const surface = surfaceRef.value;
    if (!surface) return;
    surface.addEventListener("wheel", handleWheel, { passive: false });
    initialFrame = window.requestAnimationFrame(() => {
      surface.focus({ preventScroll: true });
      applyFrame(liveTransformRef.current, true);
    });
  });

  onBeforeUnmount(() => {
    const surface = surfaceRef.value;
    surface?.removeEventListener("wheel", handleWheel);
    if (initialFrame !== null) window.cancelAnimationFrame(initialFrame);
    if (transformFrame !== null) window.cancelAnimationFrame(transformFrame);
    if (keyboardMotion.frame !== null) {
      window.cancelAnimationFrame(keyboardMotion.frame);
    }
    // 组件卸载时取消所有尚未执行的帧，防止回调继续访问已经失效的 DOM 和响应式状态。
    pressedPanKeys.clear();
  });

  return {
    atMaxZoom: computed(() => transform.value.scale >= maxScale - 0.001),
    atMinZoom: computed(() => transform.value.scale <= minScale + 0.001),
    focusTransform: transform,
    handleBlur: stopKeyboardMotion,
    handleClickCapture,
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    finishPointer,
    flushCommit,
    isDefault: computed(
      () =>
        Math.abs(transform.value.x) < 0.5 &&
        Math.abs(transform.value.y) < 0.5 &&
        Math.abs(transform.value.scale - defaultScaleValue) < 0.001,
    ),
    reset,
    setDefaultScale,
    transform,
    transformRef: liveTransformRef,
    zoom,
    zoomPercent: computed(() => Math.round(transform.value.scale * 100)),
  };
}
