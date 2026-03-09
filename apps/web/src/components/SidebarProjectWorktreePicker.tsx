import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDownIcon, Link2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { gitQueryKeys, gitWorktreesQueryOptions } from "../lib/gitReactQuery";
import { formatWorktreePathForDisplay } from "../worktreeCleanup";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { SidebarMenuAction } from "./ui/sidebar";

interface SidebarProjectWorktreePickerProps {
  projectName: string;
  projectCwd: string;
  onSelectWorktree: (input: { branch: string | null; worktreePath: string }) => void;
}

type WorktreeSortColumn = "name" | "branch" | "path";
type WorktreeSortDirection = "asc" | "desc";

interface WorktreeRow {
  name: string;
  branch: string | null;
  path: string;
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

function nextSortDirection(
  column: WorktreeSortColumn,
  activeColumn: WorktreeSortColumn,
  activeDirection: WorktreeSortDirection,
): WorktreeSortDirection {
  if (column !== activeColumn) {
    return "asc";
  }
  return activeDirection === "asc" ? "desc" : "asc";
}

function sortIndicator(
  column: WorktreeSortColumn,
  activeColumn: WorktreeSortColumn,
  activeDirection: WorktreeSortDirection,
): string {
  if (column !== activeColumn) {
    return "";
  }
  return activeDirection === "asc" ? " ↑" : " ↓";
}

export function SidebarProjectWorktreePicker({
  projectName,
  projectCwd,
  onSelectWorktree,
}: SidebarProjectWorktreePickerProps) {
  const queryClient = useQueryClient();
  const [sortColumn, setSortColumn] = useState<WorktreeSortColumn>("name");
  const [sortDirection, setSortDirection] = useState<WorktreeSortDirection>("asc");
  const worktreesQuery = useQuery({
    ...gitWorktreesQueryOptions(projectCwd),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const rows = useMemo<WorktreeRow[]>(
    () =>
      (worktreesQuery.data?.worktrees ?? [])
        .filter((worktree) => worktree.path !== projectCwd)
        .map((worktree) => ({
          name: formatWorktreePathForDisplay(worktree.path),
          branch: worktree.branch,
          path: worktree.path,
        })),
    [projectCwd, worktreesQuery.data?.worktrees],
  );

  const sortedRows = useMemo(() => {
    const sorted = rows.toSorted((left, right) => {
      const result =
        sortColumn === "name"
          ? left.name.localeCompare(right.name)
          : sortColumn === "branch"
            ? compareNullableText(left.branch, right.branch)
            : left.path.localeCompare(right.path);
      return sortDirection === "asc" ? result : -result;
    });
    return sorted;
  }, [rows, sortColumn, sortDirection]);

  const handleSort = (column: WorktreeSortColumn) => {
    setSortDirection((currentDirection) => nextSortDirection(column, sortColumn, currentDirection));
    setSortColumn(column);
  };

  const emptyMessage = worktreesQuery.isLoading
    ? "Loading worktrees..."
    : worktreesQuery.data?.isRepo === false
      ? "This folder is not a git repository."
      : "No existing worktrees found for this project.";

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        void queryClient.invalidateQueries({
          queryKey: gitQueryKeys.worktrees(projectCwd),
        });
      }}
    >
      <PopoverTrigger
        render={
          <SidebarMenuAction
            render={
              <button
                type="button"
                aria-label={`Create thread from an existing worktree in ${projectName}`}
                title="New thread from existing worktree"
              />
            }
            showOnHover
            className="top-1 right-7 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Link2Icon className="size-3.5" />
          </SidebarMenuAction>
        }
      />
      <PopoverPopup align="end" side="bottom" sideOffset={8} className="w-[34rem] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Link2Icon className="size-4 text-muted-foreground/70" />
            <span className="font-medium text-sm">{projectName}</span>
            <span className="text-muted-foreground/60 text-xs">Existing worktrees</span>
          </div>
        </div>
        {sortedRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">{emptyMessage}</div>
        ) : (
          <div className="px-2 py-2">
            <div className="overflow-hidden rounded-md border border-border/70">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border/70">
                    <th className="w-[30%] px-3 py-2 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
                        onClick={() => handleSort("name")}
                      >
                        Worktree
                        <ArrowUpDownIcon className="size-3.5" />
                        <span className="text-[11px] text-muted-foreground/65">
                          {sortIndicator("name", sortColumn, sortDirection).trim()}
                        </span>
                        <span className="sr-only">
                          Sort worktree{sortIndicator("name", sortColumn, sortDirection)}
                        </span>
                      </button>
                    </th>
                    <th className="w-[32%] px-3 py-2 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
                        onClick={() => handleSort("branch")}
                      >
                        Branch
                        <ArrowUpDownIcon className="size-3.5" />
                        <span className="text-[11px] text-muted-foreground/65">
                          {sortIndicator("branch", sortColumn, sortDirection).trim()}
                        </span>
                        <span className="sr-only">
                          Sort branch{sortIndicator("branch", sortColumn, sortDirection)}
                        </span>
                      </button>
                    </th>
                    <th className="w-[38%] px-3 py-2 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
                        onClick={() => handleSort("path")}
                      >
                        Path
                        <ArrowUpDownIcon className="size-3.5" />
                        <span className="text-[11px] text-muted-foreground/65">
                          {sortIndicator("path", sortColumn, sortDirection).trim()}
                        </span>
                        <span className="sr-only">
                          Sort path{sortIndicator("path", sortColumn, sortDirection)}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
              </table>
              <ScrollArea
                className="h-[min(24rem,calc(100vh-18rem))]"
                scrollbarGutter
              >
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr
                        key={row.path}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-b border-border/60 bg-background transition-colors hover:bg-accent/40 last:border-b-0"
                        onClick={() => onSelectWorktree({ branch: row.branch, worktreePath: row.path })}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          onSelectWorktree({ branch: row.branch, worktreePath: row.path });
                        }}
                      >
                        <td className="w-[30%] px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <Link2Icon className="size-3.5 shrink-0 text-muted-foreground/65" />
                            <span className="truncate font-medium">{row.name}</span>
                          </div>
                        </td>
                        <td className="w-[32%] px-3 py-2.5 text-muted-foreground/80">
                          <span className="block truncate">{row.branch ?? "detached"}</span>
                        </td>
                        <td className="w-[38%] px-3 py-2.5 text-muted-foreground/70">
                          <span className="block truncate">{row.path}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
            <div className="flex items-center justify-between px-2 pt-2 text-muted-foreground/60 text-[11px]">
              <span>Click a row to start a thread in that worktree.</span>
              <span>{sortedRows.length} worktrees</span>
            </div>
          </div>
        )}
      </PopoverPopup>
    </Popover>
  );
}
