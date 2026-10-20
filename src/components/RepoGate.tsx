import React from "react";
import { Alert, Button, Empty } from "antd";
import useI18n from "../i18n/useI18n";
import type { Summary } from "../types";
import LoadingState from "./LoadingState";

interface Props {
  summary: Summary | null;
  loading: boolean;
  error: string;
  onInit: () => void;
  children: React.ReactNode;
}

const RepoGate: React.FC<Props> = ({ summary, loading, error, onInit, children }) => {
  const { text, message } = useI18n();
  if (loading && !summary) {
    return <LoadingState text={text("git.gate.loading")} />;
  }
  if (!summary && error) {
    return <Alert type="error" showIcon title={text("git.gate.readFailed")} description={message(error)} />;
  }
  if (summary && !summary.gitAvailable) {
    return (
      <Alert
        type="error"
        showIcon
        title={text("git.gate.gitMissing")}
        description={message(summary.error) || text("git.gate.gitMissingHint")}
      />
    );
  }
  if (summary && !summary.repo) {
    return (
      <Empty description={text("git.gate.notRepo")}>
        <Button type="primary" onClick={onInit}>
          {text("git.gate.init")}
        </Button>
      </Empty>
    );
  }
  return <>{children}</>;
};

export default RepoGate;
