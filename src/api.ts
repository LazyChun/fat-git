import { useCallback, useEffect, useRef, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import type {
  AutoResult,
  AutoStatus,
  BranchData,
  Changes,
  CommitDetail,
  DiffResult,
  GraphData,
  Settings,
  Summary,
} from "./types";

const CHANGED = "fat-git.changed";

export class ApiError extends Error {
  canForce: boolean;

  constructor(message: string, canForce = false) {
    super(message);
    this.name = "ApiError";
    this.canForce = canForce;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

interface ResultShape {
  ok?: boolean;
  error?: string;
  canForce?: boolean;
}

async function call<T>(
  sdk: FatNotesPluginSDK,
  handler: string,
  params?: Record<string, unknown>,
  timeout?: number,
): Promise<T> {
  try {
    const result = await sdk.backend.invoke<T & ResultShape>(handler, params, timeout);
    if (result && typeof result === "object" && result.ok === false) {
      throw new ApiError(result.error || "git.failed", Boolean(result.canForce));
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(errorText(error));
  }
}

function touch(sdk: FatNotesPluginSDK): void {
  try {
    sdk.events.emit(CHANGED, {});
  } catch {
    // 事件总线不可用时，各页面自己的刷新仍然有效。
  }
}

export function onChanged(sdk: FatNotesPluginSDK, cb: () => void) {
  return sdk.events.on(CHANGED, () => cb());
}

export async function getSummary(sdk: FatNotesPluginSDK): Promise<Summary> {
  const result = await call<{ summary: Summary }>(sdk, "summary");
  return result.summary;
}

export async function getChanges(sdk: FatNotesPluginSDK): Promise<Changes> {
  const result = await call<{ changes: Changes }>(sdk, "changes");
  return result.changes;
}

export async function getDiff(
  sdk: FatNotesPluginSDK,
  path: string,
  mode: string,
): Promise<DiffResult> {
  const result = await call<{ diff: DiffResult }>(sdk, "diff", { path, mode });
  return result.diff;
}

export async function stage(sdk: FatNotesPluginSDK, paths: string[]): Promise<void> {
  await call(sdk, "stage", { paths });
  touch(sdk);
}

export async function stageAll(sdk: FatNotesPluginSDK): Promise<void> {
  await call(sdk, "stageAll");
  touch(sdk);
}

export async function unstage(sdk: FatNotesPluginSDK, paths: string[]): Promise<void> {
  await call(sdk, "unstage", { paths });
  touch(sdk);
}

export async function unstageAll(sdk: FatNotesPluginSDK): Promise<void> {
  await call(sdk, "unstageAll");
  touch(sdk);
}

export async function discard(
  sdk: FatNotesPluginSDK,
  path: string,
  untracked: boolean,
): Promise<void> {
  await call(sdk, "discard", { path, untracked });
  touch(sdk);
}

export async function commit(sdk: FatNotesPluginSDK, message: string): Promise<void> {
  await call(sdk, "commit", { message }, 45);
  touch(sdk);
}

export async function setIdentity(
  sdk: FatNotesPluginSDK,
  name: string,
  email: string,
): Promise<void> {
  await call(sdk, "setIdentity", { name, email });
  touch(sdk);
}

export async function getGraph(sdk: FatNotesPluginSDK, limit: number): Promise<GraphData> {
  const result = await call<{ graph: GraphData }>(sdk, "graph", { limit }, 40);
  return result.graph;
}

export async function getCommit(sdk: FatNotesPluginSDK, rev: string): Promise<CommitDetail> {
  const result = await call<{ commit: CommitDetail }>(sdk, "commitDetail", { rev });
  return result.commit;
}

export async function getCommitFileDiff(
  sdk: FatNotesPluginSDK,
  rev: string,
  path: string,
): Promise<DiffResult> {
  const result = await call<{ diff: DiffResult }>(sdk, "commitFileDiff", { rev, path });
  return result.diff;
}

export async function getBranches(sdk: FatNotesPluginSDK): Promise<BranchData> {
  const result = await call<{ branches: BranchData }>(sdk, "branches");
  return result.branches;
}

export async function createBranch(
  sdk: FatNotesPluginSDK,
  name: string,
  checkout: boolean,
): Promise<void> {
  await call(sdk, "createBranch", { name, checkout });
  touch(sdk);
}

export async function checkout(
  sdk: FatNotesPluginSDK,
  name: string,
  remote = false,
): Promise<void> {
  await call(sdk, "checkout", { name, remote });
  touch(sdk);
}

export async function deleteBranch(
  sdk: FatNotesPluginSDK,
  name: string,
  force: boolean,
): Promise<void> {
  await call(sdk, "deleteBranch", { name, force });
  touch(sdk);
}

export async function syncRepo(
  sdk: FatNotesPluginSDK,
  action: "fetch" | "pull" | "push",
): Promise<string> {
  const result = await call<{ output?: string }>(sdk, "sync", { action }, 90);
  touch(sdk);
  return result.output || "";
}

export async function initRepo(
  sdk: FatNotesPluginSDK,
  initialCommit: boolean,
  name: string,
  email: string,
): Promise<string> {
  const result = await call<{ message?: string }>(
    sdk,
    "initRepo",
    { initialCommit, name, email, locale: sdk.ui.i18n.locale },
    45,
  );
  touch(sdk);
  return result.message || "init.created";
}

export async function readGitignore(sdk: FatNotesPluginSDK): Promise<string> {
  const result = await call<{ text: string }>(sdk, "readGitignore");
  return result.text || "";
}

export async function writeGitignore(sdk: FatNotesPluginSDK, text: string): Promise<void> {
  await call(sdk, "writeGitignore", { text });
  touch(sdk);
}

export async function getSettings(sdk: FatNotesPluginSDK): Promise<Settings> {
  const result = await call<{ settings: Settings }>(sdk, "getSettings");
  return result.settings;
}

export async function saveSettings(
  sdk: FatNotesPluginSDK,
  settings: Settings,
): Promise<Settings> {
  const result = await call<{ settings: Settings }>(sdk, "setSettings", { settings });
  return result.settings;
}

export async function autoCommitNow(sdk: FatNotesPluginSDK): Promise<AutoResult> {
  const result = await call<{ result: AutoResult }>(sdk, "autoCommitNow", {}, 60);
  touch(sdk);
  return result.result;
}

export async function getAutoStatus(sdk: FatNotesPluginSDK): Promise<AutoStatus> {
  const result = await call<{ status: AutoStatus }>(sdk, "autoCommitStatus");
  return result.status;
}

export async function openWorkspace(sdk: FatNotesPluginSDK): Promise<void> {
  await call(sdk, "openWorkspace");
}

export function usePoll<T>(
  load: () => Promise<T>,
  intervalMs: number,
  enabled = true,
): {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
} {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const alive = useRef(true);
  const seq = useRef(0);

  const request = useCallback(
    (silent = false) => {
      if (!enabled) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      loadRef
        .current()
        .then((next) => {
          if (!alive.current || id !== seq.current) return;
          setData(next);
          setError("");
        })
        .catch((err: unknown) => {
          if (!alive.current || id !== seq.current) return;
          setError(errorText(err));
        })
        .finally(() => {
          if (alive.current && id === seq.current) setLoading(false);
        });
    },
    [enabled],
  );

  const reload = useCallback(() => request(false), [request]);

  useEffect(() => {
    alive.current = true;
    if (enabled) request(false);
    if (!enabled || intervalMs <= 0) {
      return () => {
        alive.current = false;
      };
    }
    const timer = window.setInterval(() => request(true), intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, request]);

  return { data, error, loading, reload };
}
