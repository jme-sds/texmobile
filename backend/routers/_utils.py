import os
from pathlib import Path

from fastapi import HTTPException

PROJECTS_DIR = Path(os.environ.get("PROJECTS_DIR", "/app/projects"))


def _safe_path(project: str, *parts: str) -> Path:
    """Resolve a path and abort if it escapes PROJECTS_DIR."""
    base = PROJECTS_DIR / project
    target = (base / Path(*parts)).resolve() if parts else base.resolve()
    if not str(target).startswith(str(PROJECTS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return target
