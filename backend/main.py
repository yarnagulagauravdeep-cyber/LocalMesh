from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.ml.classifier import ReviewClassifier
from backend.routes import router

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
STOREFRONT_DIR = Path(__file__).resolve().parent.parent / "user"
WAREHOUSE_DIR = Path(__file__).resolve().parent.parent / "localwarehouse"
BRAND_CENTER_DIR = Path(__file__).resolve().parent.parent / "brandcenter"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.classifier = ReviewClassifier()
    yield


app = FastAPI(title="LocalMesh Return Routing", lifespan=lifespan)

# The SeasonMart storefront posts return submissions straight to /api/returns.
# It's served from /shop below (same origin), but CORS stays open in case
# someone opens the storefront files directly instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.mount("/shop", StaticFiles(directory=STOREFRONT_DIR, html=True), name="storefront")
app.mount("/warehouse", StaticFiles(directory=WAREHOUSE_DIR, html=True), name="warehouse")
app.mount("/brandcenter", StaticFiles(directory=BRAND_CENTER_DIR, html=True), name="brandcenter")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
