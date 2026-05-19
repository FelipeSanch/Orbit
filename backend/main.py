import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.activity import router as activity_router
from api.routes.approve import router as approve_router
from api.routes.chat import router as chat_router
from api.routes.conversations import router as conversations_router
from api.routes.google_oauth import router as google_oauth_router
from api.routes.memories import router as memories_router
from api.routes.oauth import router as oauth_router
from api.routes.sms import router as sms_router
from api.routes.usage import router as usage_router
from config import settings
from services.database import close_pool, init_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logging.getLogger("api").setLevel(logging.DEBUG)
logging.getLogger("services").setLevel(logging.DEBUG)
logging.getLogger("tools").setLevel(logging.DEBUG)

# Export API key so Agno's Claude model can find it
if settings.anthropic_api_key:
    os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_pool(settings.database_url)
    yield
    await close_pool()


app = FastAPI(title="Orbit", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oauth_router)
app.include_router(google_oauth_router)
app.include_router(chat_router)
app.include_router(approve_router)
app.include_router(conversations_router)
app.include_router(activity_router)
app.include_router(usage_router)
app.include_router(memories_router)
app.include_router(sms_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
