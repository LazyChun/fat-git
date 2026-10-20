"""工作区相对路径的包含 / 排除匹配。

自动提交不用 `git add -A` 的 pathspec，而是先读 porcelain，再按这些规则筛文件。
这样数据库、依赖目录可以排除，同时不会误伤用户已经暂存的索引。
"""

from __future__ import annotations

import fnmatch
import re
from typing import Iterable, Pattern


def _compile(pattern: str) -> Pattern[str]:
    pattern = pattern.replace("\\", "/").strip().lstrip("./")
    if pattern.endswith("/"):
        pattern += "**"
    out: list[str] = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
            continue
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
            continue
        char = pattern[i]
        if char == "*":
            out.append("[^/]*")
        elif char == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(char))
        i += 1
    return re.compile("^" + "".join(out) + "$")


def glob_match(path: str, pattern: str) -> bool:
    """匹配仓库内相对路径。不含斜杠的模式同时匹配文件名。"""
    path = path.replace("\\", "/").lstrip("./")
    pattern = pattern.replace("\\", "/").strip()
    if not path or not pattern:
        return False
    if "/" not in pattern.strip("/"):
        base = path.split("/")[-1]
        if fnmatch.fnmatch(base, pattern.strip("/")):
            return True
    return _compile(pattern).match(path) is not None


def is_excluded(path: str, patterns: Iterable[str]) -> bool:
    return any(glob_match(path, str(item)) for item in patterns)


def is_included(path: str, prefixes: Iterable[str]) -> bool:
    """前缀列表为空时表示整个工作区。"""
    cleaned: list[str] = []
    for raw in prefixes:
        item = str(raw).strip().strip("/\\").replace("\\", "/")
        if item:
            cleaned.append(item)
    if not cleaned:
        return True
    path = path.replace("\\", "/").lstrip("./")
    return any(path == pre or path.startswith(pre + "/") for pre in cleaned)
