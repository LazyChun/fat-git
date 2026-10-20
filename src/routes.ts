export const CHANGES_PATH = "/fat-git/changes";
export const GRAPH_PATH = "/fat-git/graph";
export const BRANCHES_PATH = "/fat-git/branches";
export const INFO_PATH = "/fat-git/info";
export const SETTINGS_PATH = "/fat-git/settings";

export const GIT_PATHS = [
  CHANGES_PATH,
  GRAPH_PATH,
  BRANCHES_PATH,
  INFO_PATH,
  SETTINGS_PATH,
];

export function isGitPath(path: string): boolean {
  return GIT_PATHS.includes(path);
}
