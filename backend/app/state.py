import asyncio
import json
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast_event(self, event_name: str, data: Any):
        payload = json.dumps({"event": event_name, "data": data})
        stale = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                stale.add(connection)
        for s in stale:
            self.active_connections.discard(s)

class AppState:
    def __init__(self):
        self.manager = ConnectionManager()
        self.generation: int = 0
        self.current_media_id: Optional[str] = None
        self.current_model: str = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
        self.current_mode: str = "original"
        self.volume: float = 0.7
        self.is_playing: bool = False
        self.ready_event: asyncio.Event = asyncio.Event()

    def next_generation(self) -> int:
        self.generation += 1
        self.ready_event.clear()
        return self.generation

    async def emit_status(self, state: str, message: str = ""):
        await self.manager.broadcast_event("status", {
            "state": state,
            "message": message
        })

    async def emit_media_info(self, video_url: str, thumbnail: str, title: str):
        await self.manager.broadcast_event("mediaInfo", {
            "videoUrl": video_url,
            "thumbnail": thumbnail,
            "title": title
        })

    async def emit_playback_state(
        self,
        state: str,
        position: float = 0.0,
        message: str = "",
        vocals: Optional[str] = None,
        instrumental: Optional[str] = None,
        media_id: Optional[str] = None
    ):
        payload = {
            "generation": self.generation,
            "state": state,
            "position": position,
            "message": message,
        }
        if vocals:
            payload["vocals"] = vocals
        if instrumental:
            payload["instrumental"] = instrumental
        if media_id:
            payload["media_id"] = media_id
        await self.manager.broadcast_event("playbackState", payload)

state = AppState()
