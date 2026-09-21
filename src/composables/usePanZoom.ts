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
 * 创建友联画布使用的拖拽、滚轮缩放和键盘平移状态。
 *
 * 逻辑与页面展示分离，页面只需要绑定返回的事件方法即可，避免在模板中
 * 混合处理指针坐标、缩放限制和 CSS transform。
 *
 * @returns 画布样式、状态和交互事件处理方法。
 */
export function usePanZoom() {
  const scale = ref(DEFAULT_SCALE);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const isPanning = ref(false);
  const pointerStart = ref<PanPoint>({ x: 0, y: 0 });
  const originOffset = ref<PanPoint>({ x: 0, y: 0 });
  let panFrame: number | null = null;
  let targetOffsetX = 0;
  let targetOffsetY = 0;

  /**
   * 返回画布初始缩放比例。
   *
   * @returns 画布首次显示时使用的缩放比例。
   */
  function getDefaultScale(): number {
    return DEFAULT_SCALE;
  }

  /** 画布当前的 CSS 变换。 */
  const canvasStyle = computed(() => ({
    transform: `translate3d(calc(-50% + ${offsetX.value}px), calc(-50% + ${offsetY.value}px), 0) scale(${scale.value})`,
  }));

  /** 当前缩放百分比，供工具条显示。 */
  const scaleLabel = computed(() => `${Math.round(scale.value * 100)}%`);

  /** 是否仍处于默认中心位置。 */
  const isCentered = computed(
    () => offsetX.value === 0 && offsetY.value === 0 && scale.value === getDefaultScale(),
  );

  /**
   * 按增量修改缩放比例，并保持在画布允许范围内。
   *
   * @param delta - 需要叠加到当前缩放比例上的增量。
   * @returns 无返回值；缩放结果写入响应式状态。
   */
  function changeScale(delta: number): void {
    scale.value = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Number((scale.value + delta).toFixed(2))),
    );
  }

  /**
   * 放大画布一次。
   *
   * @returns 无返回值；缩放结果由 changeScale 统一限制范围。
   */
  function zoomIn(): void {
    changeScale(0.1);
  }

  /**
   * 缩小画布一次。
   *
   * @returns 无返回值；缩放结果由 changeScale 统一限制范围。
   */
  function zoomOut(): void {
    changeScale(-0.1);
  }

  /**
   * 取消未完成的滚轮平移动画。
   *
   * @returns 无返回值；同时把动画目标同步到当前偏移量。
   */
  function stopPanAnimation(): void {
    if (panFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(panFrame);
    }
    panFrame = null;
    targetOffsetX = offsetX.value;
    targetOffsetY = offsetY.value;
  }

  /**
   * 使用动画帧平滑衰减滚轮位移。
   *
   * @returns 无返回值；动画未完成时会继续安排下一帧。
   */
  function animateWheelPan(): void {
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
  }

  /**
   * 在尚未存在动画帧时安排滚轮平移。
   *
   * @returns 无返回值；重复的滚轮事件共用同一条动画循环。
   */
  function scheduleWheelPan(): void {
    if (panFrame !== null) return;
    panFrame = window.requestAnimationFrame(animateWheelPan);
  }

  /**
   * 处理画布滚轮事件；修饰键缩放交给浏览器。
   *
   * @param event - 浏览器产生的滚轮事件。
   * @returns 无返回值；滚动位移写入动画目标。
   */
  function handleWheel(event: WheelEvent): void {
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
  }

  /**
   * 按键盘方向移动画布。
   *
   * @param deltaX - 横向移动的像素增量。
   * @param deltaY - 纵向移动的像素增量。
   * @returns 无返回值；移动会立即写入画布偏移量。
   */
  function moveByKeyboard(deltaX: number, deltaY: number): void {
    stopPanAnimation();
    targetOffsetX += deltaX;
    targetOffsetY += deltaY;
    offsetX.value = targetOffsetX;
    offsetY.value = targetOffsetY;
  }

  /**
   * 处理画布快捷键，输入控件获得焦点时不拦截。
   *
   * @param event - 浏览器产生的键盘事件。
   * @returns 无返回值；已识别的快捷键会阻止默认行为。
   */
  function handleKeydown(event: KeyboardEvent): void {
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
  }

  /**
   * 将画布恢复到居中和默认缩放状态。
   *
   * @returns 无返回值；清理动画并重置全部画布坐标。
   */
  function resetCanvas(): void {
    stopPanAnimation();
    scale.value = getDefaultScale();
    offsetX.value = 0;
    offsetY.value = 0;
    targetOffsetX = 0;
    targetOffsetY = 0;
  }

  /**
   * 记录一次画布指针拖拽的起点。
   *
   * @param event - 指针按下事件，提供起点和捕获目标。
   * @returns 无返回值；后续移动会基于本次起点计算偏移。
   */
  function startPan(event: PointerEvent): void {
    stopPanAnimation();
    isPanning.value = true;
    pointerStart.value = { x: event.clientX, y: event.clientY };
    originOffset.value = { x: offsetX.value, y: offsetY.value };
    const target = event.currentTarget as HTMLElement | null;
    target?.focus({ preventScroll: true });
    target?.setPointerCapture(event.pointerId);
  }

  /**
   * 根据指针位移更新画布偏移量。
   *
   * @param event - 当前指针移动事件。
   * @returns 无返回值；未处于拖拽状态时直接忽略事件。
   */
  function movePan(event: PointerEvent): void {
    if (!isPanning.value) return;
    offsetX.value = originOffset.value.x + event.clientX - pointerStart.value.x;
    offsetY.value = originOffset.value.y + event.clientY - pointerStart.value.y;
  }

  /**
   * 结束当前画布拖拽并释放指针捕获。
   *
   * @param event - 指针结束事件，提供需要释放的指针 ID。
   * @returns 无返回值；后续指针移动不再改变画布。
   */
  function endPan(event: PointerEvent): void {
    isPanning.value = false;
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }

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
}
