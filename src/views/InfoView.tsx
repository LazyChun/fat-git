import React, { useEffect, useRef, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Checkbox, Input } from "antd";
import {
  getSummary,
  initRepo,
  openWorkspace,
  readGitignore,
  setIdentity,
  usePoll,
  writeGitignore,
} from "../api";
import { formatTime, stateLabel } from "../format";
import useI18n from "../i18n/useI18n";
import LoadingState from "../components/LoadingState";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const InfoView: React.FC<Props> = ({ sdk }) => {
  const { text, message } = useI18n();
  const summaryState = usePoll(() => getSummary(sdk), 15000);
  const summary = summaryState.data;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ignore, setIgnore] = useState("");
  const [initialCommit, setInitialCommit] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const seededIdentity = useRef(false);
  const identityName = summary?.identity?.name || "";
  const identityEmail = summary?.identity?.email || "";

  useEffect(() => {
    if (!summary?.repo || seededIdentity.current) return;
    setName(identityName);
    setEmail(identityEmail);
    seededIdentity.current = true;
  }, [summary?.repo, identityName, identityEmail]);

  useEffect(() => {
    if (!summary?.repo) return;
    let alive = true;
    readGitignore(sdk)
      .then((text) => {
        if (alive) setIgnore(text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [sdk, summary?.repo]);

  const run = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setError("");
    try {
      const result = await task();
      sdk.ui.toast.success(result ? message(result) : text("git.common.saved"));
      summaryState.reload();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw);
      sdk.ui.toast.error(message(raw));
    } finally {
      setBusy("");
    }
  };

  if (summaryState.loading && !summary) {
    return (
      <div className={styles.page}>
        <LoadingState text={text("git.info.loading")} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {summaryState.error ? (
        <Alert type="error" showIcon title={text("git.info.readFailed")} description={message(summaryState.error)} />
      ) : null}
      {summary && !summary.gitAvailable ? (
        <Alert
          type="error"
          showIcon
          title={text("git.gate.gitMissing")}
          description={message(summary.error) || text("git.gate.gitMissingHint")}
        />
      ) : null}
      {error ? <Alert type="error" showIcon style={{ marginBottom: 12 }} title={text("git.common.actionFailed")} description={message(error)} /> : null}
      {summary?.gitAvailable ? (
        <>
          <div className={styles.metaGrid}>
            <span className={styles.label}>{text("git.info.workspace")}</span>
            <code>{summary.workspace}</code>
            <span className={styles.label}>{text("git.info.git")}</span>
            <span>{summary.gitVersion}</span>
            {summary.repo ? (
              <>
                <span className={styles.label}>{text("git.info.branch")}</span>
                <span>
                  {summary.detached ? text("git.info.detached") : summary.branch}
                  {summary.upstream ? ` → ${summary.upstream}` : ""}
                  {summary.ahead ? ` ↑${summary.ahead}` : ""}
                  {summary.behind ? ` ↓${summary.behind}` : ""}
                </span>
                <span className={styles.label}>{text("git.info.status")}</span>
                <span>
                  {stateLabel(summary.state, text) || (summary.clean ? text("git.info.clean") : text("git.info.dirty"))}
                  {summary.empty ? text("git.info.emptySuffix") : ""}
                </span>
                <span className={styles.label}>{text("git.info.lastCommit")}</span>
                <span>
                  {summary.lastCommit
                    ? text("git.info.lastCommitValue", {
                        short: summary.lastCommit.short,
                        subject: summary.lastCommit.subject,
                        time: formatTime(summary.lastCommit.time),
                      })
                    : text("git.common.none")}
                </span>
              </>
            ) : null}
          </div>
          <div className={styles.toolbar}>
            <Button size="small" onClick={() => run("open", () => openWorkspace(sdk))}>
              {text("git.info.openWorkspace")}
            </Button>
            <Button size="small" onClick={() => summaryState.reload()}>
              {text("git.common.refresh")}
            </Button>
          </div>
          {!summary.repo ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                title={text("git.info.initTitle")}
                description={text("git.info.initDesc")}
              />
              <Checkbox checked={initialCommit} onChange={(event) => setInitialCommit(event.target.checked)}>
                {text("git.info.initialCommit")}
              </Checkbox>
              <div className={styles.field} style={{ marginTop: 12 }}>
                <span className={styles.fieldLabel}>{text("git.info.identityHint")}</span>
                <Input placeholder={text("git.info.name")} value={name} onChange={(event) => setName(event.target.value)} />
                <Input placeholder={text("git.info.email")} value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <Button
                type="primary"
                loading={busy === "init"}
                onClick={() =>
                  run("init", () => initRepo(sdk, initialCommit, name.trim(), email.trim()))
                }
              >
                {text("git.info.init")}
              </Button>
            </>
          ) : (
            <>
              <div className={styles.sectionTitle}>{text("git.info.identity")}</div>
              <p className={styles.hint}>{text("git.info.identityNote")}</p>
              <div className={styles.toolbar}>
                <Input
                  style={{ width: 180 }}
                  placeholder={text("git.info.name")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  style={{ width: 240 }}
                  placeholder={text("git.info.email")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Button
                  type="primary"
                  loading={busy === "identity"}
                  onClick={() => run("identity", () => setIdentity(sdk, name.trim(), email.trim()))}
                >
                  {text("git.info.saveIdentity")}
                </Button>
              </div>
              <div className={styles.sectionTitle}>{text("git.info.remotes")}</div>
              {summary.remotes?.length ? (
                summary.remotes.map((remote) => (
                  <div key={remote.name} className={styles.fileRow}>
                    <TagLike name={remote.name} />
                    <span className={styles.path}>{remote.fetch || remote.push}</span>
                  </div>
                ))
              ) : (
                <p className={styles.hint}>{text("git.info.noRemote")}</p>
              )}
              <div className={styles.sectionTitle}>.gitignore</div>
              <Input.TextArea
                rows={12}
                value={ignore}
                onChange={(event) => setIgnore(event.target.value)}
              />
              <div className={styles.toolbar}>
                <Button
                  type="primary"
                  loading={busy === "ignore"}
                  onClick={() => run("ignore", () => writeGitignore(sdk, ignore))}
                >
                  {text("git.info.saveIgnore")}
                </Button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
};

const TagLike: React.FC<{ name: string }> = ({ name }) => (
  <span style={{ fontWeight: 600, flex: "none" }}>{name}</span>
);

export default InfoView;
