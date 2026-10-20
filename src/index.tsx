/*
 * fat-git — FatNotes 工作区的 Git 插件
 *
 * 活动栏进入后：左侧是功能菜单，右侧工作区按路由显示
 * 变更 / 提交图 / 分支 / 仓库信息 / 自动提交。
 * Git 命令全部在插件后端执行，并且只作用于宿主当前工作区。
 */
import React from "react";
import type { Disposable, FatNotesPluginSDK } from "fat-notes-sdk";
import MenuView from "./MenuView";
import WorkPageView from "./WorkPageView";
import FooterStatus from "./FooterStatus";
import SettingsView from "./views/SettingsView";
import ThemeShell from "./ThemeShell";
import { autoCommitNow } from "./api";
import { skipLabel } from "./format";
import { localize, translate, type TextFn } from "./i18n";
import {
  BRANCHES_PATH,
  CHANGES_PATH,
  GRAPH_PATH,
  INFO_PATH,
  SETTINGS_PATH,
} from "./routes";

const disposables: Disposable[] = [];
const ACTIVITY_ID = "fat-git.main";

const GIT_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d8d8d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  );

function safeRegister(
  bucket: Disposable[],
  label: string,
  fn: () => Disposable | undefined | null,
): void {
  try {
    const disposable = fn();
    if (disposable) bucket.push(disposable);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[fat-git] failed to register ${label}`, error);
  }
}

function textOf(sdk: FatNotesPluginSDK): TextFn {
  return (id, values) => translate(sdk.ui.i18n.locale, id, values);
}

function registerChrome(sdk: FatNotesPluginSDK): Disposable {
  const owned: Disposable[] = [];
  const mount = () => {
    while (owned.length) {
      try {
        owned.pop()?.dispose();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[fat-git] dispose error", error);
      }
    }
    const text = textOf(sdk);
    safeRegister(owned, "activityBar", () =>
      sdk.contributions.registerActivityBarItem({
        id: ACTIVITY_ID,
        title: text("git.activity.title"),
        icon: GIT_ICON,
        pluginName: "fat-git",
      }),
    );

    const routes: Array<[string, string]> = [
      [CHANGES_PATH, "git.nav.changes"],
      [GRAPH_PATH, "git.nav.graph"],
      [BRANCHES_PATH, "git.nav.branches"],
      [INFO_PATH, "git.nav.info"],
      [SETTINGS_PATH, "git.nav.auto"],
    ];
    for (const [path, title] of routes) {
      safeRegister(owned, `route:${path}`, () =>
        sdk.contributions.registerRoutePage({
          path,
          title: text(title),
          render: () => null,
        }),
      );
    }

    safeRegister(owned, "search", () =>
      sdk.contributions.registerSearchProvider({
        id: "fat-git.search",
        name: "fat-git",
        items: [
          {
            id: "fat-git.changes",
            title: text("git.search.changes.title"),
            desc: text("git.search.changes.desc"),
            keywords: ["git", "commit", "status", "changes", "变更", "提交"],
            tag: "Git",
            activityId: ACTIVITY_ID,
            onSelect: () => sdk.router.navigate(CHANGES_PATH),
          },
          {
            id: "fat-git.graph",
            title: text("git.search.graph.title"),
            desc: text("git.search.graph.desc"),
            keywords: ["git", "graph", "log", "history", "提交图", "历史"],
            tag: "Git",
            activityId: ACTIVITY_ID,
            onSelect: () => sdk.router.navigate(GRAPH_PATH),
          },
          {
            id: "fat-git.branches",
            title: text("git.search.branches.title"),
            desc: text("git.search.branches.desc"),
            keywords: ["git", "branch", "branches", "分支"],
            tag: "Git",
            activityId: ACTIVITY_ID,
            onSelect: () => sdk.router.navigate(BRANCHES_PATH),
          },
          {
            id: "fat-git.info",
            title: text("git.search.info.title"),
            desc: text("git.search.info.desc"),
            keywords: ["git", "remote", "repository", "仓库"],
            tag: "Git",
            activityId: ACTIVITY_ID,
            onSelect: () => sdk.router.navigate(INFO_PATH),
          },
          {
            id: "fat-git.auto",
            title: text("git.search.auto.title"),
            desc: text("git.search.auto.desc"),
            keywords: ["git", "auto", "commit", "自动提交"],
            tag: "Git",
            activityId: ACTIVITY_ID,
            onSelect: () => sdk.router.navigate(SETTINGS_PATH),
          },
        ],
      }),
    );

    safeRegister(owned, "settings", () =>
      sdk.contributions.registerSettingsPage({
        id: "fat-git.settings",
        title: text("git.settings.pageTitle"),
        render: () => (
          <ThemeShell sdk={sdk} padding={0} fill>
            <SettingsView sdk={sdk} />
          </ThemeShell>
        ),
      }),
    );
  };

  mount();
  let localeSub: Disposable | null = null;
  try {
    localeSub = sdk.ui.i18n.onChange(() => mount());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[fat-git] failed to watch locale", error);
  }
  return {
    dispose() {
      localeSub?.dispose();
      while (owned.length) {
        try {
          owned.pop()?.dispose();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("[fat-git] dispose error", error);
        }
      }
    },
  };
}

export async function activate(sdk: FatNotesPluginSDK): Promise<void> {
  disposables.push(registerChrome(sdk));

  safeRegister(disposables, "primarySidebar", () =>
    sdk.contributions.registerPrimarySidebar(() => React.createElement(MenuView, { sdk })),
  );

  safeRegister(disposables, "workbenchPage", () =>
    sdk.contributions.registerWorkbenchPage({
      id: ACTIVITY_ID,
      render: () => React.createElement(WorkPageView, { sdk }),
    }),
  );

  safeRegister(disposables, "footer", () =>
    sdk.contributions.registerFooterItem({
      id: "fat-git.footer",
      align: "left",
      render: () => React.createElement(FooterStatus, { sdk }),
    }),
  );

  safeRegister(disposables, "command:auto", () =>
    sdk.commands.register("fat-git.autoCommitNow", async () => {
      const result = await autoCommitNow(sdk);
      const text = textOf(sdk);
      if (result.error) sdk.ui.toast.error(localize(result.error, text));
      else if (result.committed) sdk.ui.toast.success(result.subject || text("git.skip.autoDone"));
      else sdk.ui.toast.info(skipLabel(result.skipped, text) || text("git.skip.none"));
      return result;
    }),
  );

  const activityKey = `bespoke:${ACTIVITY_ID}`;
  const selectKey = (state: unknown): string | undefined => {
    if (!state || typeof state !== "object") return undefined;
    const frame = (state as { frame?: { activityMenuKey?: unknown } }).frame;
    return typeof frame?.activityMenuKey === "string" ? frame.activityMenuKey : undefined;
  };

  let hideSecondary: Disposable | null = null;
  let hidePanel: Disposable | null = null;
  const syncHide = (activeKey: string | undefined) => {
    const active = activeKey === activityKey;
    if (active) {
      if (!hideSecondary && typeof sdk.contributions.registerHideSecondarySidebar === "function") {
        hideSecondary = sdk.contributions.registerHideSecondarySidebar();
      }
      if (!hidePanel && typeof sdk.contributions.registerHidePanel === "function") {
        hidePanel = sdk.contributions.registerHidePanel();
      }
    } else {
      hideSecondary?.dispose();
      hideSecondary = null;
      hidePanel?.dispose();
      hidePanel = null;
    }
  };

  try {
    syncHide(sdk.store.select(selectKey));
    disposables.push(sdk.store.subscribe(selectKey, (next) => syncHide(next)));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[fat-git] failed to sync layout", error);
  }
  disposables.push({
    dispose() {
      hideSecondary?.dispose();
      hideSecondary = null;
      hidePanel?.dispose();
      hidePanel = null;
    },
  });
}

export function deactivate(): void {
  while (disposables.length) {
    try {
      disposables.pop()?.dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[fat-git] dispose error", error);
    }
  }
}
