import type { GitListedWorktree } from "@t3tools/contracts";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "./types";
import {
  DEFAULT_WORKTREE_SORT,
  formatWorktreePathForDisplay,
  getOrphanedWorktreePathForThread,
  getProjectWorktreeOptions,
  nextWorktreeSortState,
  sortProjectWorktrees,
} from "./worktreeCleanup";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    model: "gpt-5.3-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-02-13T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    ...overrides,
  };
}

function makeListedWorktree(overrides: Partial<GitListedWorktree> = {}): GitListedWorktree {
  return {
    path: "/Users/test/conductor/workspaces/capycode/hartford-v1",
    branch: "feature/default",
    current: false,
    pr: null,
    ...overrides,
  };
}

describe("getOrphanedWorktreePathForThread", () => {
  it("returns null when the target thread does not exist", () => {
    const result = getOrphanedWorktreePathForThread([], ThreadId.makeUnsafe("missing-thread"));
    expect(result).toBeNull();
  });

  it("returns null when the target thread has no worktree", () => {
    const threads = [makeThread()];
    const result = getOrphanedWorktreePathForThread(threads, ThreadId.makeUnsafe("thread-1"));
    expect(result).toBeNull();
  });

  it("returns the path when no other thread links to that worktree", () => {
    const threads = [makeThread({ worktreePath: "/tmp/repo/worktrees/feature-a" })];
    const result = getOrphanedWorktreePathForThread(threads, ThreadId.makeUnsafe("thread-1"));
    expect(result).toBe("/tmp/repo/worktrees/feature-a");
  });

  it("returns null when another thread links to the same worktree", () => {
    const threads = [
      makeThread({
        id: ThreadId.makeUnsafe("thread-1"),
        worktreePath: "/tmp/repo/worktrees/feature-a",
      }),
      makeThread({
        id: ThreadId.makeUnsafe("thread-2"),
        worktreePath: "/tmp/repo/worktrees/feature-a",
      }),
    ];
    const result = getOrphanedWorktreePathForThread(threads, ThreadId.makeUnsafe("thread-1"));
    expect(result).toBeNull();
  });

  it("ignores threads linked to different worktrees", () => {
    const threads = [
      makeThread({
        id: ThreadId.makeUnsafe("thread-1"),
        worktreePath: "/tmp/repo/worktrees/feature-a",
      }),
      makeThread({
        id: ThreadId.makeUnsafe("thread-2"),
        worktreePath: "/tmp/repo/worktrees/feature-b",
      }),
    ];
    const result = getOrphanedWorktreePathForThread(threads, ThreadId.makeUnsafe("thread-1"));
    expect(result).toBe("/tmp/repo/worktrees/feature-a");
  });
});

describe("formatWorktreePathForDisplay", () => {
  it("shows only the last path segment for unix-like paths", () => {
    const result = formatWorktreePathForDisplay(
      "/Users/julius/.t3/worktrees/t3code-mvp/t3code-4e609bb8",
    );
    expect(result).toBe("t3code-4e609bb8");
  });

  it("normalizes windows separators before selecting the final segment", () => {
    const result = formatWorktreePathForDisplay(
      "C:\\Users\\julius\\.t3\\worktrees\\t3code-mvp\\t3code-4e609bb8",
    );
    expect(result).toBe("t3code-4e609bb8");
  });

  it("uses the final segment even when outside ~/.t3/worktrees", () => {
    const result = formatWorktreePathForDisplay("/tmp/custom-worktrees/my-worktree");
    expect(result).toBe("my-worktree");
  });

  it("ignores trailing slashes", () => {
    const result = formatWorktreePathForDisplay("/tmp/custom-worktrees/my-worktree/");
    expect(result).toBe("my-worktree");
  });
});

describe("getProjectWorktreeOptions", () => {
  it("maps the active project workspace to a local thread path", () => {
    const result = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        current: true,
      }),
    ]);

    expect(result).toEqual([
      {
        path: "/Users/test/conductor/workspaces/capycode/hartford-v1",
        branch: "feature/default",
        current: true,
        displayName: "hartford-v1",
        threadWorktreePath: null,
        pr: null,
      },
    ]);
  });

  it("keeps sibling worktrees as explicit thread worktree paths", () => {
    const result = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/lisbon-v1",
        branch: "feature/lisbon",
      }),
    ]);

    expect(result[0]).toEqual({
      path: "/Users/test/conductor/workspaces/capycode/lisbon-v1",
      branch: "feature/lisbon",
      current: false,
      displayName: "lisbon-v1",
      threadWorktreePath: "/Users/test/conductor/workspaces/capycode/lisbon-v1",
      pr: null,
    });
  });

  it("deduplicates repeated paths and sorts current worktree first", () => {
    const result = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/lisbon-v1",
        branch: "feature/lisbon",
      }),
      makeListedWorktree({
        current: true,
      }),
      makeListedWorktree({
        current: true,
      }),
    ]);

    expect(result.map((worktree) => worktree.displayName)).toEqual(["hartford-v1", "lisbon-v1"]);
  });

  it("preserves cached PR metadata for display", () => {
    const result = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        pr: {
          number: 9,
          title: "Add sortable worktree table",
          url: "https://github.com/example/repo/pull/9",
          baseBranch: "main",
          headBranch: "feature/default",
          state: "open",
        },
      }),
    ]);

    expect(result[0]?.pr?.title).toBe("Add sortable worktree table");
  });
});

describe("sortProjectWorktrees", () => {
  it("sorts PRs by numeric PR number descending by default", () => {
    const worktrees = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/pr-120",
        branch: "feature/pr-120",
        pr: {
          number: 120,
          title: "Lower title",
          url: "https://github.com/example/repo/pull/120",
          baseBranch: "main",
          headBranch: "feature/pr-120",
          state: "open",
        },
      }),
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/pr-9",
        branch: "feature/pr-9",
        pr: {
          number: 9,
          title: "Higher title",
          url: "https://github.com/example/repo/pull/9",
          baseBranch: "main",
          headBranch: "feature/pr-9",
          state: "open",
        },
      }),
    ]);

    const result = sortProjectWorktrees(worktrees, { key: "pr", direction: "desc" });

    expect(result.map((worktree) => worktree.pr?.number)).toEqual([120, 9]);
  });

  it("sorts PRs by numeric PR number ascending when toggled", () => {
    const worktrees = getProjectWorktreeOptions("/Users/test/conductor/workspaces/capycode/hartford-v1", [
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/pr-120",
        branch: "feature/pr-120",
        pr: {
          number: 120,
          title: "PR 120",
          url: "https://github.com/example/repo/pull/120",
          baseBranch: "main",
          headBranch: "feature/pr-120",
          state: "open",
        },
      }),
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/no-pr",
        branch: "feature/no-pr",
      }),
      makeListedWorktree({
        path: "/Users/test/conductor/workspaces/capycode/pr-9",
        branch: "feature/pr-9",
        pr: {
          number: 9,
          title: "PR 9",
          url: "https://github.com/example/repo/pull/9",
          baseBranch: "main",
          headBranch: "feature/pr-9",
          state: "open",
        },
      }),
    ]);

    const result = sortProjectWorktrees(worktrees, { key: "pr", direction: "asc" });

    expect(result.map((worktree) => worktree.pr?.number ?? null)).toEqual([9, 120, null]);
  });
});

describe("nextWorktreeSortState", () => {
  it("defaults PR sorting to descending when first selected", () => {
    const result = nextWorktreeSortState(DEFAULT_WORKTREE_SORT, "pr");
    expect(result).toEqual({ key: "pr", direction: "desc" });
  });
});
