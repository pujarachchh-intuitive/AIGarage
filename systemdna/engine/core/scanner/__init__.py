"""
core/scanner/__init__.py — merge all four scanners into a single scan_repo() call.
Deduplicates nodes by id (first occurrence wins).
Emits tool_call RunEvents for the TraceTimeline.
Must complete in under 5 seconds on the ShopFlow fixture.
"""
import logging
import time
from typing import Optional

from core.scanner.config_scan import scan_config_files
from core.scanner.python_scan import scan_python_files
from core.scanner.sql_scan import scan_sql_files
from core.scanner.ts_scan import scan_typescript_files

logger = logging.getLogger(__name__)


def scan_repo(
    repo_path: str,
    emitter=None,  # Optional[EventEmitter]
) -> tuple[list[dict], list[dict]]:
    """
    Call all four scanners. Merge results.
    Deduplicate nodes by id (keep first occurrence).
    Return (nodes, edges).
    Emit tool_call RunEvent for each scanner start/end (for TraceTimeline).
    Must complete in under 5 seconds on ShopFlow.
    """
    scanners = [
        ("python_scan", scan_python_files),
        ("sql_scan", scan_sql_files),
        ("ts_scan", scan_typescript_files),
        ("config_scan", scan_config_files),
    ]

    all_nodes: list[dict] = []
    all_edges: list[dict] = []
    seen_node_ids: set[str] = set()

    for scanner_name, scanner_fn in scanners:
        if emitter is not None:
            emitter.emit(
                "tool_call",
                tool=scanner_name,
                detail=f"starting {scanner_name} on {repo_path}",
            )

        t0 = time.monotonic()
        try:
            nodes, edges = scanner_fn(repo_path)
        except Exception as exc:  # noqa: BLE001
            logger.error("[scan_repo] %s failed: %s", scanner_name, exc)
            nodes, edges = [], []

        elapsed = time.monotonic() - t0
        logger.debug("[scan_repo] %s produced %d nodes, %d edges in %.2fs",
                     scanner_name, len(nodes), len(edges), elapsed)

        # Deduplicate nodes by id (first occurrence wins)
        for node in nodes:
            nid = node.get("id", "")
            if nid and nid not in seen_node_ids:
                seen_node_ids.add(nid)
                all_nodes.append(node)

        all_edges.extend(edges)

        if emitter is not None:
            emitter.emit(
                "tool_call",
                tool=scanner_name,
                detail=f"done: {len(nodes)} nodes, {len(edges)} edges",
            )

    logger.info("[scan_repo] total: %d nodes, %d edges", len(all_nodes), len(all_edges))
    return all_nodes, all_edges


if __name__ == "__main__":
    # Used by docker-compose engine service: python -m core.scanner
    import os
    import sys

    logging.basicConfig(level=logging.INFO)
    path = os.getenv("REPO_WORKSPACE", sys.argv[1] if len(sys.argv) > 1 else ".")
    nodes, edges = scan_repo(path)
    print(f"Scanned {path}: {len(nodes)} nodes, {len(edges)} edges")
