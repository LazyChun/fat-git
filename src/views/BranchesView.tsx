import React, { useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Checkbox, Input, Table, Tag } from "antd";
import { ApiError, checkout, createBranch, deleteBranch, getBranches, getSummary, usePoll } from "../api";
import type { LocalBranch, RemoteBranch } from "../types";
import { INFO_PATH } from "../routes";
import useI18n from "../i18n/useI18n";
import RepoGate from "../components/RepoGate";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const BranchesView: React.FC<Props> = ({ sdk }) => {
  const { text, message } = useI18n();
  const summaryState = usePoll(() => getSummary(sdk), 20000);
  const branchState = usePoll(() => getBranches(sdk), 0, Boolean(summaryState.data?.repo));
  const [name, setName] = useState("");
  const [andCheckout, setAndCheckout] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (key: string, task: () => Promise<void>, ok?: string) => {
    setBusy(key);
    setError("");
    try {
      await task();
      if (ok) sdk.ui.toast.success(ok);
      branchState.reload();
      summaryState.reload();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw);
      sdk.ui.toast.error(message(raw));
    } finally {
      setBusy("");
    }
  };

  const remove = async (branch: string) => {
    const ok = await sdk.ui.modal.confirm({
      title: text("git.branches.deleteTitle", { name: branch }),
      content: text("git.branches.deleteContent"),
      okText: text("git.branches.delete"),
      cancelText: text("git.common.cancel"),
    });
    if (!ok) return;
    setBusy(`del:${branch}`);
    setError("");
    try {
      await deleteBranch(sdk, branch, false);
      sdk.ui.toast.success(text("git.branches.deleted"));
      branchState.reload();
    } catch (err) {
      if (err instanceof ApiError && err.canForce) {
        const force = await sdk.ui.modal.confirm({
          title: text("git.branches.unmergedTitle"),
          content: message(err.message),
          okText: text("git.branches.forceDelete"),
          cancelText: text("git.common.cancel"),
        });
        if (force) {
          try {
            await deleteBranch(sdk, branch, true);
            sdk.ui.toast.success(text("git.branches.forceDeleted"));
            branchState.reload();
          } catch (inner) {
            const text = inner instanceof Error ? inner.message : String(inner);
            setError(text);
          }
        }
      } else {
        const text = err instanceof Error ? err.message : String(err);
        setError(text);
      }
    } finally {
      setBusy("");
    }
  };

  const local = branchState.data?.local || [];
  const remote = branchState.data?.remote || [];

  return (
    <div className={styles.page}>
      <RepoGate
        summary={summaryState.data}
        loading={summaryState.loading}
        error={summaryState.error}
        onInit={() => sdk.router.navigate(INFO_PATH)}
      >
        <div className={styles.toolbar}>
          <Input
            style={{ width: 220 }}
            placeholder={text("git.branches.newPlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Checkbox checked={andCheckout} onChange={(event) => setAndCheckout(event.target.checked)}>
            {text("git.branches.checkoutAfter")}
          </Checkbox>
          <Button
            type="primary"
            disabled={!name.trim() || !!busy}
            onClick={() =>
              run("create", async () => {
                await createBranch(sdk, name.trim(), andCheckout);
                setName("");
              }, text("git.branches.created"))
            }
          >
            {text("git.branches.create")}
          </Button>
          <span className={styles.spacer} />
          <Button size="small" onClick={() => branchState.reload()}>
            {text("git.common.refresh")}
          </Button>
        </div>
        {error ? <Alert type="error" showIcon title={text("git.common.actionFailed")} description={message(error)} /> : null}
        {branchState.error ? (
          <Alert type="error" showIcon title={text("git.branches.readFailed")} description={message(branchState.error)} />
        ) : null}
        <div className={styles.sectionTitle}>{text("git.branches.local")}</div>
        <Table<LocalBranch>
          size="small"
          rowKey="name"
          pagination={false}
          dataSource={local}
          columns={[
            {
              title: text("git.branches.name"),
              dataIndex: "name",
              render: (value: string, row) => (
                <span>
                  {value} {row.current ? <Tag color="blue">{text("git.branches.current")}</Tag> : null}
                </span>
              ),
            },
            { title: text("git.branches.sha"), dataIndex: "sha", width: 90 },
            {
              title: text("git.branches.upstream"),
              dataIndex: "upstream",
              render: (value: string, row) =>
                value ? `${value}${row.ahead ? ` ↑${row.ahead}` : ""}${row.behind ? ` ↓${row.behind}` : ""}` : "—",
            },
            { title: text("git.branches.subject"), dataIndex: "subject", ellipsis: true },
            {
              title: "",
              width: 150,
              render: (_, row) => (
                <>
                  <Button
                    size="small"
                    type="link"
                    disabled={row.current || !!busy}
                    onClick={() => run(`co:${row.name}`, () => checkout(sdk, row.name), text("git.branches.checkedOut", { name: row.name }))}
                  >
                    {text("git.branches.checkout")}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    disabled={row.current || !!busy}
                    onClick={() => remove(row.name)}
                  >
                    {text("git.branches.delete")}
                  </Button>
                </>
              ),
            },
          ]}
        />
        <div className={styles.sectionTitle}>{text("git.branches.remote")}</div>
        <Table<RemoteBranch>
          size="small"
          rowKey="name"
          pagination={false}
          dataSource={remote}
          locale={{ emptyText: text("git.branches.remoteEmpty") }}
          columns={[
            { title: text("git.branches.name"), dataIndex: "name" },
            { title: text("git.branches.sha"), dataIndex: "sha", width: 90 },
            { title: text("git.branches.subject"), dataIndex: "subject", ellipsis: true },
            {
              title: "",
              width: 120,
              render: (_, row) => (
                <Button
                  size="small"
                  type="link"
                  disabled={!!busy}
                  onClick={() =>
                    run(`track:${row.name}`, () => checkout(sdk, row.name, true), text("git.branches.tracked", { name: row.name }))
                  }
                >
                  {text("git.branches.track")}
                </Button>
              ),
            },
          ]}
        />
      </RepoGate>
    </div>
  );
};

export default BranchesView;
