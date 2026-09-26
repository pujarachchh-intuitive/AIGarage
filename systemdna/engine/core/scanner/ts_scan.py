"""
ts_scan.py — Wraps the existing TypeScript scanner (ts-scan.mjs) via subprocess.
Normalises its JSON output to GraphNode/GraphEdge schema.
Never modifies ts-scan.mjs itself.
"""
import json
import logging
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the existing TS scanner (relative to repo root)
_TS_SCAN_MJS = Path(__file__).parents[4] / "core" / "scanner" / "ts-scan.mjs"


def _make_edge(from_id: str, to_id: str, edge_type: str, rule: str,
               evidence: str) -> dict:
    """Return a normalised GraphEdge dict."""
    return {
        "id": f"e-{uuid.uuid4().hex[:8]}",
        "from": from_id,
        "to": to_id,
        "type": edge_type,
        "source": "parser",
        "confidence": "high",
        "evidence": evidence,
        "rule": rule,
    }


def _normalise_node(raw: dict) -> dict:
    """
    Normalise a raw node dict from ts-scan.mjs to the GraphNode schema.
    ts-scan.mjs may use camelCase or different field names; map them.
    """
    node: dict = {
        "id": raw.get("id", ""),
        "type": raw.get("type", "TSType"),
        "layer": raw.get("layer", "frontend"),
        "name": raw.get("name", raw.get("id", "")),
        "file": raw.get("file", ""),
        "line": raw.get("line", 1),
        "pii": raw.get("pii", False),
        "criticality": raw.get("criticality", "medium"),
        "tested": raw.get("tested", True),
    }
    if "parent" in raw:
        node["parent"] = raw["parent"]
    if "owner" in raw:
        node["owner"] = raw["owner"]
    if "tokens" in raw:
        node["tokens"] = raw["tokens"]
    return node


def _normalise_edge(raw: dict) -> dict:
    """Normalise a raw edge dict from ts-scan.mjs to the GraphEdge schema."""
    return {
        "id": raw.get("id", f"e-{uuid.uuid4().hex[:8]}"),
        "from": raw.get("from", raw.get("source", "")),
        "to": raw.get("to", raw.get("target", "")),
        "type": raw.get("type", "IMPORTS"),
        "source": raw.get("source_kind", "parser"),  # distinguish source kind vs node id
        "confidence": raw.get("confidence", "high"),
        "evidence": raw.get("evidence", ""),
        "rule": raw.get("rule", "rename_ref"),
    }


def scan_typescript_files(repo_path: str) -> tuple[list[dict], list[dict]]:
    """
    Call the existing ts-scan.mjs via subprocess.
    ts-scan.mjs is at: systemdna/core/scanner/ts-scan.mjs
    It takes the repo_path and returns JSON to stdout.
    Parse the JSON and normalise to GraphNode/GraphEdge schema.
    If ts-scan.mjs fails or node is not installed, return ([], []) and log.
    """
    scanner = _TS_SCAN_MJS
    if not scanner.exists():
        logger.warning("[ts_scan] ts-scan.mjs not found at %s — skipping", scanner)
        return [], []

    try:
        result = subprocess.run(
            ["node", str(scanner), repo_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        logger.warning("[ts_scan] node not installed — skipping TypeScript scan")
        return [], []
    except subprocess.TimeoutExpired:
        logger.warning("[ts_scan] ts-scan.mjs timed out — skipping")
        return [], []

    if result.returncode != 0:
        logger.warning("[ts_scan] ts-scan.mjs exited %d: %s",
                       result.returncode, result.stderr[:500])
        return [], []

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        logger.warning("[ts_scan] invalid JSON from ts-scan.mjs: %s", exc)
        return [], []

    raw_nodes = data.get("nodes", [])
    raw_edges = data.get("edges", [])

    nodes = [_normalise_node(n) for n in raw_nodes]
    edges = [_normalise_edge(e) for e in raw_edges]

    return nodes, edges
