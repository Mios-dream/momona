import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import type { LibraryCanvasTransform } from "../utils/libraryCanvas";

const KEYBOARD_PAN_SPEED = 540;
const KEYBOARD_PAN_ACCELERATION = 16;
const KEYBOARD_PAN_DECELERATION = 11;

export type LibraryCanvasKeyboardAction =
  | { kind: "pan"; x: number; y: number }
  | { kind: "zoom"; factor: number }
  | { kind: "reset" };

export const getLibraryCanvasKeyboardAction = (
  key: string,
): LibraryCanvasKeyboardAction | null => {
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
};

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

export const useLibraryCanvasControls = ({
  active,
  defaultScale,
  maxScale,
  minScale,
  surfaceRef,
  onPaint,
  shouldCommit,
}: LibraryCanvasControlsOptions) => {
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

  const applyFrame = (
    next: LibraryCanvasTransform,
    shouldForceCommit: boolean,
  ): void => {
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
  };

  const scheduleTransform = (
    update: (current: LibraryCanvasTransform) => LibraryCanvasTransform,
    shouldForceCommit = false,
  ): void => {
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
  };

  const flushCommit = (): void => {
    if (transformFrame !== null) {
      window.cancelAnimationFrame(transformFrame);
      transformFrame = null;
    }
    forceCommit = false;
    applyFrame(pendingTransform, true);
  };

  const reset = (): void => {
    scheduleTransform(
      () => ({ x: 0, y: 0, scale: defaultScaleValue }),
      true,
    );
  };

  const setDefaultScale = (nextScale: number): void => {
    if (!Number.isFinite(nextScale) || nextScale <= 0) return;
    defaultScaleValue = nextScale;
    reset();
  };

  const zoom = (factor: number): void => {
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
  };

  const keyboardDirection = (): { x: number; y: number } => {
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
  };

  const startKeyboardMotion = (): void => {
    if (keyboardMotion.frame !== null) return;
    let previousTime = performance.now();

    const tick = (time: number): void => {
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
    };

    keyboardMotion.frame = window.requestAnimationFrame(tick);
  };

  const stopKeyboardMotion = (): void => {
    pressedPanKeys.clear();
    if (keyboardMotion.frame !== null) {
      window.cancelAnimationFrame(keyboardMotion.frame);
    }
    keyboardMotion.frame = null;
    keyboardMotion.velocityX = 0;
    keyboardMotion.velocityY = 0;
    flushCommit();
  };

  const handlePointerDown = (event: PointerEvent): void => {
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
  };

  const handlePointerMove = (event: PointerEvent): void => {
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
  };

  const finishPointer = (event: PointerEvent): void => {
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
  };

  const handleClickCapture = (event: MouseEvent): void => {
    if (performance.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleWheel = (event: WheelEvent): void => {
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
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
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
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const action = getLibraryCanvasKeyboardAction(event.key);
    if (action?.kind !== "pan") return;
    event.preventDefault();
    pressedPanKeys.delete(event.key);
    startKeyboardMotion();
  };

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
};
