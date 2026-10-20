import React, { useEffect, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Drawer, Empty, InputNumber, Tag } from "antd";
import { getCommit, getGraph, getSettings, getSummary, onChanged, usePoll } from "../api";
import type { CommitDetail, GraphCommit, GraphData } from "../types";
import { formatTime, relativeTime, statusColor } from "../format";
import useI18n from "../i18n/useI18n";
import { INFO_PATH } from "../routes";
import LoadingState from "../components/LoadingState";
import RepoGate from "../components/RepoGate";
import DiffDrawer from "../components/DiffDrawer";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const COLORS = ["#4c78d4", "#e07a3d", "#3aa76d", "#c44b7a", "#8a6ad4", "#c9a227", "#2a9d8f", "#d45d5d"];
const GAP = 16;
const ROW = 32;

function laneColor(index: number): string {
  return COLORS[index % COLORS.length];
}

function xOf(col: number): number {
  return 12 + col * GAP + GAP / 2;
}

function refColor(kind: string): string {
  if (kind === "head") return "red";
  if (kind === "branch") return "green";
  if (kind === "remote") return "blue";
  if (kind === "tag") return "gold";
  return "default";
}

const GraphMark: React.FC<{ commit: GraphCommit; maxLane: number }> = ({ commit, maxLane }) => {
  const width = 12 + (maxLane + 1) * GAP + 8;
  const mid = ROW / 2;
  const x = xOf(commit.lane);
  const head = commit.refs.some((item) => item.kind === "head");
  return (
    <svg width={width} height={ROW} style={{ flex: "none", display: "block" }}>
      {commit.rails.map((col) => (
        <line
          key={`rail-${col}`}
          x1={xOf(col)}
          y1={0}
          x2={xOf(col)}
          y2={ROW}
          stroke={laneColor(col)}
          strokeWidth={2}
        />
      ))}
      {commit.incoming ? (
        <line x1={x} y1={0} x2={x} y2={mid} stroke={laneColor(commit.lane)} strokeWidth={2} />
      ) : null}
      {commit.links.map((link, index) => {
        const x1 = xOf(link.from);
        const x2 = xOf(link.to);
        const d =
          x1 === x2
            ? `M ${x1} ${mid} L ${x2} ${ROW}`
            : `M ${x1} ${mid} C ${x1} ${mid + 10}, ${x2} ${ROW - 8}, ${x2} ${ROW}`;
        return (
          <path key={`link-${index}`} d={d} stroke={laneColor(link.to)} strokeWidth={2} fill="none" />
        );
      })}
      <circle cx={x} cy={mid} r={4.5} fill={laneColor(commit.lane)} />
      {head ? (
        <circle cx={x} cy={mid} r={7} fill="none" stroke={laneColor(commit.lane)} strokeWidth={1.5} />
      ) : null}
    </svg>
  );
};

