import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

/**
 * 判断未知值是否为可安全读取属性的普通对象。
 *
 * @param value - 待判断的未知值。
 * @returns 值为非数组对象时返回 true。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 读取 JSON 文件；文件不存在或内容损坏时返回空值。
 *
 * @param path - JSON 文件的绝对路径。
 * @returns 解析后的未知 JSON 值；读取或解析失败时返回 null。
 */
export async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * 将 JSON 通过临时文件写入，减少中断时留下半份文件的概率。
 *
 * @param path - 目标 JSON 文件的绝对路径。
 * @param value - 需要序列化的 JSON 值。
 * @returns 文件写入完成后结束的异步任务。
 */
export async function writeJsonFileAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
