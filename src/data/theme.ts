/**
 * 站点主题色的唯一数据来源。
 *
 * 主题色只描述"强调色"，不参与内容色（蓝/粉/绿/橙等语义色）的定义。
 * 所有界面组件都通过 `global.css` 里的 `--theme` 系列变量取得它，
 * 因此换色不需要改组件，只需要换掉 `:root` 上的那一个变量。
 */

/** 默认主题色：樱粉 #fb7299（rgb(251, 114, 153)）。 */
export const defaultThemeColor = "#fb7299";

/** 主题色预设项。 */
export interface ThemePreset {
  /** 预设标识，用于模板渲染的 key。 */
  id: string;
  /** 设置页显示名称。 */
  label: string;
  /** 预设色值，统一使用 6 位十六进制。 */
  value: string;
}

/**
 * 设置页提供的主题色预设。
 *
 * 海蓝是此前界面的蓝色强调色，紫藤是此前的紫色强调色，
 * 两者都保留在这里，方便随时切回改动前的观感。
 */
export const themePresets: ThemePreset[] = [
  { id: "sakura", label: "樱粉", value: defaultThemeColor },
  { id: "ocean", label: "海蓝", value: "#119dd9" },
  { id: "violet", label: "紫藤", value: "#7564de" },
  { id: "mint", label: "薄荷", value: "#35a57b" },
  { id: "apricot", label: "暖橘", value: "#ee9661" },
];

/**
 * 把单个通道值收敛到 0-255 的整数。
 *
 * @param value - 颜色解析出的数字通道。
 * @returns 合法的 8 位通道值，无法解析时返回 null。
 */
function channel(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 255) return null;
  return rounded;
}

/**
 * 将数字通道格式化为两位十六进制。
 *
 * @param value - 0-255 的通道值。
 * @returns 两位小写十六进制字符串。
 */
function toHexChannel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * 把 `rgb()` / `rgba()` 写法转换为十六进制。
 *
 * @param input - 去除首尾空白后的颜色文本。
 * @returns 转换后的十六进制颜色，无法解析时返回 null。
 */
function rgbToHex(input: string): string | null {
  const match = input.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i,
  );
  if (!match) return null;
  const channels = match.slice(1, 4).map((part) => channel(Number(part)));
  if (channels.some((part) => part === null)) return null;
  const [r, g, b] = channels as number[];
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

/**
 * 解析主题色输入，无法识别时返回 null。
 *
 * 支持 `#abc`、`#aabbcc`、`rgb(…)/rgba(…)` 三种写法，
 * 统一收敛为小写 6 位十六进制。设置页用它区分"还没输完"和"输入错误"，
 * 因此这里不做兜底，交给调用方决定回退值。
 *
 * @param value - 配置文件或颜色输入框中的未知值。
 * @returns 规范化后的十六进制颜色，无法解析时返回 null。
 */
export function parseThemeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  const hexMatch = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const body = hexMatch[1].toLowerCase();
    if (body.length === 6) return `#${body}`;
    const [r, g, b] = body.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return rgbToHex(input);
}

/**
 * 规范化主题色输入。
 *
 * 无法识别时回退到默认主题色，这样配置文件里写入脏数据
 * 也不会让页面失去强调色。
 *
 * @param value - 配置文件或颜色输入框中的未知值。
 * @returns 可直接写入 CSS 变量的十六进制颜色。
 */
export function normalizeThemeColor(value: unknown): string {
  return parseThemeColor(value) ?? defaultThemeColor;
}

/**
 * 判断给定色值是否命中某个预设，用于设置页高亮当前选中项。
 *
 * @param color - 已规范化的当前主题色。
 * @param preset - 待比较的预设项。
 * @returns 两者规范化后相同时返回 true。
 */
export function isThemePresetSelected(color: string, preset: ThemePreset): boolean {
  return normalizeThemeColor(color) === normalizeThemeColor(preset.value);
}
