"""
doc_understanding.py — WatsonX-backed document enrichment.
Uses LangChain loaders + WatsonX (cheaper for read-only analysis) to extract
entity metadata from PDF and markdown docs and patch graph nodes.
"""
import json
import logging
import re
from pathlib import Path

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader

from agents.llm_config import get_watsonx_langchain
from core.graph import GraphStore

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """Read this documentation excerpt. Extract metadata for any named entities
(tables, columns, API endpoints, fields, models) mentioned.

For each entity found, return a JSON object with:
- node_id: the full id like "db:column:orders.cust_id" (infer from context)
- owner_team: team name if mentioned
- pii: true/false (true if the entity holds personal data)
- criticality: "low", "medium", or "high"
- business_meaning: one sentence description

Return a JSON array. If no entities are found, return [].

Documentation:
{chunk}
"""


class DocUnderstandingAgent:
    """
    Uses WatsonX (cheaper for read-only analysis) via LangChain.
    Reads PDF and markdown docs with LangChain loaders.
    Returns node attribute patches applied to Neo4j via graph_store.patch_nodes().
    """

    def __init__(self) -> None:
        self._llm = get_watsonx_langchain()
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200,
        )

    def enrich(self, graph_store: GraphStore, doc_paths: list[str]) -> None:
        """
        For each doc file:
        1. Load with PyPDFLoader (PDF) or TextLoader (markdown/text)
        2. Split into chunks with RecursiveCharacterTextSplitter
        3. Prompt WatsonX to extract entity metadata
        4. Apply patches to Neo4j nodes via graph_store.patch_nodes(patches)
        """
        all_patches: list[dict] = []

        for doc_path in doc_paths:
            path = Path(doc_path)
            if not path.exists():
                logger.warning("[DocUnderstanding] file not found: %s", doc_path)
                continue

            # Load document
            try:
                if path.suffix.lower() == ".pdf":
                    loader = PyPDFLoader(str(path))
                else:
                    loader = TextLoader(str(path), encoding="utf-8")
                documents = loader.load()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[DocUnderstanding] failed to load %s: %s", doc_path, exc)
                continue

            chunks = self._splitter.split_documents(documents)
            logger.debug("[DocUnderstanding] %s → %d chunks", doc_path, len(chunks))

            for chunk in chunks:
                patches = self._extract_patches(chunk.page_content)
                all_patches.extend(patches)

        if all_patches:
            logger.info(
                "[DocUnderstanding] applying %d node patches", len(all_patches)
            )
            graph_store.patch_nodes(all_patches)

    def _extract_patches(self, chunk_text: str) -> list[dict]:
        """
        Prompt WatsonX with one documentation chunk.
        Parse the JSON array response and return patch dicts.
        """
        prompt = _PROMPT_TEMPLATE.format(chunk=chunk_text[:1800])
        try:
            response = self._llm.invoke(prompt)
            raw_text = response if isinstance(response, str) else str(response)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[DocUnderstanding] LLM call failed: %s", exc)
            return []

        # Extract JSON array from response
        match = re.search(r"\[.*?\]", raw_text, re.DOTALL)
        if not match:
            return []
        try:
            patches = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []

        # Validate and normalise patches
        valid: list[dict] = []
        for p in patches:
            if not isinstance(p, dict) or "node_id" not in p:
                continue
            valid.append(p)
        return valid
