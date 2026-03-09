import type { GitListedWorktree } from "@t3tools/contracts";
import type { Thread } from "./types";

function normalizeWorktreePath(path: string | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function getOrphanedWorktreePathForThread(
  threads: readonly Thread[],
  threadId: Thread["id"],
): string | null {
  const targetThread = threads.find((thread) => thread.id === threadId);
  if (!targetThread) {
    return null;
  }

  const targetWorktreePath = normalizeWorktreePath(targetThread.worktreePath);
  if (!targetWorktreePath) {
    return null;
  }

  const isShared = threads.some((thread) => {
    if (thread.id === threadId) {
      return false;
    }
    return normalizeWorktreePath(thread.worktreePath) === targetWorktreePath;
  });

  return isShared ? null : targetWorktreePath;
}

export function formatWorktreePathForDisplay(worktreePath: string): string {
  const trimmed = worktreePath.trim();
  if (!trimmed) {
    return worktreePath;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  const lastPart = parts[parts.length - 1]?.trim() ?? "";
  return lastPart.length > 0 ? lastPart : trimmed;
}

export interface ProjectWorktreeOption {
  path: string;
  branch: string;
  current: boolean;
  displayName: string;
  threadWorktreePath: string | null;
  pr: GitListedWorktree["pr"];
}

export type WorktreeSortKey = "worktree" | "branch" | "pr";
export type WorktreeSortDirection = "asc" | "desc";

export interface WorktreeSortState {
  key: WorktreeSortKey;
  direction: WorktreeSortDirection;
}

export const DEFAULT_WORKTREE_SORT: WorktreeSortState = {
  key: "worktree",
  direction: "asc",
};

export function getProjectWorktreeOptions(
  projectCwd: string,
  worktrees: readonly GitListedWorktree[],
): ProjectWorktreeOption[] {
  const normalizedProjectCwd = normalizeWorktreePath(projectCwd);
  const seenPaths = new Set<string>();

  return worktrees
    .flatMap((worktree) => {
      const normalizedPath = normalizeWorktreePath(worktree.path);
      if (!normalizedPath || seenPaths.has(normalizedPath)) {
        return [];
      }
      seenPaths.add(normalizedPath);
      return [
        {
          path: normalizedPath,
          branch: worktree.branch,
          current: worktree.current,
          displayName: formatWorktreePathForDisplay(normalizedPath),
          threadWorktreePath:
            normalizedProjectCwd && normalizedPath === normalizedProjectCwd ? null : normalizedPath,
          pr: worktree.pr,
        },
      ];
    })
    .toSorted((a, b) => {
      const aPriority = a.current ? 0 : 1;
      const bPriority = b.current ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const byDisplayName = a.displayName.localeCompare(b.displayName);
      if (byDisplayName !== 0) return byDisplayName;
      return a.branch.localeCompare(b.branch);
    });
}

export function sortProjectWorktrees(
  worktrees: readonly ProjectWorktreeOption[],
  sort: WorktreeSortState,
): ProjectWorktreeOption[] {
  return [...worktrees].toSorted((left, right) => {
    let comparison = 0;

    if (sort.key === "branch") {
      comparison = left.branch.localeCompare(right.branch);
    } else if (sort.key === "pr") {
      const leftNumber = left.pr?.number ?? null;
      const rightNumber = right.pr?.number ?? null;
      if (leftNumber === null && rightNumber === null) {
        comparison = 0;
      } else if (leftNumber === null) {
        comparison = 1;
      } else if (rightNumber === null) {
        comparison = -1;
      } else {
        comparison = leftNumber - rightNumber;
      }
    } else {
      comparison = left.displayName.localeCompare(right.displayName);
    }

    if (comparison !== 0) {
      return sort.direction === "asc" ? comparison : -comparison;
    }
    if (left.current !== right.current) {
      return left.current ? -1 : 1;
    }
    if ((left.threadWorktreePath === null) !== (right.threadWorktreePath === null)) {
      return left.threadWorktreePath === null ? -1 : 1;
    }
    const byName = left.displayName.localeCompare(right.displayName);
    if (byName !== 0) return byName;
    return left.branch.localeCompare(right.branch);
  });
}

export function nextWorktreeSortState(
  current: WorktreeSortState,
  key: WorktreeSortKey,
): WorktreeSortState {
  if (current.key !== key) {
    return {
      key,
      direction: key === "pr" ? "desc" : "asc",
    };
  }
  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}
