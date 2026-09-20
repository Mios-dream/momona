import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface PanPoint {
  /** 指针按下时的横坐标。 */
  x: number;
  /** 指针按下时的纵坐标。 */
  y: number;
}

const DEFAULT_SCALE = 0.75;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.2;
const WHEEL_SENSITIVITY = 1.7;
const PAN_EASE = 0.22;

/**
 * 为资料库自由画布提供缩放、拖拽和滚轮平移状态。
 *
 * 逻辑与页面展示分离，资料库页面只需要绑定返回的事件方法即可，避免在
 * 模板组件中混合处理指针坐标、缩放限制和 CSS transform。
 */
export const usePanZoom = () => {
  const scale = ref(DEFAULT_SCALE);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const isPanning = ref(false);
  const pointerStart = ref<PanPoint>({ x: 0, y: 0 });
  const originOffset = ref<PanPoint>({ x: 0, y: 0 });
  let panFrame: number | null = null;
  let targetOffsetX = 0;
  let targetOffsetY = 0;

  /** 资料库在不同屏幕上保持同一套世界坐标，只改变可见范围。 */
  const getDefaultScale = (): number => DEFAULT_SCALE;

  /** 画布当前的 CSS 变换。 */
  const canvasStyle = computed(() => ({
    transform: `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`,
  }));

  /** 当前缩放百分比，供工具条显示。 */
  const scaleLabel = computed(() => `${Math.round(scale.value * 100)}%`);

  /** 是否仍处于默认中心位置。 */
  const isCentered = computed(
    () => offsetX.value === 0 && offsetY.value === 0 && scale.value === getDefaultScale(),
  );

  /**
   * 将画布缩放到指定增量，并限制在可用范围内。
   */
  const changeScale = (delta: number): void => {
    scale.value = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Number((scale.value + delta).toFixed(2))),
    );
  };

  /** 放大画布。 */
  const zoomIn = (): void => changeScale(0.1);

  /** 缩小画布。 */
  const zoomOut = (): void => changeScale(-0.1);

  const stopPanAnimation = (): void => {
    if (panFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(panFrame);
    }
    panFrame = null;
    targetOffsetX = offsetX.value;
    targetOffsetY = offsetY.value;
  };

  const animateWheelPan = (): void => {
    panFrame = null;
    const distanceX = targetOffsetX - offsetX.value;
    const distanceY = targetOffsetY - offsetY.value;

    if (Math.abs(distanceX) < 0.4 && Math.abs(distanceY) < 0.4) {
      offsetX.value = targetOffsetX;
      offsetY.value = targetOffsetY;
      return;
    }

    offsetX.value += distanceX * PAN_EASE;
    offsetY.value += distanceY * PAN_EASE;
    panFrame = window.requestAnimationFrame(animateWheelPan);
  };

  const scheduleWheelPan = (): void => {
    if (panFrame !== null) return;
    panFrame = window.requestAnimationFrame(animateWheelPan);
  };

  /** 响应画布滚轮，滚动的是世界坐标而不是浏览器页面。 */
  const handleWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();

    if (panFrame === null) {
      targetOffsetX = offsetX.value;
      targetOffsetY = offsetY.value;
    }

    const baseMultiplier =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 24
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight * 0.82
          : 1;
    const multiplier = baseMultiplier * WHEEL_SENSITIVITY;
    const horizontalDelta = event.shiftKey && event.deltaX === 0
      ? event.deltaY
      : event.deltaX;

    targetOffsetX -= horizontalDelta * multiplier;
    targetOffsetY -= event.shiftKey && event.deltaX === 0
      ? 0
      : event.deltaY * multiplier;
    scheduleWheelPan();
  };

  const moveByKeyboard = (deltaX: number, deltaY: number): void => {
    stopPanAnimation();
    targetOffsetX += deltaX;
    targetOffsetY += deltaY;
    offsetX.value = targetOffsetX;
    offsetY.value = targetOffsetY;
  };

  /** 为桌面端提供与目标站一致的键盘平移、缩放和复位。 */
  const handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0') {
      event.preventDefault();
      resetCanvas();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveByKeyboard(24, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveByKeyboard(-24, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveByKeyboard(0, 24);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveByKeyboard(0, -24);
    }
  };

  /**
   * 将画布恢复到目标站点类似的初始视图。
   */
  const resetCanvas = (): void => {
    stopPanAnimation();
    scale.value = getDefaultScale();
    offsetX.value = 0;
    offsetY.value = 0;
    targetOffsetX = 0;
    targetOffsetY = 0;
  };

  /**
   * 记录拖动画布开始时的指针和偏移量。
   */
  const startPan = (event: PointerEvent): void => {
    stopPanAnimation();
    isPanning.value = true;
    pointerStart.value = { x: event.clientX, y: event.clientY };
    originOffset.value = { x: offsetX.value, y: offsetY.value };
    const target = event.currentTarget as HTMLElement | null;
    target?.focus({ preventScroll: true });
    target?.setPointerCapture(event.pointerId);
  };

  /**
   * 根据当前指针位置更新画布偏移量。
   */
  const movePan = (event: PointerEvent): void => {
    if (!isPanning.value) return;
    offsetX.value = originOffset.value.x + event.clientX - pointerStart.value.x;
    offsetY.value = originOffset.value.y + event.clientY - pointerStart.value.y;
  };

  /**
   * 结束当前拖动手势。
   */
  const endPan = (event: PointerEvent): void => {
    isPanning.value = false;
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  };

  onMounted(() => {
    resetCanvas();
    window.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    stopPanAnimation();
    window.removeEventListener('keydown', handleKeydown);
  });

  return {
    canvasStyle,
    endPan,
    handleWheel,
    isCentered,
    isPanning,
    movePan,
    offsetX,
    offsetY,
    resetCanvas,
    scale,
    scaleLabel,
    startPan,
    zoomIn,
    zoomOut,
  };
};
