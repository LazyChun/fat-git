"""对单个目录执行 Git 命令。

所有写操作都限制在调用方传入的工作区根目录内，不接受任意 git 参数。
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Iterator, List, Optional

from graph import build_graph
from pathmatch import is_excluded, is_included

GITIGNORE_TEMPLATE_EN = """# FatNotes runtime data (databases and caches stay out of version control)
dbs/
*.db
*.db-wal
*.db-shm
*.db-journal
*.sqlite
*.sqlite3
*.sqlite-journal

# Dependencies and build output
node_modules/
dist/
vendor/
__pycache__/
*.pyc

# System files
.DS_Store
Thumbs.db
*.log
"""

GITIGNORE_TEMPLATE = """# FatNotes 运行时数据（数据库与缓存不纳入版本）
dbs/
*.db
*.db-wal
*.db-shm
*.db-journal
*.sqlite
*.sqlite3
*.sqlite-journal

# 依赖与构建产物
node_modules/
dist/
vendor/
__pycache__/
*.pyc

# 系统文件
.DS_Store
Thumbs.db
*.log
"""

_REV_RE = re.compile(r"^[0-9a-fA-F]{4,64}$")
_mut_lock = threading.Lock()


class GitError(Exception):
    def __init__(self, message: str, can_force: bool = False):
        super().__init__(message)
        self.can_force = can_force


@contextmanager
def mutation_lock(timeout: float = 30):
    acquired = _mut_lock.acquire(timeout=timeout)
    if not acquired:
        raise GitError("git.busy")
    try:
        yield
    finally:
        _mut_lock.release()


def _no_window() -> int:
    return 0x08000000 if os.name == "nt" else 0


def _env() -> Dict[str, str]:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "Never"
    env["GIT_OPTIONAL_LOCKS"] = "0"
    env.pop("GIT_DIR", None)
    env.pop("GIT_WORK_TREE", None)
    return env


def git_version() -> str:
    git = shutil.which("git")
    if not git:
        return ""
    try:
        proc = subprocess.run(
            [git, "--version"],
            capture_output=True,
            timeout=8,
            env=_env(),
            creationflags=_no_window(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout.decode("utf-8", errors="replace").strip()


def _run(root: str, args: List[str], timeout: float = 20) -> subprocess.CompletedProcess:
    git = shutil.which("git")
    if not git:
        raise GitError("git.missing")
    cmd = [git, "-c", "core.quotepath=false", "-c", "i18n.logOutputEncoding=utf-8", *args]
    proc: Optional[subprocess.CompletedProcess] = None
    for attempt in range(2):
        try:
            proc = subprocess.run(
                cmd,
                cwd=root,
                capture_output=True,
                timeout=timeout,
                env=_env(),
                creationflags=_no_window(),
            )
        except subprocess.TimeoutExpired as exc:
            raise GitError("git.timeout") from exc
        except FileNotFoundError as exc:
            raise GitError("git.missing") from exc
        stderr = proc.stderr.decode("utf-8", errors="replace")
        if proc.returncode != 0 and "index.lock" in stderr and attempt == 0:
            time.sleep(0.4)
            continue
        break
    if proc is None:
        raise GitError("git.failed")
    return proc


def _text(raw: bytes) -> str:
    return raw.decode("utf-8", errors="replace")


def _stdout(proc: subprocess.CompletedProcess) -> str:
    return _text(proc.stdout)


def _error_text(proc: subprocess.CompletedProcess) -> str:
    err = _text(proc.stderr).strip()
    out = _stdout(proc).strip()
    return err or out or "git.failed"


def _ensure(proc: subprocess.CompletedProcess, allow: Iterable[int] = (0,)) -> None:
    if proc.returncode in allow:
        return
    message = _error_text(proc)
    lowered = message.lower()
    can_force = "not fully merged" in lowered or "未完全合并" in message
    raise GitError(message, can_force=can_force)


def _chunks(items: List[str], size: int) -> Iterator[List[str]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def is_repo(root: str) -> bool:
    git_dir = os.path.join(root, ".git")
    return os.path.isdir(git_dir) or os.path.isfile(git_dir)


def _require_repo(root: str) -> None:
    if not git_version():
        raise GitError("git.missing")
    if not os.path.isdir(root):
        raise GitError("workspace.missing")
    if not is_repo(root):
        raise GitError("workspace.notRepo")


def _git_dir(root: str) -> str:
    path = os.path.join(root, ".git")
    if os.path.isdir(path):
        return path
    if os.path.isfile(path):
        try:
            text = open(path, encoding="utf-8").read().strip()
        except OSError:
            return path
        if text.startswith("gitdir:"):
            target = text.split(":", 1)[1].strip()
            if not os.path.isabs(target):
                target = os.path.normpath(os.path.join(root, target))
            return target
    return path


def repo_state(root: str) -> str:
    git_dir = _git_dir(root)
    if os.path.exists(os.path.join(git_dir, "MERGE_HEAD")):
        return "merge"
    if os.path.exists(os.path.join(git_dir, "rebase-merge")) or os.path.exists(
        os.path.join(git_dir, "rebase-apply")
    ):
        return "rebase"
    if os.path.exists(os.path.join(git_dir, "CHERRY_PICK_HEAD")):
        return "cherry-pick"
    return ""


def _unquote(quoted: str) -> str:
    inner = quoted[1:-1]
    out = bytearray()
    index = 0
    mapping = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"'}
    while index < len(inner):
        if inner[index] == "\\" and index + 1 < len(inner):
            nxt = inner[index + 1]
            if nxt in mapping:
                out.extend(mapping[nxt].encode("utf-8"))
                index += 2
                continue
            if nxt.isdigit() and index + 3 < len(inner):
                octal = inner[index + 1 : index + 4]
                try:
                    out.append(int(octal, 8))
                    index += 4
                    continue
                except ValueError:
                    pass
        out.extend(inner[index].encode("utf-8"))
        index += 1
    return out.decode("utf-8", errors="replace")


def _clean_path(path: str) -> str:
    path = path.strip()
    if len(path) >= 2 and path[0] == '"' and path[-1] == '"':
        return _unquote(path)
    return path


def safe_rel(root: str, rel: str) -> str:
    if rel is None:
        raise GitError("path.empty")
    text = _clean_path(str(rel)).replace("\\", "/").strip().lstrip("/")
    if not text or text.startswith("-"):
        raise GitError("path.invalid")
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if any(part == ".." for part in parts):
        raise GitError("path.outside")
    full = os.path.abspath(os.path.join(root, *parts))
    root_abs = os.path.abspath(root)
    norm_full = os.path.normcase(full)
    norm_root = os.path.normcase(root_abs)
    if norm_full != norm_root and not norm_full.startswith(norm_root + os.sep):
        raise GitError("path.outside")
    return "/".join(parts)


def safe_branch(name: str) -> str:
    text = (name or "").strip()
    if not text or text.startswith("-") or text.startswith("/") or text.endswith("/"):
        raise GitError("branch.invalid")
    if ".." in text or text.endswith(".lock") or "//" in text:
        raise GitError("branch.invalid")
    if any(char in text for char in " ~^:?*[\\\n\r"):
        raise GitError("branch.badChar")
    if any(ord(char) < 32 for char in text):
        raise GitError("branch.invalid")
    return text


def safe_rev(rev: str) -> str:
    text = (rev or "").strip()
    if not _REV_RE.match(text):
        raise GitError("rev.invalid")
    return text


def parse_branch_header(line: str) -> Dict[str, Any]:
    body = line[3:].strip() if line.startswith("##") else line.strip()
    ahead = behind = 0
    gone = False
    matched = re.search(r"\s\[(.+)\]\s*$", body)
    if matched:
        extra = matched.group(1)
        body = body[: matched.start()].strip()
        ahead_match = re.search(r"ahead\s+(\d+)", extra)
        behind_match = re.search(r"behind\s+(\d+)", extra)
        if ahead_match:
            ahead = int(ahead_match.group(1))
        if behind_match:
            behind = int(behind_match.group(1))
        gone = "gone" in extra
    detached = False
    empty = False
    upstream = ""
    if body.startswith("HEAD (no branch)"):
        detached = True
        branch = "HEAD"
    elif body.startswith("No commits yet on "):
        empty = True
        branch = body[len("No commits yet on ") :]
    elif "..." in body:
        branch, upstream = body.split("...", 1)
    else:
        branch = body
    return {
        "branch": branch.strip(),
        "detached": detached,
        "empty": empty,
        "upstream": upstream.strip(),
        "upstreamGone": gone,
        "ahead": ahead,
        "behind": behind,
    }


def parse_refs(raw: str) -> List[Dict[str, str]]:
    text = (raw or "").strip()
    if not text:
        return []
    refs: List[Dict[str, str]] = []
    for token in text.split(","):
        token = token.strip()
        if not token:
            continue
        head = False
        if token.startswith("HEAD -> "):
            head = True
            token = token[len("HEAD -> ") :].strip()
        elif token == "HEAD":
            refs.append({"name": "HEAD", "kind": "head"})
            continue
        kind = "other"
        name = token
        if token.startswith("refs/heads/"):
            kind, name = "branch", token[len("refs/heads/") :]
        elif token.startswith("refs/remotes/"):
            kind, name = "remote", token[len("refs/remotes/") :]
        elif token.startswith("refs/tags/"):
            kind, name = "tag", token[len("refs/tags/") :]
            if name.endswith("^{}"):
                name = name[:-3]
        if head:
            refs.append({"name": "HEAD", "kind": "head"})
        if name:
            refs.append({"name": name, "kind": kind})
    return refs


def parse_status(text: str) -> Dict[str, Any]:
    header: Dict[str, Any] = {
        "branch": "",
        "detached": False,
        "empty": False,
        "upstream": "",
        "upstreamGone": False,
        "ahead": 0,
        "behind": 0,
    }
    files: List[Dict[str, Any]] = []
    for raw in text.splitlines():
        line = raw.rstrip("\r")
        if not line:
            continue
        if line.startswith("##"):
            header.update(parse_branch_header(line))
            continue
        if len(line) < 3:
            continue
        index_status, work_status = line[0], line[1]
        rest = line[3:]
        orig = ""
        path = rest
        if "\t" in rest:
            orig, path = rest.split("\t", 1)
        elif " -> " in rest and index_status in ("R", "C"):
            orig, path = rest.split(" -> ", 1)
        path = _clean_path(path)
        orig = _clean_path(orig) if orig else ""
        untracked = index_status == "?" and work_status == "?"
        if index_status == "!" and work_status == "!":
            continue
        files.append(
            {
                "path": path,
                "origPath": orig,
                "index": index_status,
                "work": work_status,
                "untracked": untracked,
                "staged": (not untracked) and index_status not in (" ", "?"),
                "unstaged": (not untracked) and work_status not in (" ", "?"),
            }
        )
    return {
        **header,
        "files": files,
        "stagedCount": sum(1 for item in files if item["staged"]),
        "unstagedCount": sum(1 for item in files if item["unstaged"]),
        "untrackedCount": sum(1 for item in files if item["untracked"]),
    }


def _config(root: str, key: str) -> str:
    proc = _run(root, ["config", "--get", key])
    if proc.returncode != 0:
        return ""
    return _stdout(proc).strip()


def _identity(root: str) -> Dict[str, str]:
    return {"name": _config(root, "user.name"), "email": _config(root, "user.email")}


def _require_identity(root: str) -> None:
    identity = _identity(root)
    if not identity["name"] or not identity["email"]:
        raise GitError("identity.required")


def list_remotes(root: str) -> List[Dict[str, str]]:
    if not is_repo(root):
        return []
    proc = _run(root, ["remote", "-v"])
    if proc.returncode != 0:
        return []
    remotes: Dict[str, Dict[str, str]] = {}
    for line in _stdout(proc).splitlines():
        matched = re.match(r"^(\S+)\s+(\S+)\s+\((fetch|push)\)$", line.strip())
        if not matched:
            continue
        name, url, kind = matched.groups()
        record = remotes.setdefault(name, {"name": name, "fetch": "", "push": ""})
        record[kind] = url
    return list(remotes.values())


def _last_commit(root: str) -> Optional[Dict[str, Any]]:
    proc = _run(root, ["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%at"])
    if proc.returncode != 0:
        return None
    parts = _stdout(proc).strip().split("\x1f")
    if len(parts) < 4:
        return None
    return {
        "hash": parts[0],
        "short": parts[1],
        "subject": parts[2],
        "time": int(parts[3]) if parts[3].isdigit() else 0,
    }


def summary(root: str) -> Dict[str, Any]:
    version = git_version()
    base: Dict[str, Any] = {
        "gitAvailable": bool(version),
        "gitVersion": version,
        "workspace": os.path.abspath(root),
        "repo": False,
    }
    if not version:
        base["error"] = "git.missing"
        return base
    if not os.path.isdir(root):
        base["error"] = "workspace.missing"
        return base
    if not is_repo(root):
        return base
    proc = _run(root, ["status", "--porcelain=v1", "-b", "--untracked-files=normal"])
    _ensure(proc)
    parsed = parse_status(_stdout(proc))
    dirty = parsed["stagedCount"] + parsed["unstagedCount"] + parsed["untrackedCount"]
    return {
        **base,
        "repo": True,
        "branch": parsed["branch"],
        "detached": parsed["detached"],
        "empty": parsed["empty"],
        "upstream": parsed["upstream"],
        "upstreamGone": parsed["upstreamGone"],
        "ahead": parsed["ahead"],
        "behind": parsed["behind"],
        "staged": parsed["stagedCount"],
        "unstaged": parsed["unstagedCount"],
        "untracked": parsed["untrackedCount"],
        "clean": dirty == 0,
        "state": repo_state(root),
        "identity": _identity(root),
        "remotes": list_remotes(root),
        "lastCommit": _last_commit(root),
        "gitignore": os.path.isfile(os.path.join(root, ".gitignore")),
    }


def changes(root: str) -> Dict[str, Any]:
    _require_repo(root)
    proc = _run(root, ["status", "--porcelain=v1", "-b", "--untracked-files=all"])
    _ensure(proc)
    parsed = parse_status(_stdout(proc))
    files = parsed["files"]
    truncated = False
    if len(files) > 2000:
        files = files[:2000]
        truncated = True
    return {
        "branch": parsed["branch"],
        "detached": parsed["detached"],
        "empty": parsed["empty"],
        "upstream": parsed["upstream"],
        "upstreamGone": parsed["upstreamGone"],
        "ahead": parsed["ahead"],
        "behind": parsed["behind"],
        "state": repo_state(root),
        "identity": _identity(root),
        "hasRemote": bool(list_remotes(root)),
        "files": files,
        "truncated": truncated,
        "staged": parsed["stagedCount"],
        "unstaged": parsed["unstagedCount"],
        "untracked": parsed["untrackedCount"],
    }


def diff_file(root: str, rel: str, mode: str) -> Dict[str, Any]:
    _require_repo(root)
    path = safe_rel(root, rel)
    if mode == "untracked":
        return _untracked_preview(root, path)
    args = ["diff", "--no-ext-diff", "--unified=3"]
    if mode == "staged":
        args.append("--cached")
    elif mode != "unstaged":
        raise GitError("diff.unknown")
    args.extend(["--", path])
    proc = _run(root, args)
    _ensure(proc, allow=(0, 1))
    text = _stdout(proc)
    if "Binary files" in text or "二进制文件" in text:
        return {"binary": True, "text": "", "path": path, "mode": mode}
    truncated = len(text) > 150_000
    if truncated:
        text = text[:150_000]
    return {
        "binary": False,
        "text": text,
        "path": path,
        "mode": mode,
        "truncated": truncated,
    }


def _untracked_preview(root: str, path: str) -> Dict[str, Any]:
    full = os.path.join(root, *path.split("/"))
    if os.path.isdir(full) and not os.path.islink(full):
        return {"directory": True, "path": path, "text": "", "mode": "untracked"}
    if not os.path.isfile(full):
        return {"missing": True, "path": path, "text": "", "mode": "untracked"}
    size = os.path.getsize(full)
    if size > 200_000:
        return {"tooLarge": True, "path": path, "size": size, "text": "", "mode": "untracked"}
    with open(full, "rb") as handle:
        data = handle.read()
    if b"\0" in data[:8000]:
        return {"binary": True, "path": path, "text": "", "mode": "untracked"}
    return {
        "untracked": True,
        "binary": False,
        "path": path,
        "text": data.decode("utf-8", errors="replace"),
        "mode": "untracked",
    }


def stage(root: str, paths: List[str]) -> None:
    _require_repo(root)
    rels = [safe_rel(root, path) for path in paths if str(path).strip()]
    if not rels:
        raise GitError("stage.empty")
    with mutation_lock():
        for chunk in _chunks(rels, 80):
            _ensure(_run(root, ["add", "--", *chunk]))


def stage_all(root: str) -> None:
    _require_repo(root)
    with mutation_lock():
        _ensure(_run(root, ["add", "-A", "--", "."]))


def unstage(root: str, paths: List[str]) -> None:
    _require_repo(root)
    rels = [safe_rel(root, path) for path in paths if str(path).strip()]
    if not rels:
        raise GitError("unstage.empty")
    with mutation_lock():
        for chunk in _chunks(rels, 80):
            proc = _run(root, ["restore", "--staged", "--", *chunk])
            if proc.returncode != 0:
                proc = _run(root, ["reset", "-q", "HEAD", "--", *chunk])
                if proc.returncode != 0:
                    proc = _run(root, ["rm", "--cached", "-q", "--ignore-unmatch", "--", *chunk])
            _ensure(proc)


def unstage_all(root: str) -> None:
    _require_repo(root)
    with mutation_lock():
        proc = _run(root, ["reset", "-q"])
        if proc.returncode == 0:
            return
        message = _error_text(proc)
        lowered = message.lower()
        if "head" in lowered or "unknown revision" in lowered or "ambiguous" in lowered:
            _ensure(_run(root, ["rm", "--cached", "-r", "-q", "--ignore-unmatch", "--", "."]))
            return
        raise GitError(message)


def discard(root: str, rel: str, untracked: bool = False) -> None:
    _require_repo(root)
    path = safe_rel(root, rel)
    with mutation_lock():
        if untracked:
            full = os.path.join(root, *path.split("/"))
            if os.path.isdir(full) and not os.path.islink(full):
                raise GitError("discard.directory")
            if os.path.lexists(full):
                os.remove(full)
                return
            raise GitError("file.missing")
        proc = _run(root, ["restore", "--worktree", "--source=HEAD", "--", path])
        if proc.returncode != 0:
            proc = _run(root, ["checkout", "--", path])
        _ensure(proc)


def commit(root: str, message: str) -> Dict[str, Any]:
    text = (message or "").strip()
    if not text:
        raise GitError("commit.emptyMessage")
    if len(text) > 5000:
        raise GitError("commit.messageTooLong")
    _require_repo(root)
    _require_identity(root)
    with mutation_lock():
        quiet = _run(root, ["diff", "--cached", "--quiet"])
        if quiet.returncode == 0:
            raise GitError("commit.nothingStaged")
        if quiet.returncode not in (0, 1):
            message_text = _error_text(quiet)
            if "HEAD" not in message_text and "bad revision" not in message_text.lower():
                raise GitError(message_text)
            staged = _run(root, ["diff", "--cached", "--name-only"])
            if staged.returncode != 0 or not _stdout(staged).strip():
                raise GitError("commit.nothingStaged")
        proc = _run(root, ["commit", "-m", text], timeout=40)
        _ensure(proc)
        return {"subject": text.splitlines()[0], "output": _stdout(proc).strip()}


def set_identity(root: str, name: str, email: str) -> None:
    _require_repo(root)
    name = (name or "").strip()
    email = (email or "").strip()
    if not name or "@" not in email or any(char in name + email for char in "\n\r"):
        raise GitError("identity.invalid")
    with mutation_lock():
        _ensure(_run(root, ["config", "user.name", name]))
        _ensure(_run(root, ["config", "user.email", email]))


def _switch_missing(proc: subprocess.CompletedProcess) -> bool:
    err = _error_text(proc).lower()
    return "is not a git command" in err or "unknown option" in err or "not a git command" in err


def graph_log(root: str, limit: int = 300) -> Dict[str, Any]:
    _require_repo(root)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 300
    limit = max(1, min(limit, 2000))
    empty = _run(root, ["rev-parse", "--verify", "HEAD"])
    if empty.returncode != 0:
        return {"commits": [], "maxLane": 0}
    sep = "\x1f"
    rec = "\x1e"
    fmt = f"%H{sep}%P{sep}%an{sep}%ae{sep}%at{sep}%s{sep}%D{rec}"
    proc = _run(
        root,
        [
            "log",
            "--all",
            "--date-order",
            f"-n{limit}",
            "--decorate=full",
            f"--pretty=format:{fmt}",
        ],
        timeout=30,
    )
    _ensure(proc)
    commits: List[Dict[str, Any]] = []
    for chunk in _stdout(proc).split(rec):
        chunk = chunk.strip("\n")
        if not chunk.strip():
            continue
        parts = chunk.split(sep)
        if len(parts) < 7:
            continue
        digest, parents, author, email, when, subject, refs = parts[:7]
        digest = digest.strip()
        commits.append(
            {
                "hash": digest,
                "short": digest[:7],
                "parents": [item for item in parents.split() if item],
                "author": author,
                "email": email,
                "time": int(when) if str(when).isdigit() else 0,
                "subject": subject,
                "refs": parse_refs(refs),
            }
        )
    rows = build_graph(commits)
    max_lane = 0
    for row in rows:
        lanes = [row["lane"], *row["rails"]]
        lanes.extend(link["to"] for link in row["links"])
        lanes.extend(link["from"] for link in row["links"])
        max_lane = max(max_lane, *lanes)
    return {"commits": rows, "maxLane": max_lane}


def _parse_name_status(text: str) -> List[Dict[str, str]]:
    files: List[Dict[str, str]] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0]
        code = status[:1]
        if code in ("R", "C") and len(parts) >= 3:
            files.append(
                {
                    "status": code,
                    "path": _clean_path(parts[2]),
                    "origPath": _clean_path(parts[1]),
                }
            )
        elif len(parts) >= 2:
            files.append({"status": code, "path": _clean_path(parts[1]), "origPath": ""})
    return files


def commit_detail(root: str, rev: str) -> Dict[str, Any]:
    _require_repo(root)
    rev = safe_rev(rev)
    meta = _run(root, ["log", "-1", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s", rev])
    _ensure(meta)
    parts = _stdout(meta).strip().split("\x1f")
    if len(parts) < 6:
        raise GitError("commit.unreadable")
    body = _run(root, ["log", "-1", "--format=%B", rev])
    _ensure(body)
    files = _run(
        root,
        ["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", rev],
    )
    _ensure(files)
    parents = [item for item in parts[1].split() if item]
    return {
        "hash": parts[0],
        "short": parts[0][:7],
        "parents": parents,
        "author": parts[2],
        "email": parts[3],
        "time": int(parts[4]) if parts[4].isdigit() else 0,
        "subject": parts[5],
        "body": _stdout(body).strip(),
        "files": _parse_name_status(_stdout(files)),
    }


def commit_file_diff(root: str, rev: str, rel: str) -> Dict[str, Any]:
    _require_repo(root)
    rev = safe_rev(rev)
    path = safe_rel(root, rel)
    meta = _run(root, ["log", "-1", "--format=%P", rev])
    _ensure(meta)
    parents = [item for item in _stdout(meta).split() if item]
    if parents:
        proc = _run(root, ["diff", "--no-ext-diff", "--unified=3", f"{rev}^", rev, "--", path])
    else:
        proc = _run(root, ["show", "--format=", "--unified=3", rev, "--", path])
    _ensure(proc, allow=(0, 1))
    text = _stdout(proc)
    if "Binary files" in text or "二进制文件" in text:
        return {"binary": True, "text": "", "path": path}
    truncated = len(text) > 150_000
    if truncated:
        text = text[:150_000]
    return {"binary": False, "text": text, "path": path, "truncated": truncated}


def _parse_track(track: str) -> Dict[str, int]:
    ahead = behind = 0
    ahead_match = re.search(r"ahead\s+(\d+)", track or "")
    behind_match = re.search(r"behind\s+(\d+)", track or "")
    if ahead_match:
        ahead = int(ahead_match.group(1))
    if behind_match:
        behind = int(behind_match.group(1))
    return {"ahead": ahead, "behind": behind}


def branches(root: str) -> Dict[str, Any]:
    _require_repo(root)
    local_fmt = "%(refname:short)%x1f%(objectname:short)%x1f%(upstream:short)%x1f%(upstream:track)%x1f%(HEAD)%x1f%(subject)"
    local = _run(root, ["branch", f"--format={local_fmt}"])
    _ensure(local)
    remote = _run(root, ["branch", "-r", "--format=%(refname:short)%x1f%(objectname:short)%x1f%(subject)"])
    _ensure(remote)
    locals_rows: List[Dict[str, Any]] = []
    for line in _stdout(local).splitlines():
        if not line.strip():
            continue
        parts = line.split("\x1f")
        if len(parts) < 6:
            continue
        track = _parse_track(parts[3])
        locals_rows.append(
            {
                "name": parts[0],
                "sha": parts[1],
                "upstream": parts[2],
                "ahead": track["ahead"],
                "behind": track["behind"],
                "current": parts[4].strip() == "*",
                "subject": parts[5],
            }
        )
    remote_rows: List[Dict[str, str]] = []
    for line in _stdout(remote).splitlines():
        if not line.strip():
            continue
        parts = line.split("\x1f")
        if len(parts) < 3:
            continue
        if parts[0].endswith("/HEAD"):
            continue
        remote_rows.append({"name": parts[0], "sha": parts[1], "subject": parts[2]})
    return {"local": locals_rows, "remote": remote_rows}


def create_branch(root: str, name: str, checkout: bool = True) -> None:
    _require_repo(root)
    name = safe_branch(name)
    with mutation_lock():
        if checkout:
            proc = _run(root, ["switch", "-c", name])
            if proc.returncode != 0 and _switch_missing(proc):
                proc = _run(root, ["checkout", "-b", name])
        else:
            proc = _run(root, ["branch", name])
        _ensure(proc)


def checkout(root: str, name: str, remote: bool = False) -> None:
    _require_repo(root)
    with mutation_lock():
        if remote:
            text = (name or "").strip()
            if not text or text.startswith("-") or ".." in text:
                raise GitError("branch.invalid")
            proc = _run(root, ["switch", "--track", text])
            if proc.returncode != 0:
                local = safe_branch(text.split("/", 1)[-1])
                proc = _run(root, ["switch", local])
                if proc.returncode != 0 and _switch_missing(proc):
                    proc = _run(root, ["checkout", local])
        else:
            text = safe_branch(name)
            proc = _run(root, ["switch", text])
            if proc.returncode != 0 and _switch_missing(proc):
                proc = _run(root, ["checkout", text])
        _ensure(proc)


def delete_branch(root: str, name: str, force: bool = False) -> None:
    _require_repo(root)
    name = safe_branch(name)
    with mutation_lock():
        flag = "-D" if force else "-d"
        _ensure(_run(root, ["branch", flag, name]))


def sync(root: str, action: str) -> Dict[str, str]:
    _require_repo(root)
    if action not in ("fetch", "pull", "push"):
        raise GitError("sync.unknown")
    if not list_remotes(root):
        raise GitError("sync.noRemote")
    with mutation_lock(timeout=90):
        if action == "fetch":
            proc = _run(root, ["fetch", "--prune"], timeout=60)
        elif action == "pull":
            proc = _run(root, ["pull", "--ff-only"], timeout=60)
        else:
            proc = _push(root)
        _ensure(proc)
        output = (_stdout(proc) + "\n" + _text(proc.stderr)).strip()
        return {"output": output}


def _push(root: str) -> subprocess.CompletedProcess:
    upstream = _run(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
    if upstream.returncode == 0 and _stdout(upstream).strip():
        return _run(root, ["push"], timeout=60)
    names = {item["name"] for item in list_remotes(root)}
    if "origin" not in names:
        raise GitError("sync.noUpstream")
    return _run(root, ["push", "-u", "origin", "HEAD"], timeout=60)


def init_repo(
    root: str,
    initial_commit: bool = True,
    name: str = "",
    email: str = "",
    locale: str = "",
) -> Dict[str, Any]:
    if not git_version():
        raise GitError("git.missing")
    if not os.path.isdir(root):
        raise GitError("workspace.missing")
    if is_repo(root):
        raise GitError("workspace.alreadyRepo")
    with mutation_lock():
        proc = _run(root, ["init", "-b", "main"])
        if proc.returncode != 0:
            _ensure(_run(root, ["init"]))
            _run(root, ["symbolic-ref", "HEAD", "refs/heads/main"])
        ignore_path = os.path.join(root, ".gitignore")
        created_ignore = False
        if not os.path.exists(ignore_path):
            with open(ignore_path, "w", encoding="utf-8", newline="\n") as handle:
                english = str(locale or "").replace("-", "_").lower().startswith("en")
                handle.write(GITIGNORE_TEMPLATE_EN if english else GITIGNORE_TEMPLATE)
            created_ignore = True
        if name.strip() and email.strip():
            _ensure(_run(root, ["config", "user.name", name.strip()]))
            _ensure(_run(root, ["config", "user.email", email.strip()]))
        committed = False
        message = "init.created"
        if initial_commit:
            identity = _identity(root)
            if not identity["name"] or not identity["email"]:
                message = "init.needIdentity"
            else:
                _ensure(_run(root, ["add", "-A", "--", "."]))
                _ensure(
                    _run(root, ["commit", "-m", "chore: initialize FatNotes workspace"], timeout=40)
                )
                committed = True
                message = "init.committed"
        return {"createdIgnore": created_ignore, "committed": committed, "message": message}


def read_gitignore(root: str) -> str:
    path = os.path.join(root, ".gitignore")
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def write_gitignore(root: str, text: str) -> None:
    if not isinstance(text, str):
        raise GitError("ignore.invalid")
    if len(text) > 200_000:
        raise GitError("ignore.tooLong")
    if not os.path.isdir(root):
        raise GitError("workspace.missing")
    path = os.path.join(root, ".gitignore")
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def render_message(template: str, count: int, branch: str, names: List[str]) -> str:
    summary = ", ".join(names[:3])
    if len(names) > 3:
        summary += f" +{len(names) - 3}"
    now = time.localtime()
    data = {
        "time": time.strftime("%Y-%m-%d %H:%M", now),
        "date": time.strftime("%Y-%m-%d", now),
        "count": count,
        "branch": branch or "HEAD",
        "summary": summary or f"{count} files",
    }
    try:
        text = (template or "").format(**data).strip()
    except Exception:
        text = ""
    return text or f"chore: auto save {data['time']}"


def auto_add_and_commit(root: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    """按设置筛选未暂存文件并提交。索引里已有暂存时整轮跳过，避免卷走半成品。"""
    if not git_version():
        return {"ok": False, "error": "git.missingShort", "committed": False}
    if not os.path.isdir(root) or not is_repo(root):
        return {"ok": True, "skipped": "norepo", "committed": False}
    state = repo_state(root)
    if state:
        return {"ok": True, "skipped": state, "committed": False}
    identity = _identity(root)
    if not identity["name"] or not identity["email"]:
        return {
            "ok": False,
            "error": "identity.autoMissing",
            "committed": False,
        }
    auto = settings.get("autoCommit") if isinstance(settings.get("autoCommit"), dict) else {}
    try:
        with mutation_lock(timeout=2):
            return _auto_locked(root, auto or {})
    except GitError as exc:
        if str(exc) == "git.busy":
            return {"ok": True, "skipped": "busy", "committed": False}
        return {"ok": False, "error": str(exc), "committed": False}


def _auto_locked(root: str, auto: Dict[str, Any]) -> Dict[str, Any]:
    proc = _run(root, ["status", "--porcelain=v1", "-b", "--untracked-files=all"])
    _ensure(proc)
    parsed = parse_status(_stdout(proc))
    if any(item["staged"] for item in parsed["files"]):
        return {"ok": True, "skipped": "staged", "committed": False}
    excludes = auto.get("exclude") or []
    prefixes = auto.get("includePrefixes") or []
    include_untracked = auto.get("includeUntracked") is not False
    chosen: List[str] = []
    for item in parsed["files"]:
        path = item["path"]
        if not path or not is_included(path, prefixes) or is_excluded(path, excludes):
            continue
        if item["untracked"] and not include_untracked:
            continue
        if not item["untracked"] and not item["unstaged"]:
            continue
        chosen.append(path)
    truncated = False
    if len(chosen) > 2000:
        chosen = chosen[:2000]
        truncated = True
    if not chosen:
        return {"ok": True, "skipped": "clean", "committed": False, "files": 0}
    added = False
    try:
        for chunk in _chunks(chosen, 80):
            _ensure(_run(root, ["add", "--", *chunk]))
            added = True
        message = render_message(
            str(auto.get("messageTemplate") or ""),
            len(chosen),
            str(parsed.get("branch") or ""),
            chosen,
        )
        _ensure(_run(root, ["commit", "-m", message], timeout=40))
        return {
            "ok": True,
            "committed": True,
            "files": len(chosen),
            "subject": message.splitlines()[0],
            "truncated": truncated,
        }
    except Exception as exc:
        if added:
            _run(root, ["reset", "-q"])
        return {"ok": False, "error": str(exc), "committed": False}
