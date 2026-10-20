export interface Identity {
  name: string;
  email: string;
}

export interface RemoteInfo {
  name: string;
  fetch: string;
  push: string;
}

export interface LastCommit {
  hash: string;
  short: string;
  subject: string;
  time: number;
}

export interface Summary {
  gitAvailable: boolean;
  gitVersion: string;
  workspace: string;
  repo: boolean;
  error?: string;
  branch?: string;
  detached?: boolean;
  empty?: boolean;
  upstream?: string;
  upstreamGone?: boolean;
  ahead?: number;
  behind?: number;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  clean?: boolean;
  state?: string;
  identity?: Identity;
  remotes?: RemoteInfo[];
  lastCommit?: LastCommit | null;
  gitignore?: boolean;
}

export interface GitFile {
  path: string;
  origPath: string;
  index: string;
  work: string;
  untracked: boolean;
  staged: boolean;
  unstaged: boolean;
}

export interface Changes {
  branch: string;
  detached: boolean;
  empty: boolean;
  upstream: string;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  state: string;
  identity: Identity;
  hasRemote: boolean;
  files: GitFile[];
  truncated: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface DiffResult {
  binary?: boolean;
  text: string;
  path: string;
  mode?: string;
  truncated?: boolean;
  untracked?: boolean;
  tooLarge?: boolean;
  directory?: boolean;
  missing?: boolean;
  size?: number;
}

export interface GitRef {
  name: string;
  kind: string;
}

export interface GraphLink {
  from: number;
  to: number;
}

export interface GraphCommit {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  subject: string;
  refs: GitRef[];
  lane: number;
  incoming: boolean;
  rails: number[];
  links: GraphLink[];
}

export interface GraphData {
  commits: GraphCommit[];
  maxLane: number;
}

export interface CommitFile {
  status: string;
  path: string;
  origPath: string;
}

export interface CommitDetail {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  subject: string;
  body: string;
  files: CommitFile[];
}

export interface LocalBranch {
  name: string;
  sha: string;
  upstream: string;
  ahead: number;
  behind: number;
  current: boolean;
  subject: string;
}

export interface RemoteBranch {
  name: string;
  sha: string;
  subject: string;
}

export interface BranchData {
  local: LocalBranch[];
  remote: RemoteBranch[];
}

export interface AutoCommitSettings {
  enabled: boolean;
  intervalMinutes: number;
  messageTemplate: string;
  includeUntracked: boolean;
  includePrefixes: string[];
  exclude: string[];
}

export interface Settings {
  autoCommit: AutoCommitSettings;
  graphLimit: number;
}

export interface AutoResult {
  ok?: boolean;
  committed?: boolean;
  skipped?: string;
  files?: number;
  subject?: string;
  error?: string;
  at?: number;
  truncated?: boolean;
}

export interface AutoStatus {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  last: AutoResult;
}
