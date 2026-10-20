import React, { useEffect, useReducer } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Menu } from "antd";
import { getSummary, onChanged, usePoll } from "./api";
import {
  BRANCHES_PATH,
  CHANGES_PATH,
  GRAPH_PATH,
  INFO_PATH,
  SETTINGS_PATH,
} from "./routes";
import useI18n from "./i18n/useI18n";
import ThemeShell from "./ThemeShell";
import styles from "./MenuView.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const MenuBody: React.FC<Props> = ({ sdk }) => {
  const { text } = useI18n();
  const [, force] = useReducer((value: number) => value + 1, 0);
  const summaryState = usePoll(() => getSummary(sdk), 20000);

  useEffect(() => {
    const sub = sdk.router.onChange(() => force());
    return () => sub.dispose();
  }, [sdk]);

  useEffect(() => {
    const sub = onChanged(sdk, () => summaryState.reload());
    return () => sub.dispose();
  }, [sdk, summaryState.reload]);

  const summary = summaryState.data;
  const dirty =
    (summary?.staged || 0) + (summary?.unstaged || 0) + (summary?.untracked || 0);
  const branch = summary?.branch || "HEAD";
  const note = !summary
    ? ""
    : !summary.gitAvailable
      ? text("git.menu.gitMissing")
      : !summary.repo
        ? text("git.menu.notRepo")
        : dirty
          ? text("git.menu.dirty", { branch, count: dirty })
          : text("git.menu.clean", { branch });

  return (
      <div className={styles.side}>
        <div className={styles.header}>
          <div className={styles.title}>Git</div>
        </div>
        <div className={styles.menu}>
          <Menu
            mode="inline"
            selectedKeys={[sdk.router.getCurrent().path]}
            items={[
              { key: CHANGES_PATH, label: text("git.nav.changes") },
              { key: GRAPH_PATH, label: text("git.nav.graph") },
              { key: BRANCHES_PATH, label: text("git.nav.branches") },
              { key: INFO_PATH, label: text("git.nav.info") },
              { key: SETTINGS_PATH, label: text("git.nav.auto") },
            ]}
            onClick={({ key }) => sdk.router.navigate(key)}
          />
        </div>
        {note ? <div className={styles.note}>{note}</div> : null}
      </div>
  );
};

const MenuView: React.FC<Props> = ({ sdk }) => (
  <ThemeShell sdk={sdk} padding={0} fill>
    <MenuBody sdk={sdk} />
  </ThemeShell>
);

export default MenuView;
