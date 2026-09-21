import type {
  GitHubRepositorySort,
  RepositorySummary,
} from "../../data/types";

/**
 * 按页面配置对统一仓库摘要排序，并保留输入数组不变。
 *
 * 仓库已经由具体来源适配为统一结构，排序属于跨页面复用的展示规则，
 * 因此不应继续放在 GitHub 远程 provider 内部。
 *
 * @param repositories - 待排序的统一仓库摘要列表。
 * @param sort - 排序方式，默认按最近更新时间排序。
 * @returns 新数组形式的排序结果。
 */
export function sortRepositories(
  repositories: RepositorySummary[],
  sort: GitHubRepositorySort = "updated",
): RepositorySummary[] {
  const result = repositories.slice();
  result.sort((left, right) => {
    if (sort === "stars") {
      return right.stars - left.stars || right.forks - left.forks;
    }
    if (sort === "forks") {
      return right.forks - left.forks || right.stars - left.stars;
    }
    if (sort === "name") {
      return left.name.localeCompare(right.name, "zh-CN", {
        sensitivity: "base",
      });
    }
    const rightTime = Date.parse(right.updatedAt);
    const leftTime = Date.parse(left.updatedAt);
    return (
      (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0) ||
      right.stars - left.stars
    );
  });
  return result;
}
