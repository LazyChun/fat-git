import React, { useEffect, useReducer } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { isGitPath, CHANGES_PATH, GRAPH_PATH, BRANCHES_PATH, INFO_PATH, SETTINGS_PATH } from "./routes";
import ThemeShell from "./ThemeShell";
import ChangesView from "./views/ChangesView";
import GraphView from "./views/GraphView";
import BranchesView from "./views/BranchesView";
import InfoView from "./views/InfoView";
import SettingsView from "./views/SettingsView";

interface Props {
  sdk: FatNotesPluginSDK;
}

const WorkPageView: React.FC<Props> = ({ sdk }) => {
  const [, force] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const sub = sdk.router.onChange(() => force());
    return () => sub.dispose();
  }, [sdk]);

  const { path } = sdk.router.getCurrent();

  useEffect(() => {
    if (isGitPath(sdk.router.getCurrent().path)) return;
    sdk.router.navigate(CHANGES_PATH);
  }, [sdk, path]);

  let page: React.ReactNode = null;
  if (path === GRAPH_PATH) page = <GraphView sdk={sdk} />;
  else if (path === BRANCHES_PATH) page = <BranchesView sdk={sdk} />;
  else if (path === INFO_PATH) page = <InfoView sdk={sdk} />;
  else if (path === SETTINGS_PATH) page = <SettingsView sdk={sdk} />;
  else page = <ChangesView sdk={sdk} />;

  return (
    <ThemeShell sdk={sdk} padding={0} fill>
      {page}
    </ThemeShell>
  );
};

export default WorkPageView;
