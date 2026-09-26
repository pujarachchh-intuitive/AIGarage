"""
cartographers.py — AG2 Cartographer subagents.
One CartographerAgent per layer; all run in parallel via asyncio.gather.
Uses Gemini 1.5 Pro (get_gemini_ag2_config()) for code-generation-quality analysis.
Emits RunEvents for agent_started / done lifecycle.
"""
import asyncio
import json
import logging
import os
import re
from pathlib import Path

import autogen  # pyautogen

from agents.llm_config import get_gemini_ag2_config
from core.graph import GraphStore
from orchestrator.events import EventEmitter

logger = logging.getLogger(__name__)

# Regex that validates evidence field: e.g. "path/to/file.py:42"
_EVIDENCE_RE = re.compile(r"\w+.*\.\w+:\d+")

LAYERS = [
    "database",
    "pipelines",
    "backend",
    "api",
    "frontend",
    "dashboards",
    "business",
]

_SYSTEM_PROMPT_TEMPLATE = """
You are a Cartographer agent for the {layer} layer of a software system.
Your job: find dependency edges between code entities that the static
parser missed.

You will be given:
- Files in this layer
- Already-known nodes in this layer
- Unresolved references (things that mention identifiers from other layers
  but have no edge yet)

Return ONLY a JSON array of edges. Each edge must have:
- from: source node id (layer:type:qualified_name)
- to: target node id
- type: one of READS/WRITES/CALLS/IMPORTS/DERIVES_FROM/CONSUMES/TYPED_AS
- rule: one of rename_ref/keep_alias/update_type/update_doc/passthrough
- evidence: REQUIRED — must be "relative/file/path.ext:line_number"
- confidence: "medium"

REJECT any edge you cannot ground in a specific file and line number.
Return [] if you find nothing.

Files:
{files_content}

Known nodes:
{nodes_json}

Unresolved references:
{unresolved_refs}
"""


class CartographerAgent:
    """
    AG2 AssistantAgent for one layer.
    LLM: Gemini 1.5 Pro (get_gemini_ag2_config())
    """

    def __init__(self, layer: str) -> None:
        self.layer = layer
        self._config = get_gemini_ag2_config()

    def _gather_layer_files(
        self, graph_store: GraphStore, repo_path: str
    ) -> tuple[str, list[dict], list[str]]:
        """
        Return (files_content, layer_nodes, unresolved_refs) for this layer.
        files_content: concatenated source code from files belonging to this layer.
        layer_nodes: GraphNode dicts for this layer.
        unresolved_refs: list of token strings that appear in nodes but have no edge.
        """
        all_data = graph_store.to_json()
        layer_nodes = [n for n in all_data["nodes"] if n.get("layer") == self.layer]

        # Collect unique files for this layer
        layer_files: set[str] = {n["file"] for n in layer_nodes if n.get("file")}

        files_content_parts: list[str] = []
        for rel_path in sorted(layer_files):
            abs_path = os.path.join(repo_path, rel_path)
            try:
                content = Path(abs_path).read_text(encoding="utf-8", errors="replace")
                files_content_parts.append(f"--- {rel_path} ---\n{content}")
            except OSError:
                pass

        # Find unresolved tokens: tokens in layer nodes that appear in no edge
        edge_endpoints = set()
        for e in all_data["edges"]:
            edge_endpoints.add(e["from"])
            edge_endpoints.add(e["to"])

        unresolved: list[str] = []
        for n in layer_nodes:
            for tok in n.get("tokens", []):
                # If the token appears in no node id in the graph, it's unresolved
                if not any(tok in nid for nid in edge_endpoints):
                    unresolved.append(f"{n['id']}: token '{tok}'")

        return (
            "\n\n".join(files_content_parts)[:8000],  # truncate to avoid LLM limits
            layer_nodes,
            unresolved[:50],
        )

    def run_sync(self, graph_store: GraphStore, repo_path: str) -> list[dict]:
        """
        Run the CartographerAgent synchronously for this layer.
        Returns a list of validated edge dicts.
        """
        files_content, layer_nodes, unresolved_refs = self._gather_layer_files(
            graph_store, repo_path
        )

        system_msg = _SYSTEM_PROMPT_TEMPLATE.format(
            layer=self.layer,
            files_content=files_content,
            nodes_json=json.dumps(layer_nodes[:30], indent=2),
            unresolved_refs="\n".join(unresolved_refs),
        )

        # Build AG2 AssistantAgent + UserProxy for one round
        assistant = autogen.AssistantAgent(
            name=f"cartographer_{self.layer}",
            llm_config=self._config,
            system_message=system_msg,
        )
        user_proxy = autogen.UserProxyAgent(
            name="user_proxy",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=1,
            code_execution_config=False,
        )

        # Initiate a single-round chat
        user_proxy.initiate_chat(
            assistant,
            message="Find any missing dependency edges for the nodes listed above. Return only JSON.",
            max_turns=1,
        )

        # Extract last assistant message
        last_msg = assistant.last_message()
        raw_text = last_msg.get("content", "") if last_msg else ""

        return self._parse_and_validate(raw_text)

    def _parse_and_validate(self, raw_text: str) -> list[dict]:
        """
        Extract JSON array from LLM response and validate each edge.
        Reject edges without evidence matching the r"\\w+\\.\\w+:\\d+" pattern.
        """
        # Try to extract JSON array from the response
        match = re.search(r"\[.*\]", raw_text, re.DOTALL)
        if not match:
            return []
        try:
            edges = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []

        valid_edges: list[dict] = []
        required_keys = {"from", "to", "type", "rule", "evidence", "confidence"}
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            if not required_keys.issubset(edge.keys()):
                logger.debug("[cartographer] edge missing required keys: %s", edge)
                continue
            evidence = edge.get("evidence", "")
            if not _EVIDENCE_RE.search(str(evidence)):
                logger.debug(
                    "[cartographer] rejecting edge — invalid evidence: %s", evidence
                )
                continue
            # Assign a stable id
            import uuid
            edge.setdefault("id", f"e-{uuid.uuid4().hex[:8]}")
            edge.setdefault("source", "bob")
            valid_edges.append(edge)

        return valid_edges


class CartographerOrchestrator:
    """
    Runs one CartographerAgent per layer in parallel via asyncio.gather.
    """

    def __init__(self, repo_path: str) -> None:
        self.repo_path = repo_path

    async def enrich(
        self,
        graph_store: GraphStore,
        event_emitter: EventEmitter,
    ) -> None:
        """
        Run one CartographerGroupChat per layer in parallel.
        For each layer:
          1. emit agent_started
          2. run CartographerAgent.run_sync() in a thread pool
          3. validate edges
          4. call graph_store.add_edges(valid_edges)
          5. emit done
        """
        loop = asyncio.get_event_loop()

        async def run_layer(layer: str) -> None:
            agent_id = f"cartographer-{layer}"
            event_emitter.emit("agent_started", agent_id=agent_id)
            agent = CartographerAgent(layer)
            try:
                edges = await loop.run_in_executor(
                    None, agent.run_sync, graph_store, self.repo_path
                )
                if edges:
                    graph_store.add_edges(edges)
                    logger.info(
                        "[CartographerOrchestrator] %s added %d edges",
                        layer, len(edges),
                    )
                event_emitter.emit("done", agent_id=agent_id)
            except Exception as exc:  # noqa: BLE001
                logger.error("[CartographerOrchestrator] %s failed: %s", layer, exc)
                event_emitter.emit("done", agent_id=agent_id, detail=str(exc))

        await asyncio.gather(*[run_layer(layer) for layer in LAYERS])
