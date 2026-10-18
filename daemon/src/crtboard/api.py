"""The REST and server-sent-event API crtboard-web talks to (docs/System.md)."""

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .store import COLUMN_KINDS, Store
from .summary import Poller

SUM_INTERVAL_S = 2

CORS_HEADERS = [
    (b"access-control-allow-origin", b"*"),
    (b"access-control-allow-methods", b"GET, POST, PUT, DELETE, OPTIONS"),
    (b"access-control-allow-headers", b"Content-Type"),
    # Lets the GitHub Pages copy of crtboard-web reach this local server in Chrome.
    (b"access-control-allow-private-network", b"true"),
]


class CorsMiddleware:
    """Allows any origin and answers preflights, including Private Network Access ones."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["method"] == "OPTIONS":
            await send({"type": "http.response.start", "status": 204, "headers": CORS_HEADERS})
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message.get("headers", []), *CORS_HEADERS]}
            await send(message)

        await self.app(scope, receive, send_with_cors)


class TrackedRepo(BaseModel):
    name: str


class TrackedBoard(BaseModel):
    name: str
    columns: dict[str, str | None] = {}

    def known_columns(self) -> dict[str, str | None]:
        return {kind: self.columns.get(kind) for kind in COLUMN_KINDS}


def create_app(
    poller: Poller, store: Store, *, sum_interval: float = SUM_INTERVAL_S, max_sums: int | None = None
) -> CorsMiddleware:
    """The ASGI app. `max_sums` ends each event stream after that many sums; tests use it."""

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI):
        task = asyncio.create_task(poller.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        if poller.asana:
            await poller.asana.close()

    app = FastAPI(title="crtboardd", lifespan=lifespan)

    @app.get("/resources/available")
    async def available():
        # Before the first load the boards would look empty and the web app
        # would forget the user's board, so wait for it.
        await poller.wait_ready()
        return poller.available()

    @app.post("/resources/git/tracked", status_code=201)
    async def track_repo(body: TrackedRepo):
        id = store.track_repo(body.name)
        poller.tracked_changed()
        return {"id": id}

    @app.put("/resources/git/tracked/{id}")
    async def update_repo(id: str, body: TrackedRepo):
        if not store.update_repo(id, body.name):
            raise HTTPException(404, "not tracked")
        poller.tracked_changed()
        return {"id": id}

    @app.delete("/resources/git/tracked/{id}", status_code=204)
    async def untrack_repo(id: str):
        store.untrack_repo(id)
        return Response(status_code=204)

    @app.post("/resources/asana/tracked", status_code=201)
    async def track_board(body: TrackedBoard):
        id = store.track_board(body.name, body.known_columns())
        poller.tracked_changed()
        return {"id": id}

    @app.put("/resources/asana/tracked/{id}")
    async def update_board(id: str, body: TrackedBoard):
        if not store.update_board(id, body.name, body.known_columns()):
            raise HTTPException(404, "not tracked")
        poller.tracked_changed()
        return {"id": id}

    @app.delete("/resources/asana/tracked/{id}", status_code=204)
    async def untrack_board(id: str):
        store.untrack_board(id)
        return Response(status_code=204)

    @app.get("/events")
    async def events(request: Request):
        async def stream() -> AsyncIterator[str]:
            sent = 0
            while max_sums is None or sent < max_sums:
                if await request.is_disconnected():
                    return
                yield f"event: CRTBOARD_EVENT_SUM\ndata: {json.dumps(poller.summary())}\n\n"
                sent += 1
                await asyncio.sleep(sum_interval)

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)

    return CorsMiddleware(app)
