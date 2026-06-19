import os
from pathlib import Path

from fastapi import HTTPException

PROJECTS_DIR = Path(os.environ.get("PROJECTS_DIR", "/app/projects"))


def get_user_projects_dir(user_id: str) -> Path:
    """Return the projects root for this user.

    Single-user mode (user_id == 'local'): returns PROJECTS_DIR unchanged.
    Multi-user mode: returns PROJECTS_DIR / user_id, creating it if needed.
    """
    if user_id == "local":
        return PROJECTS_DIR
    p = PROJECTS_DIR / user_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_path(base_dir: Path, project: str, *parts: str) -> Path:
    """Resolve a path and abort if it escapes base_dir."""
    base = base_dir / project
    target = (base / Path(*parts)).resolve() if parts else base.resolve()
    allowed = str(base_dir.resolve()) + os.sep
    if not (str(target) + os.sep).startswith(allowed):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return target
