"""
chroma.py — ChromaDB vector store for semantic search over graph nodes.
Embeds nodes using Gemini embeddings and provides cosine similarity search.
"""
import os
from typing import Optional

import chromadb
from langchain_google_genai import GoogleGenerativeAIEmbeddings

_COLLECTION_NAME = "systemdna_nodes"


class ChromaStore:
    """
    ChromaDB-backed semantic search store for graph nodes.
    Uses GoogleGenerativeAIEmbeddings (Gemini) for embedding.
    """

    def __init__(self, host: str, port: int) -> None:
        """Connect to ChromaDB and get/create the collection."""
        self._client = chromadb.HttpClient(host=host, port=port)
        self._collection = self._client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        self._embedder = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=os.getenv("GEMINI_API_KEY", ""),
        )

    def upsert(self, nodes: list[dict]) -> None:
        """
        For each node, create a summary string:
        "{name} ({type}) in {file} — {layer} layer"
        Embed using GoogleGenerativeAIEmbeddings (Gemini).
        Upsert into collection named "systemdna_nodes".
        """
        if not nodes:
            return

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict] = []

        for n in nodes:
            doc = (
                f"{n.get('name', '')} ({n.get('type', '')}) "
                f"in {n.get('file', '')} — {n.get('layer', '')} layer"
            )
            ids.append(n["id"])
            documents.append(doc)
            metadatas.append({k: str(v) for k, v in n.items() if k != "tokens"})

        # Embed in batches of 100 (Gemini API limit)
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i : i + batch_size]
            batch_docs = documents[i : i + batch_size]
            batch_meta = metadatas[i : i + batch_size]
            embeddings = self._embedder.embed_documents(batch_docs)
            self._collection.upsert(
                ids=batch_ids,
                documents=batch_docs,
                embeddings=embeddings,
                metadatas=batch_meta,
            )

    def search(self, query: str, n: int = 5) -> list[dict]:
        """Cosine similarity search. Return top-n node dicts."""
        query_embedding = self._embedder.embed_query(query)
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=n,
            include=["metadatas", "documents", "distances"],
        )
        nodes: list[dict] = []
        for meta in results.get("metadatas", [[]])[0]:
            nodes.append(dict(meta))
        return nodes
