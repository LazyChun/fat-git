import React, { useEffect, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Drawer, Empty } from "antd";
import { getCommitFileDiff, getDiff } from "../api";
import useI18n from "../i18n/useI18n";
import LoadingState from "./LoadingState";
import type { DiffResult } from "../types";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
  open: boolean;
  title: string;
  path: string;
  mode: "staged" | "unstaged" | "untracked" | "commit";
  rev?: string;
  onClose: () => void;
}

function lineClass(line: string, untracked?: boolean): string {
  if (untracked) return `${styles.line} ${styles.add}`;
  if (line.startsWith("@@")) return `${styles.line} ${styles.hunk}`;
  if (line.startsWith("+") && !line.startsWith("+++")) return `${styles.line} ${styles.add}`;
  if (line.startsWith("-") && !line.startsWith("---")) return `${styles.line} ${styles.del}`;
  return styles.line;
}

const DiffBody: React.FC<{ diff: DiffResult }> = ({ diff }) => {
  const { text } = useI18n();
  if (diff.binary) return <Empty description={text("git.diff.binary")} />;
  if (diff.directory) return <Empty description={text("git.diff.directory")} />;
  if (diff.missing) return <Empty description={text("git.diff.missing")} />;
  if (diff.tooLarge) {
    return <Empty description={text("git.diff.tooLarge", { size: diff.size || 0 })} />;
  }
  if (!diff.text) return <Empty description={text("git.diff.empty")} />;
  const lines = diff.text.split("\n");
  return (
    <>
      {diff.truncated ? <p className={styles.hint}>{text("git.diff.truncated")}</p> : null}
      <pre className={styles.diff}>
        {lines.map((line, index) => (
          <div key={index} className={lineClass(line, diff.untracked)}>
            {line || " "}
          </div>
        ))}
      </pre>
    </>
  );
};

const DiffDrawer: React.FC<Props> = ({ sdk, open, title, path, mode, rev, onClose }) => {
  const { text, message } = useI18n();
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    let alive = true;
    setLoading(true);
    setError("");
    const task =
      mode === "commit" && rev
        ? getCommitFileDiff(sdk, rev, path)
        : getDiff(sdk, path, mode);
    task
      .then((next) => {
        if (alive) setDiff(next);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sdk, open, path, mode, rev]);

  return (
    <Drawer
      title={title || path}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size="large"
      styles={
        loading
          ? { body: { display: "flex", flexDirection: "column", minHeight: "60vh" } }
          : undefined
      }
      extra={
        <Button
          size="small"
          onClick={() => {
            navigator.clipboard?.writeText(path).catch(() => undefined);
            sdk.ui.toast.success(text("git.diff.pathCopied"));
          }}
        >
          {text("git.diff.copyPath")}
        </Button>
      }
    >
      {loading ? <LoadingState text={text("git.diff.loading")} /> : null}
      {error ? <Alert type="error" showIcon title={text("git.diff.readFailed")} description={message(error)} /> : null}
      {!loading && !error && diff ? <DiffBody diff={diff} /> : null}
    </Drawer>
  );
};

export default DiffDrawer;
