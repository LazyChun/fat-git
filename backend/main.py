"""fat-git 后端入口。Git 命令只操作宿主当前工作区。"""

from __future__ import annotations

import sys
import traceback

from plugin_runtime import handler, run

import auto_commit
import git_repo
from git_repo import GitError


def _params(params):
    return params if isinstance(params, dict) else {}


def _fail(exc: Exception):
    return {
        "ok": False,
        "error": str(exc),
        "canForce": bool(getattr(exc, "can_force", False)),
    }


def git_handler(fn):
    def wrap(params):
        try:
            return fn(_params(params))
        except GitError as exc:
            return _fail(exc)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            return {"ok": False, "error": str(exc)}

    return wrap


def _root() -> str:
    return auto_commit.workspace_root()


@handler("summary")
@git_handler
def summary(_params):
    return {"ok": True, "summary": git_repo.summary(_root())}


@handler("changes")
@git_handler
def changes(_params):
    return {"ok": True, "changes": git_repo.changes(_root())}


@handler("diff")
@git_handler
def diff(params):
    return {
        "ok": True,
        "diff": git_repo.diff_file(
            _root(),
            str(params.get("path") or ""),
            str(params.get("mode") or "unstaged"),
        ),
    }


@handler("stage")
@git_handler
def stage(params):
    paths = params.get("paths") if isinstance(params.get("paths"), list) else []
    git_repo.stage(_root(), [str(item) for item in paths])
    return {"ok": True}


@handler("stageAll")
@git_handler
def stage_all(_params):
    git_repo.stage_all(_root())
    return {"ok": True}


@handler("unstage")
@git_handler
def unstage(params):
    paths = params.get("paths") if isinstance(params.get("paths"), list) else []
    git_repo.unstage(_root(), [str(item) for item in paths])
    return {"ok": True}


@handler("unstageAll")
@git_handler
def unstage_all(_params):
    git_repo.unstage_all(_root())
    return {"ok": True}


@handler("discard")
@git_handler
def discard(params):
    git_repo.discard(
        _root(),
        str(params.get("path") or ""),
        bool(params.get("untracked")),
    )
    return {"ok": True}


@handler("commit")
@git_handler
def commit(params):
    result = git_repo.commit(_root(), str(params.get("message") or ""))
    return {"ok": True, **result}


@handler("setIdentity")
@git_handler
def set_identity(params):
    git_repo.set_identity(
        _root(),
        str(params.get("name") or ""),
        str(params.get("email") or ""),
    )
    return {"ok": True}


@handler("graph")
@git_handler
def graph(params):
    return {"ok": True, "graph": git_repo.graph_log(_root(), params.get("limit") or 300)}


@handler("commitDetail")
@git_handler
def commit_detail(params):
    return {
        "ok": True,
        "commit": git_repo.commit_detail(_root(), str(params.get("rev") or "")),
    }


@handler("commitFileDiff")
@git_handler
def commit_file_diff(params):
    return {
        "ok": True,
        "diff": git_repo.commit_file_diff(
            _root(),
            str(params.get("rev") or ""),
            str(params.get("path") or ""),
        ),
    }


@handler("branches")
@git_handler
def branches(_params):
    return {"ok": True, "branches": git_repo.branches(_root())}


@handler("createBranch")
@git_handler
def create_branch(params):
    git_repo.create_branch(
        _root(),
        str(params.get("name") or ""),
        bool(params.get("checkout", True)),
    )
    return {"ok": True}


@handler("checkout")
@git_handler
def checkout(params):
    git_repo.checkout(
        _root(),
        str(params.get("name") or ""),
        bool(params.get("remote")),
    )
    return {"ok": True}


@handler("deleteBranch")
@git_handler
def delete_branch(params):
    git_repo.delete_branch(
        _root(),
        str(params.get("name") or ""),
        bool(params.get("force")),
    )
    return {"ok": True}


@handler("sync")
@git_handler
def sync(params):
    result = git_repo.sync(_root(), str(params.get("action") or ""))
    return {"ok": True, **result}


@handler("initRepo")
@git_handler
def init_repo(params):
    result = git_repo.init_repo(
        _root(),
        bool(params.get("initialCommit", True)),
        str(params.get("name") or ""),
        str(params.get("email") or ""),
        str(params.get("locale") or ""),
    )
    return {"ok": True, **result}


@handler("readGitignore")
@git_handler
def read_gitignore(_params):
    return {"ok": True, "text": git_repo.read_gitignore(_root())}


@handler("writeGitignore")
@git_handler
def write_gitignore(params):
    git_repo.write_gitignore(_root(), str(params.get("text") or ""))
    return {"ok": True}


@handler("getSettings")
@git_handler
def get_settings(_params):
    return {"ok": True, "settings": auto_commit.load_settings(force=True)}


@handler("setSettings")
@git_handler
def set_settings(params):
    saved = auto_commit.save_settings(params.get("settings") or params)
    return {"ok": True, "settings": saved}


@handler("autoCommitNow")
@git_handler
def auto_commit_now(_params):
    return {"ok": True, "result": auto_commit.run_once()}


@handler("autoCommitStatus")
@git_handler
def auto_commit_status(_params):
    return {"ok": True, "status": auto_commit.last_status()}


@handler("openWorkspace")
@git_handler
def open_workspace(_params):
    from plugin_runtime import host_call

    root = _root()
    host_call("system.openPath", {"path": root, "select": False})
    return {"ok": True}


if __name__ == "__main__":
    auto_commit.start()
    run()
