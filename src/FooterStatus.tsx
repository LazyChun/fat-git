import React, { useEffect } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { getSummary, onChanged, usePoll } from "./api";
import I18nProvider from "./i18n/I18nProvider";
import useI18n from "./i18n/useI18n";
import { CHANGES_PATH } from "./routes";

interface Props {
  sdk: FatNotesPluginSDK;
}

const FooterButton: React.FC<Props> = ({ sdk }) => {
  const { text } = useI18n();
  const summaryState = usePoll(() => getSummary(sdk), 20000);

  useEffect(() => {
    const sub = onChanged(sdk, () => summaryState.reload());
    return () => sub.dispose();
  }, [sdk, summaryState.reload]);

  const summary = summaryState.data;
  let label = "Git";
  if (summaryState.error && !summary) label = text("git.footer.unavailable");
  else if (summary && !summary.gitAvailable) label = text("git.footer.notInstalled");
  else if (summary && !summary.repo) label = text("git.footer.notRepo");
  else if (summary?.repo) {
    const dirty = (summary.staged || 0) + (summary.unstaged || 0) + (summary.untracked || 0);
    const ahead = summary.ahead ? ` ↑${summary.ahead}` : "";
    const behind = summary.behind ? ` ↓${summary.behind}` : "";
    label = `${summary.branch || "HEAD"}${dirty ? ` · ${dirty}` : ""}${ahead}${behind}`;
  }

  return (
    <button
      type="button"
      title={summary?.workspace || text("git.footer.open")}
      onClick={() => sdk.router.navigate(CHANGES_PATH)}
      style={{
        border: 0,
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        font: "inherit",
        padding: "0 6px",
      }}
    >
      {label}
    </button>
  );
};

const FooterStatus: React.FC<Props> = ({ sdk }) => (
  <I18nProvider sdk={sdk}>
    <FooterButton sdk={sdk} />
  </I18nProvider>
);

export default FooterStatus;