const GraphView: React.FC<Props> = ({ sdk }) => {
  const { text, message } = useI18n();
  const summaryState = usePoll(() => getSummary(sdk), 20000);
  const [limit, setLimit] = useState(300);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [filePath, setFilePath] = useState("");

  const load = (nextLimit: number) => {
    if (!summaryState.data?.repo) return;
    setLoading(true);
    getGraph(sdk, nextLimit)
      .then((next) => {
        setGraph(next);
        setError("");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!summaryState.data?.repo) return;
    let alive = true;
    setLoading(true);
    getSettings(sdk)
      .then((settings) => {
        if (!alive) return;
        setLimit(settings.graphLimit);
        return getGraph(sdk, settings.graphLimit);
      })
      .catch(() => (alive ? getGraph(sdk, 300) : null))
      .then((next) => {
        if (!alive || !next) return;
        setGraph(next);
        setError("");
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
  }, [sdk, summaryState.data?.repo]);

  useEffect(() => {
    const sub = onChanged(sdk, () => load(limit));
    return () => sub.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, limit, summaryState.data?.repo]);

  const openCommit = (rev: string) => {
    setDetail(null);
    setFilePath("");
    setDetailError("");
    setDetailLoading(true);
    getCommit(sdk, rev)
      .then(setDetail)
      .catch((err: unknown) => setDetailError(err instanceof Error ? err.message : String(err)))
      .finally(() => setDetailLoading(false));
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => sdk.ui.toast.success(text("git.graph.copied")),
      () => sdk.ui.toast.warn(text("git.graph.copyFailed")),
    );
  };

  return (
    <div className={styles.page}>
      <RepoGate
        summary={summaryState.data}
        loading={summaryState.loading}
        error={summaryState.error}
        onInit={() => sdk.router.navigate(INFO_PATH)}
      >
        <div className={styles.toolbar}>
          <span>{text("git.graph.limit")}</span>
          <InputNumber
            min={50}
            max={2000}
            value={limit}
            onChange={(value) => setLimit(typeof value === "number" ? value : 300)}
          />
          <Button size="small" onClick={() => load(limit)} loading={loading}>
            {text("git.common.refresh")}
          </Button>
          <span className={styles.hint} style={{ margin: 0 }}>
            {text("git.graph.hint")}
          </span>
        </div>
        {error ? <Alert type="error" showIcon title={text("git.graph.readFailed")} description={message(error)} /> : null}
        {loading && !graph ? <LoadingState text={text("git.graph.loading")} /> : null}
        {graph && !graph.commits.length ? <Empty description={text("git.graph.empty")} /> : null}
        {graph?.commits.map((commit) => {
          const head = commit.refs.some((item) => item.kind === "head");
          const refs = commit.refs.filter((item) => item.kind !== "other").slice(0, 4);
          return (
            <div
              key={commit.hash}
              className={`${styles.graphRow} ${head ? styles.headRow : ""}`}
              onClick={() => openCommit(commit.hash)}
            >
              <GraphMark commit={commit} maxLane={graph.maxLane} />
              <div className={styles.refs}>
                {refs.map((item) => (
                  <Tag key={`${item.kind}:${item.name}`} color={refColor(item.kind)} style={{ margin: 0 }}>
                    {item.kind === "head" ? "HEAD" : item.name}
                  </Tag>
                ))}
              </div>
              <span className={styles.subject} title={commit.subject}>
                {commit.subject || text("git.graph.noSubject")}
              </span>
              <span className={styles.meta}>{commit.author}</span>
              <span className={styles.meta} title={formatTime(commit.time)}>
                {relativeTime(commit.time, text)}
              </span>
              <span className={styles.meta}>{commit.short}</span>
            </div>
          );
        })}
      </RepoGate>
      <Drawer
        title={detail?.subject || text("git.graph.commit")}
        open={detailLoading || Boolean(detail) || Boolean(detailError)}
        onClose={() => {
          setDetail(null);
          setDetailError("");
        }}
        destroyOnHidden
        size="large"
        styles={
          detailLoading
            ? { body: { display: "flex", flexDirection: "column", minHeight: "60vh" } }
            : undefined
        }
      >
        {detailLoading ? <LoadingState text={text("git.graph.loading")} /> : null}
        {detailError ? <Alert type="error" showIcon title={text("git.graph.commitReadFailed")} description={message(detailError)} /> : null}
        {detail ? (
          <>
            <div className={styles.metaGrid}>
              <span className={styles.label}>{text("git.graph.hash")}</span>
              <span>
                <code>{detail.hash}</code>{" "}
                <Button size="small" type="link" onClick={() => copy(detail.hash)}>
                  {text("git.graph.copy")}
                </Button>
              </span>
              <span className={styles.label}>{text("git.graph.author")}</span>
              <span>
                {detail.author} &lt;{detail.email}&gt;
              </span>
              <span className={styles.label}>{text("git.graph.time")}</span>
              <span>{formatTime(detail.time)}</span>
              <span className={styles.label}>{text("git.graph.parents")}</span>
              <span>{detail.parents.length ? detail.parents.map((item) => item.slice(0, 7)).join(" ") : text("git.common.none")}</span>
            </div>
            <pre className={styles.diff}>{detail.body}</pre>
            <div className={styles.sectionTitle}>{text("git.graph.files", { count: detail.files.length })}</div>
            <p className={styles.hint}>{text("git.graph.filesHint")}</p>
            {detail.files.map((file) => (
              <div
                key={`${file.status}:${file.path}`}
                className={styles.fileRow}
                onClick={() => setFilePath(file.path)}
              >
                <Tag color={statusColor(file.status)} style={{ margin: 0 }}>
                  {file.status}
                </Tag>
                <span className={styles.path}>
                  {file.origPath ? `${file.origPath} → ${file.path}` : file.path}
                </span>
              </div>
            ))}
          </>
        ) : null}
      </Drawer>
      <DiffDrawer
        sdk={sdk}
        open={Boolean(filePath && detail)}
        title={filePath}
        path={filePath}
        mode="commit"
        rev={detail?.hash}
        onClose={() => setFilePath("")}
      />
    </div>
  );
};

export default GraphView;
