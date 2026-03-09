import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { gitQueryKeys, gitWorktreesQueryOptions } from "../lib/gitReactQuery";
import { formatWorktreePathForDisplay } from "../worktreeCleanup";
import type { EnvMode } from "./BranchToolbar.logic";
import { Button } from "./ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "./ui/combobox";

interface BranchToolbarWorktreeSelectorProps {
  activeProjectCwd: string;
  activeThreadBranch: string | null;
  activeWorktreePath: string | null;
  effectiveEnvMode: EnvMode;
  onSelectLocal: (branch: string | null) => void;
  onSelectNewWorktree: (branch: string | null) => void;
  onSelectExistingWorktree: (branch: string | null, worktreePath: string) => void;
  onComposerFocusRequest?: () => void;
}

const LOCAL_ITEM_VALUE = "__local__";
const NEW_WORKTREE_ITEM_VALUE = "__new_worktree__";

function worktreeValue(path: string): string {
  return `__worktree__:${path}`;
}

function triggerLabel(input: {
  activeWorktreePath: string | null;
  effectiveEnvMode: EnvMode;
}): string {
  if (input.activeWorktreePath) {
    return formatWorktreePathForDisplay(input.activeWorktreePath);
  }
  return input.effectiveEnvMode === "worktree" ? "New worktree" : "Local project";
}

export function BranchToolbarWorktreeSelector({
  activeProjectCwd,
  activeThreadBranch,
  activeWorktreePath,
  effectiveEnvMode,
  onSelectLocal,
  onSelectNewWorktree,
  onSelectExistingWorktree,
  onComposerFocusRequest,
}: BranchToolbarWorktreeSelectorProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const worktreesQuery = useQuery(gitWorktreesQueryOptions(activeProjectCwd));
  const worktrees = worktreesQuery.data?.worktrees;
  const projectWorktree = useMemo(
    () => (worktrees ?? []).find((worktree) => worktree.path === activeProjectCwd) ?? null,
    [activeProjectCwd, worktrees],
  );
  const searchableWorktrees = useMemo(
    () => (worktrees ?? []).filter((worktree) => worktree.path !== activeProjectCwd),
    [activeProjectCwd, worktrees],
  );

  const itemValues = useMemo(
    () => [
      LOCAL_ITEM_VALUE,
      NEW_WORKTREE_ITEM_VALUE,
      ...searchableWorktrees.map((worktree) => worktreeValue(worktree.path)),
    ],
    [searchableWorktrees],
  );

  const worktreeByValue = useMemo(
    () =>
      new Map(searchableWorktrees.map((worktree) => [worktreeValue(worktree.path), worktree] as const)),
    [searchableWorktrees],
  );

  const filteredItemValues = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return itemValues;
    }
    return itemValues.filter((itemValue) => {
      if (itemValue === LOCAL_ITEM_VALUE) {
        return "local project".includes(query) || activeProjectCwd.toLowerCase().includes(query);
      }
      if (itemValue === NEW_WORKTREE_ITEM_VALUE) {
        return "new worktree".includes(query);
      }
      const worktree = worktreeByValue.get(itemValue);
      if (!worktree) {
        return false;
      }
      return (
        formatWorktreePathForDisplay(worktree.path).toLowerCase().includes(query) ||
        worktree.path.toLowerCase().includes(query) ||
        (worktree.branch?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [activeProjectCwd, itemValues, search, worktreeByValue]);

  const selectedValue = activeWorktreePath
    ? worktreeValue(activeWorktreePath)
    : effectiveEnvMode === "worktree"
      ? NEW_WORKTREE_ITEM_VALUE
      : LOCAL_ITEM_VALUE;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setSearch("");
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.worktrees(activeProjectCwd),
      });
    },
    [activeProjectCwd, queryClient],
  );

  const handleSelect = useCallback(
    (itemValue: string) => {
      if (itemValue === LOCAL_ITEM_VALUE) {
        onSelectLocal(projectWorktree?.branch ?? null);
      } else if (itemValue === NEW_WORKTREE_ITEM_VALUE) {
        onSelectNewWorktree(activeThreadBranch ?? projectWorktree?.branch ?? null);
      } else {
        const worktree = worktreeByValue.get(itemValue);
        if (!worktree) {
          return;
        }
        onSelectExistingWorktree(worktree.branch ?? null, worktree.path);
      }
      setIsOpen(false);
      onComposerFocusRequest?.();
    },
    [
      activeThreadBranch,
      onComposerFocusRequest,
      onSelectExistingWorktree,
      onSelectLocal,
      onSelectNewWorktree,
      projectWorktree?.branch,
      worktreeByValue,
    ],
  );

  return (
    <Combobox
      items={itemValues}
      filteredItems={filteredItemValues}
      onOpenChange={handleOpenChange}
      open={isOpen}
      value={selectedValue}
    >
      <ComboboxTrigger
        render={<Button variant="ghost" size="xs" />}
        className="text-muted-foreground/70 hover:text-foreground/80"
        disabled={worktreesQuery.isLoading}
      >
        <span className="max-w-[180px] truncate">
          {triggerLabel({ activeWorktreePath, effectiveEnvMode })}
        </span>
        <ChevronDownIcon />
      </ComboboxTrigger>
      <ComboboxPopup align="start" side="top" className="w-72">
        <div className="border-b p-1">
          <ComboboxInput
            className="[&_input]:font-sans rounded-md"
            inputClassName="ring-0"
            placeholder="Search worktrees..."
            showTrigger={false}
            size="sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ComboboxEmpty>No worktrees found.</ComboboxEmpty>
        <ComboboxList className="max-h-64">
          {filteredItemValues.map((itemValue, index) => {
            if (itemValue === LOCAL_ITEM_VALUE) {
              return (
                <ComboboxItem
                  hideIndicator
                  key={itemValue}
                  index={index}
                  value={itemValue}
                  onClick={() => handleSelect(itemValue)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">Local project</span>
                    <span className="truncate text-[10px] text-muted-foreground/55">
                      {projectWorktree?.branch ?? "Use the main repository checkout"}
                    </span>
                  </div>
                </ComboboxItem>
              );
            }

            if (itemValue === NEW_WORKTREE_ITEM_VALUE) {
              return (
                <ComboboxItem
                  hideIndicator
                  key={itemValue}
                  index={index}
                  value={itemValue}
                  onClick={() => handleSelect(itemValue)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">New worktree</span>
                    <span className="truncate text-[10px] text-muted-foreground/55">
                      Create from a base branch on first send
                    </span>
                  </div>
                </ComboboxItem>
              );
            }

            const worktree = worktreeByValue.get(itemValue);
            if (!worktree) {
              return null;
            }

            return (
              <ComboboxItem
                hideIndicator
                key={itemValue}
                index={index}
                value={itemValue}
                onClick={() => handleSelect(itemValue)}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{formatWorktreePathForDisplay(worktree.path)}</span>
                  <span className="truncate text-[10px] text-muted-foreground/55">
                    {worktree.branch ?? "Detached HEAD"} • {worktree.path}
                  </span>
                </div>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
