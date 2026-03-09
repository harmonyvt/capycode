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
