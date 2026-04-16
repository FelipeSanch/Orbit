from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.activity import router as activity_router
from api.routes.approve import router as approve_router
from api.routes.chat import router as chat_router
from api.routes.conversations import router as conversations_router
from api.routes.oauth import router as oauth_router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    yield
    # Shutdown


app = FastAPI(title="Orbit", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oauth_router)
app.include_router(chat_router)
app.include_router(approve_router)
app.include_router(conversations_router)
app.include_router(activity_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
