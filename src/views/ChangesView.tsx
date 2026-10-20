import React, { useEffect, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Empty, Input, Tag } from "antd";
import {
  commit,
  discard,
  getChanges,
  getSummary,
  onChanged,
  stage,
  stageAll,
  syncRepo,
  unstage,
  unstageAll,
  usePoll,
} from "../api";
import type { GitFile } from "../types";
import { stateLabel, statusColor } from "../format";
import useI18n from "../i18n/useI18n";
import { INFO_PATH } from "../routes";
import LoadingState from "../components/LoadingState";
import RepoGate from "../components/RepoGate";
import DiffDrawer from "../components/DiffDrawer";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

type Section = "staged" | "unstaged" | "untracked";

function sectionCode(file: GitFile, section: Section): string {
  if (section === "untracked") return "?";
  if (section === "staged") return file.index.trim() || "M";
  return file.work.trim() || "M";
}

function fileLabel(file: GitFile): string {
  return file.origPath ? `${file.origPath} → ${file.path}` : file.path;
}

const ChangesView: React.FC<Props> = ({ sdk }) => {
  const { text, message: show } = useI18n();
  const summaryState = usePoll(() => getSummary(sdk), 15000);
  const repoReady = Boolean(summaryState.data?.repo);
  const changeState = usePoll(() => getChanges(sdk), 8000, repoReady);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [diff, setDiff] = useState<{ path: string; mode: Section; title: string } | null>(null);

  const reloadSummary = summaryState.reload;
  const reloadChanges = changeState.reload;
  useEffect(() => {
    const sub = onChanged(sdk, () => {
      reloadSummary();
      if (repoReady) reloadChanges();
    });
    return () => sub.dispose();
  }, [sdk, repoReady, reloadSummary, reloadChanges]);

  const changes = changeState.data;
  const run = async (key: string, task: () => Promise<void>, ok?: string) => {
    setBusy(key);
    setActionError("");
    try {
      await task();
      if (ok) sdk.ui.toast.success(ok);
      changeState.reload();
      summaryState.reload();
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      setActionError(raw);
      sdk.ui.toast.error(show(raw));
    } finally {
      setBusy("");
    }
  };

  const askDiscard = async (file: GitFile, untracked: boolean) => {
    const ok = await sdk.ui.modal.confirm({
      title: untracked ? text("git.changes.discardUntrackedTitle") : text("git.changes.discardTitle"),
      content: file.path,
      okText: text("git.changes.discard"),
      cancelText: text("git.common.cancel"),
    });
    if (!ok) return;
    await run(`discard:${file.path}`, () => discard(sdk, file.path, untracked), text("git.changes.discarded"));
  };

  const renderFiles = (section: Section, files: GitFile[]) => {
    if (!files.length) return null;
    const title =
      section === "staged"
        ? text("git.changes.staged")
        : section === "unstaged"
          ? text("git.changes.unstaged")
          : text("git.changes.untracked");
    return (
      <section>
        <div className={styles.sectionTitle}>
          <span>
            {title} {files.length}
          </span>
          {section === "staged" ? (
            <Button size="small" type="link" disabled={!!busy} onClick={() => run("unstageAll", () => unstageAll(sdk))}>
              {text("git.changes.unstageAll")}
            </Button>
          ) : (
            <Button size="small" type="link" disabled={!!busy} onClick={() => run("stageAll", () => stageAll(sdk))}>
              {text("git.changes.stageAll")}
            </Button>
          )}
        </div>
        {files.map((file) => {
          const code = sectionCode(file, section);
          return (
            <div
              key={`${section}:${file.origPath}:${file.path}`}
              className={styles.fileRow}
              onClick={() =>
                setDiff({ path: file.path, mode: section, title: fileLabel(file) })
              }
            >
              <Tag color={statusColor(code)} style={{ margin: 0 }}>
                {code}
              </Tag>
              <span className={styles.path} title={fileLabel(file)}>
                {fileLabel(file)}
              </span>
              {section === "staged" ? (
                <Button
                  size="small"
                  type="link"
                  disabled={!!busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    run(`unstage:${file.path}`, () => unstage(sdk, [file.path]));
                  }}
                >
                  {text("git.changes.unstage")}
                </Button>
              ) : (
                <>
                  <Button
                    size="small"
                    type="link"
                    disabled={!!busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      run(`stage:${file.path}`, () => stage(sdk, [file.path]));
                    }}
                  >
                    {text("git.changes.stage")}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    disabled={!!busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      askDiscard(file, section === "untracked");
                    }}
                  >
                    {text("git.changes.discard")}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  const staged = changes?.files.filter((file) => file.staged) || [];
  const unstaged = changes?.files.filter((file) => file.unstaged) || [];
  const untracked = changes?.files.filter((file) => file.untracked) || [];
  const identity = changes?.identity;
  const missingIdentity = Boolean(changes && (!identity?.name || !identity?.email));
  const state = stateLabel(changes?.state, text);

  return (
    <div className={styles.page}>
      <RepoGate
        summary={summaryState.data}
        loading={summaryState.loading}
        error={summaryState.error}
        onInit={() => sdk.router.navigate(INFO_PATH)}
      >
        {changeState.loading && !changes ? <LoadingState text={text("git.changes.loading")} /> : null}
        {changeState.error ? (
          <Alert type="error" showIcon title={text("git.changes.readFailed")} description={show(changeState.error)} />
        ) : null}
        {changes ? (
          <>
            <div className={styles.toolbar}>
              <Tag color="blue">{changes.detached ? text("git.changes.detached") : changes.branch || "HEAD"}</Tag>
              {changes.upstream ? (
                <span>
                  {changes.upstream}
                  {changes.upstreamGone ? text("git.changes.upstreamGone") : ""}
                  {changes.ahead ? ` ↑${changes.ahead}` : ""}
                  {changes.behind ? ` ↓${changes.behind}` : ""}
                </span>
              ) : (
                <span className={styles.label}>{text("git.changes.noUpstream")}</span>
              )}
              <span className={styles.spacer} />
              <Button size="small" disabled={!!busy || !changes.hasRemote} onClick={() => run("fetch", async () => { await syncRepo(sdk, "fetch"); }, text("git.changes.fetched"))}>
                {text("git.changes.fetch")}
              </Button>
              <Button size="small" disabled={!!busy || !changes.hasRemote} onClick={() => run("pull", async () => { await syncRepo(sdk, "pull"); }, text("git.changes.pulled"))}>
                {text("git.changes.pull")}
              </Button>
              <Button size="small" disabled={!!busy || !changes.hasRemote} onClick={() => run("push", async () => { await syncRepo(sdk, "push"); }, text("git.changes.pushed"))}>
                {text("git.changes.push")}
              </Button>
              <Button size="small" onClick={() => changeState.reload()}>
                {text("git.common.refresh")}
              </Button>
            </div>
            {missingIdentity ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title={text("git.changes.identityTitle")}
                description={text("git.changes.identityDesc")}
                action={
                  <Button size="small" onClick={() => sdk.router.navigate(INFO_PATH)}>
                    {text("git.changes.configure")}
                  </Button>
                }
              />
            ) : null}
            {state ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title={text("git.changes.stateTitle", { state })}
                description={text("git.changes.stateDesc")}
              />
            ) : null}
            {actionError ? (
              <Alert type="error" showIcon style={{ marginBottom: 12 }} title={text("git.common.actionFailed")} description={show(actionError)} />
            ) : null}
            <Input.TextArea
              value={message}
              rows={3}
              placeholder={text("git.changes.messagePlaceholder")}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (!message.trim() || !staged.length) return;
                  run("commit", async () => {
                    await commit(sdk, message.trim());
                    setMessage("");
                  }, text("git.changes.committed"));
                }
              }}
            />
            <div className={styles.toolbar}>
              <Button
                type="primary"
                disabled={!!busy || !message.trim() || staged.length === 0}
                loading={busy === "commit"}
                onClick={() =>
                  run("commit", async () => {
                    await commit(sdk, message.trim());
                    setMessage("");
                  }, text("git.changes.committed"))
                }
              >
                {text("git.changes.commit")}
              </Button>
              <span className={styles.label}>{text("git.changes.stagedCount", { count: staged.length })}</span>
            </div>
            {changes.truncated ? <p className={styles.hint}>{text("git.changes.truncated")}</p> : null}
            {!staged.length && !unstaged.length && !untracked.length ? (
              <Empty description={text("git.changes.clean")} />
            ) : (
              <>
                {renderFiles("staged", staged)}
                {renderFiles("unstaged", unstaged)}
                {renderFiles("untracked", untracked)}
              </>
            )}
          </>
        ) : null}
      </RepoGate>
      <DiffDrawer
        sdk={sdk}
        open={Boolean(diff)}
        title={diff?.title || ""}
        path={diff?.path || ""}
        mode={diff?.mode || "unstaged"}
        onClose={() => setDiff(null)}
      />
    </div>
  );
};

export default ChangesView;
