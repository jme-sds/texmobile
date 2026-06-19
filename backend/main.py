import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import compile, files, chat
from .routers import auth as auth_router

app = FastAPI(title="Texmobile API", version="0.1.0")

_cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:4444")
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(compile.router, prefix="/api/compile", tags=["compile"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

MULTI_USER_MODE: bool = os.environ.get("MULTI_USER_MODE", "false").lower() in ("1", "true", "yes")


@app.on_event("startup")
async def startup():
    if MULTI_USER_MODE:
        from .auth import ensure_demo_user
        ensure_demo_user()


@app.get("/health")
async def health():
    """Liveness probe for Docker healthcheck and load balancers."""
    return {"status": "ok"}


@app.get("/api/info")
async def info():
    """Returns runtime environment details — useful for debugging."""
    import subprocess
    try:
        latexmk_ver = subprocess.check_output(
            ["latexmk", "--version"], stderr=subprocess.STDOUT, text=True
        ).splitlines()[0]
    except Exception as exc:
        latexmk_ver = f"unavailable: {exc}"

    return {
        "projects_dir": os.environ.get("PROJECTS_DIR", "/app/projects"),
        "latexmk": latexmk_ver,
        "multi_user_mode": MULTI_USER_MODE,
    }
