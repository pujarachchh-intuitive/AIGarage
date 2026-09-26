"""
ConnectionManager — holds all open WebSocket connections and broadcasts events.
Used by POST /events to relay messages to the frontend subscribeEvents() call.
"""
from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts messages to all clients."""

    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept the WebSocket handshake and register the connection."""
        await websocket.accept()
        self.active.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a closed or failed WebSocket connection."""
        self.active.discard(websocket)

    async def broadcast(self, message: str) -> None:
        """Send *message* to all connected clients. Dead connections are removed silently."""
        dead: set[WebSocket] = set()
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.active -= dead
