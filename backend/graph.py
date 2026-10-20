"""把 git log（新提交在前）排成 Git Graph 式的泳道。

每一行只记录：
- lane: 圆点所在列
- incoming: 圆点上方是否有来自更新提交的连线
- rails: 穿过本行、但不属于当前提交的竖线
- links: 从圆点中心连到父提交所在列的底部
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _first_empty(columns: List[Optional[str]]) -> Optional[int]:
    for index, commit in enumerate(columns):
        if commit is None:
            return index
    return None


def _trim(columns: List[Optional[str]]) -> None:
    while columns and columns[-1] is None:
        columns.pop()


def build_graph(commits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    columns: List[Optional[str]] = []
    rows: List[Dict[str, Any]] = []
    for commit in commits:
        digest = str(commit.get("hash") or "")
        parents = [str(item) for item in (commit.get("parents") or []) if item]
        incoming = digest in columns
        if incoming:
            lane = columns.index(digest)
        else:
            empty = _first_empty(columns)
            if empty is None:
                lane = len(columns)
                columns.append(digest)
            else:
                lane = empty
                columns[lane] = digest
        rails = [index for index, item in enumerate(columns) if item and index != lane]
        links: List[Dict[str, int]] = []
        if not parents:
            columns[lane] = None
        else:
            first, *rest = parents
            first_lane = columns.index(first) if first in columns else None
            if first_lane is not None and first_lane != lane:
                links.append({"from": lane, "to": first_lane})
                columns[lane] = None
            else:
                columns[lane] = first
                links.append({"from": lane, "to": lane})
            for parent in rest:
                if parent in columns:
                    parent_lane = columns.index(parent)
                else:
                    empty = _first_empty(columns)
                    if empty is None:
                        parent_lane = len(columns)
                        columns.append(parent)
                    else:
                        parent_lane = empty
                        columns[parent_lane] = parent
                links.append({"from": lane, "to": parent_lane})
        _trim(columns)
        rows.append(
            {
                **commit,
                "lane": lane,
                "incoming": incoming,
                "rails": rails,
                "links": links,
            }
        )
    return rows
