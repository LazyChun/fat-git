"""插件配置的默认值与归一化。

配置存在宿主的 bespokePluginConfig 里，前端设置页和自动提交线程读的是同一份。
"""

from __future__ import annotations

from typing import Any, Dict, List

# FatNotes 工作区里 dbs/ 是 SQLite，变化频繁且是二进制，默认不进自动提交。
# 书籍、配置、思维流、技能等文本目录默认可被跟踪。
DEFAULT_EXCLUDES: List[str] = [
    "dbs/**",
    "*.db",
    "*.db-wal",
    "*.db-shm",
    "*.db-journal",
    "*.sqlite",
    "*.sqlite3",
    "*.sqlite-journal",
    "node_modules/**",
    "**/__pycache__/**",
    "*.pyc",
    "dist/**",
    "vendor/**",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
]

DEFAULT_TEMPLATE = "chore: auto save {time}"


def _as_str_list(value: Any) -> List[str] | None:
    if not isinstance(value, list):
        return None
    items: List[str] = []
    for raw in value:
        text = str(raw).strip()
        if text:
            items.append(text)
    return items


def _clamp_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(number, high))


def normalize_settings(raw: Any) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    auto = data.get("autoCommit") if isinstance(data.get("autoCommit"), dict) else {}
    exclude = _as_str_list(auto.get("exclude"))
    prefixes = _as_str_list(auto.get("includePrefixes"))
    template = str(auto.get("messageTemplate") or DEFAULT_TEMPLATE).strip() or DEFAULT_TEMPLATE
    if len(template) > 500:
        template = template[:500]
    return {
        "autoCommit": {
            "enabled": bool(auto.get("enabled")),
            "intervalMinutes": _clamp_int(auto.get("intervalMinutes"), 15, 1, 24 * 60),
            "messageTemplate": template,
            "includeUntracked": auto.get("includeUntracked") is not False,
            "includePrefixes": prefixes or [],
            "exclude": list(DEFAULT_EXCLUDES) if exclude is None else exclude,
        },
        "graphLimit": _clamp_int(data.get("graphLimit"), 300, 50, 2000),
    }
