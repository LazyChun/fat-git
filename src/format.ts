import { localize, type TextFn } from "./i18n";

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTime(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function relativeTime(ts: number | undefined, text: TextFn): string {
  if (!ts) return "";
  const seconds = Math.max(0, Date.now() / 1000 - ts);
  if (seconds < 60) return text("git.time.justNow");
  if (seconds < 3600) return text("git.time.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return text("git.time.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 86400 * 30) return text("git.time.daysAgo", { count: Math.floor(seconds / 86400) });
  return formatTime(ts);
}

export function stateLabel(state: string | undefined, text: TextFn): string {
  if (state === "merge") return text("git.state.merge");
  if (state === "rebase") return text("git.state.rebase");
  if (state === "cherry-pick") return text("git.state.cherryPick");
  return "";
}

export function skipLabel(skipped: string | undefined, text: TextFn): string {
  switch (skipped) {
    case "clean":
      return text("git.skip.clean");
    case "staged":
      return text("git.skip.staged");
    case "norepo":
      return text("git.skip.norepo");
    case "busy":
      return text("git.skip.busy");
    case "merge":
      return text("git.skip.merge");
    case "rebase":
      return text("git.skip.rebase");
    case "cherry-pick":
      return text("git.skip.cherryPick");
    default:
      return skipped ? localize(skipped, text) : "";
  }
}

export function statusColor(code: string): string {
  if (code === "M") return "gold";
  if (code === "A") return "green";
  if (code === "D") return "red";
  if (code === "R" || code === "C") return "blue";
  if (code === "U") return "magenta";
  return "default";
}

export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
