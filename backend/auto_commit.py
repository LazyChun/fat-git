"""后台自动提交。

线程在插件进程启动后一直存活：未开启时只睡眠；开启后按间隔扫描工作区。
启动后先等满一个间隔，避免插件一加载就把工作区提交掉。
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from typing import Any, Dict, Optional

from plugin_runtime import host_call, host_get_system_paths, wait_for_host_ready

from git_repo import GitError, auto_add_and_commit
from settings import normalize_settings

_stop = threading.Event()
_wake = threading.Event()
_thread: Optional[threading.Thread] = None
_state_lock = threading.Lock()
_last: Dict[str, Any] = {}
_settings_cache: Dict[str, Any] = {}
_settings_at = 0.0
_last_run = 0.0


def workspace_root() -> str:
    folder = ""
    try:
        paths = host_call("system.getPaths", {}) or {}
        if isinstance(paths, dict):
            folder = str(paths.get("lastClosedFolder") or "")
    except Exception:
        paths = host_get_system_paths() or {}
        folder = str(paths.get("lastClosedFolder") or "")
    folder = folder.strip()
    if not folder or not os.path.isdir(folder):
        raise GitError("workspace.notOpen")
    return os.path.abspath(folder)


def load_settings(force: bool = False) -> Dict[str, Any]:
    global _settings_cache, _settings_at
    now = time.time()
    if not force and _settings_cache and now - _settings_at < 5:
        return _settings_cache
    raw: Dict[str, Any] = {}
    try:
        data = host_call("pluginConfig.get", {})
        if isinstance(data, dict):
            raw = data
    except Exception:
        raw = {}
    normalized = normalize_settings(raw)
    _settings_cache = normalized
    _settings_at = now
    return normalized


def save_settings(incoming: Any) -> Dict[str, Any]:
    global _settings_cache, _settings_at
    normalized = normalize_settings(incoming)
    host_call("pluginConfig.set", {"config": normalized, "merge": True})
    _settings_cache = normalized
    _settings_at = time.time()
    _wake.set()
    return normalized


def last_status() -> Dict[str, Any]:
    with _state_lock:
        last = dict(_last)
    try:
        settings = load_settings()
    except Exception:
        settings = normalize_settings({})
    auto = settings.get("autoCommit") or {}
    return {
        "enabled": bool(auto.get("enabled")),
        "intervalMinutes": auto.get("intervalMinutes") or 15,
        "running": bool(_thread and _thread.is_alive()),
        "last": last,
    }


def _store(result: Dict[str, Any]) -> None:
    global _last
    with _state_lock:
        _last = result
    try:
        root = workspace_root()
    except Exception:
        return
    git_dir = os.path.join(root, ".git")
    if not os.path.isdir(git_dir):
        return
    path = os.path.join(git_dir, "fat-git-auto.json")
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)
    except OSError:
        pass


def _load_persisted_last() -> None:
    try:
        root = workspace_root()
    except Exception:
        return
    path = os.path.join(root, ".git", "fat-git-auto.json")
    if not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(data, dict):
        _store(data)


def run_once() -> Dict[str, Any]:
    global _last_run
    root = workspace_root()
    settings = load_settings(force=True)
    result = auto_add_and_commit(root, settings)
    result["at"] = int(time.time())
    _last_run = time.time()
    _store(result)
    return result


def _loop() -> None:
    global _last_run
    wait_for_host_ready(30)
    _load_persisted_last()
    _last_run = time.time()
    while not _stop.is_set():
        try:
            settings = load_settings()
            auto = settings.get("autoCommit") or {}
            interval = max(60, int(auto.get("intervalMinutes") or 15) * 60)
            if auto.get("enabled") and time.time() - _last_run >= interval:
                _last_run = time.time()
                result = auto_add_and_commit(workspace_root(), settings)
                result["at"] = int(time.time())
                _store(result)
                if not result.get("ok"):
                    print(
                        f"[fat-git] auto-commit: {result.get('error')}",
                        file=sys.stderr,
                        flush=True,
                    )
        except Exception as exc:
            _store(
                {
                    "ok": False,
                    "error": str(exc),
                    "committed": False,
                    "at": int(time.time()),
                }
            )
            print(f"[fat-git] auto-commit error: {exc}", file=sys.stderr, flush=True)
        _wake.wait(2)
        _wake.clear()


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="fat-git-auto", daemon=True)
    _thread.start()
