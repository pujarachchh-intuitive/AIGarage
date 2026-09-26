"""
server/store.py — In-memory event + change store backed by aiosqlite for persistence.
"""
import json
import os
from pathlib import Path

import aiosqlite

_DB_PATH = os.getenv("STORE_DB_PATH", "/tmp/systemdna_store.db")


class EventStore:
    """
    Persists RunEvents and Change objects.
    Uses aiosqlite for async, file-backed storage.
    """

    def __init__(self, db_path: str = _DB_PATH) -> None:
        self._db_path = db_path

    async def _conn(self) -> aiosqlite.Connection:
        """Open (or create) the SQLite database and ensure tables exist."""
        conn = await aiosqlite.connect(self._db_path)
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS events "
            "(id INTEGER PRIMARY KEY, change_id TEXT, data TEXT)"
        )
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS changes "
            "(id TEXT PRIMARY KEY, data TEXT)"
        )
        await conn.commit()
        return conn

    async def save_event(self, event: dict) -> None:
        """Persist a RunEvent dict."""
        conn = await self._conn()
        await conn.execute(
            "INSERT INTO events (change_id, data) VALUES (?, ?)",
            (event.get("change_id", ""), json.dumps(event)),
        )
        await conn.commit()
        await conn.close()

    async def get_events(self, change_id: str) -> list[dict]:
        """Return all events for a change_id, ordered by insertion."""
        conn = await self._conn()
        rows = await conn.execute_fetchall(
            "SELECT data FROM events WHERE change_id=? ORDER BY id",
            (change_id,),
        )
        await conn.close()
        return [json.loads(row[0]) for row in rows]

    async def save_change(self, change: dict) -> None:
        """Persist a Change dict (upsert by id)."""
        conn = await self._conn()
        await conn.execute(
            "INSERT OR REPLACE INTO changes (id, data) VALUES (?, ?)",
            (change["id"], json.dumps(change)),
        )
        await conn.commit()
        await conn.close()

    async def get_change(self, change_id: str) -> dict:
        """Return a Change dict by id. Returns {} if not found."""
        conn = await self._conn()
        rows = await conn.execute_fetchall(
            "SELECT data FROM changes WHERE id=?", (change_id,)
        )
        await conn.close()
        return json.loads(rows[0][0]) if rows else {}

    async def list_changes(self) -> list[dict]:
        """Return all Change dicts."""
        conn = await self._conn()
        rows = await conn.execute_fetchall("SELECT data FROM changes ORDER BY rowid DESC")
        await conn.close()
        return [json.loads(row[0]) for row in rows]
