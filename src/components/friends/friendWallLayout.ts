import type { FriendLink } from "../../data/types";
import { packItems } from "../../composables/usePackedLayout";

/** 友联卡片在墙面布局中的形状类型。 */
export type FriendShape = "portrait" | "square" | "wide";

/** 已完成排版的友联卡片及其动画参数。 */
export interface PositionedFriend {
  /** 对应的友联数据。 */
  friend: FriendLink;
  /** 卡片宽度。 */
  width: number;
  /** 卡片高度。 */
  height: number;
  /** 相对画布左侧的位置。 */
  left: number;
  /** 相对画布顶部的位置。 */
  top: number;
  /** 卡片形状。 */
  shape: FriendShape;
  /** 卡片轻微旋转角度。 */
  tilt: number;
  /** 卡片进入动画延迟。 */
  delay: number;
}

/** 友联墙画布及卡片列表。 */
export interface FriendLayout {
  /** 画布宽度。 */
  canvasWidth: number;
  /** 画布高度。 */
  canvasHeight: number;
  /** 已排版的友联卡片。 */
  friends: PositionedFriend[];
}

interface FriendWallSlot {
  width: number;
  height: number;
  shape: FriendShape;
  tilt: number;
}

const desktopCardVariants: FriendWallSlot[] = [
  { width: 430, height: 230, shape: "wide", tilt: -1.1 },
  { width: 300, height: 290, shape: "portrait", tilt: 0.8 },
  { width: 385, height: 220, shape: "wide", tilt: -0.55 },
  { width: 300, height: 300, shape: "portrait", tilt: 1.05 },
  { width: 330, height: 290, shape: "portrait", tilt: -0.85 },
  { width: 430, height: 220, shape: "wide", tilt: 0.55 },
  { width: 350, height: 260, shape: "square", tilt: -0.95 },
  { width: 440, height: 220, shape: "wide", tilt: 0.7 },
  { width: 420, height: 220, shape: "wide", tilt: 0.7 },
  { width: 300, height: 300, shape: "portrait", tilt: -0.9 },
  { width: 430, height: 220, shape: "wide", tilt: -0.45 },
  { width: 300, height: 300, shape: "portrait", tilt: 0.95 },
];

/**
 * 把友联卡片转换为稳定的墙面排版结果。
 *
 * @param items - 需要放入友联墙的友联列表。
 * @returns 包含画布尺寸、卡片位置和动画参数的排版结果。
 */
export function createFriendWallLayout(items: FriendLink[]): FriendLayout {
  const canvasWidth = 2100;
  const packedItems = packItems(
    items.map((friend, index) => {
      const slot = desktopCardVariants[index % desktopCardVariants.length];
      return {
        friend,
        width: slot.width,
        height: slot.height,
        shape: slot.shape,
        tilt: slot.tilt,
        delay: Math.min(index * 42, 420),
      };
    }),
    {
      canvasWidth,
      gap: 26,
      padding: 86,
      minHeight: 900,
    },
  );

  return {
    canvasWidth,
    canvasHeight: packedItems.height,
    friends: packedItems.items,
  };
}
