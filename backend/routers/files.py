"""File & project management routes.

All paths are relative to PROJECTS_DIR and are validated to prevent traversal.
"""

import io
import json
import mimetypes
import shutil
import zipfile
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ._utils import PROJECTS_DIR, _safe_path

router = APIRouter()


# ── Projects ────────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects():
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return [
        d.name for d in sorted(PROJECTS_DIR.iterdir())
        if d.is_dir() and not d.name.startswith(".")
    ]


class ProjectCreate(BaseModel):
    name: str


@router.post("/projects")
async def create_project(body: ProjectCreate):
    target = _safe_path(body.name)
    if target.exists():
        raise HTTPException(status_code=409, detail="Project already exists")
    target.mkdir(parents=True)
    # Seed with a minimal main.tex so the user can compile immediately.
    (target / "main.tex").write_text(
        r"""\documentclass{article}
\begin{document}

Hello from Texmobile!

\end{document}
""",
        encoding="utf-8",
    )
    return {"project": body.name}


@router.delete("/projects/{project}")
async def delete_project(project: str):
    target = _safe_path(project)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    shutil.rmtree(str(target))
    return {"deleted": project}


# ── Files within a project ───────────────────────────────────────────────────

@router.get("/projects/{project}/files")
async def list_files(project: str):
    project_dir = _safe_path(project)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    def _entry(p: Path):
        return {
            "name": p.name,
            "path": str(p.relative_to(project_dir)),
            "type": "directory" if p.is_dir() else "file",
            "size": p.stat().st_size if p.is_file() else None,
        }

    items = []
    for p in sorted(project_dir.rglob("*")):
        if any(part.startswith(".") for part in p.parts[len(project_dir.parts):]):
            continue
        items.append(_entry(p))
    return items


class FileCreate(BaseModel):
    name: str
    content: str = ""


@router.post("/projects/{project}/files")
async def create_file(project: str, body: FileCreate):
    target = _safe_path(project, body.name)
    if target.exists():
        raise HTTPException(status_code=409, detail="File already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body.content, encoding="utf-8")
    return {"file": body.name}


class DirectoryCreate(BaseModel):
    name: str


@router.post("/projects/{project}/directories")
async def create_directory(project: str, body: DirectoryCreate):
    target = _safe_path(project, body.name)
    if target.exists():
        raise HTTPException(status_code=409, detail="Directory already exists")
    target.mkdir(parents=True)
    return {"directory": body.name}


@router.get("/projects/{project}/files/{filename:path}")
async def read_file(project: str, filename: str):
    target = _safe_path(project, filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    content = target.read_text(encoding="utf-8", errors="replace")
    return {"filename": filename, "content": content}


@router.get("/projects/{project}/raw/{filename:path}")
async def serve_raw_file(project: str, filename: str):
    """Serve a file as raw bytes with the correct content-type (e.g. for PDF viewing)."""
    target = _safe_path(project, filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    mime, _ = mimetypes.guess_type(str(target))
    return FileResponse(str(target), media_type=mime or "application/octet-stream")


class FileUpdate(BaseModel):
    content: str


@router.put("/projects/{project}/files/{filename:path}")
async def update_file(project: str, filename: str, body: FileUpdate):
    target = _safe_path(project, filename)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    target.write_text(body.content, encoding="utf-8")
    return {"filename": filename}


@router.delete("/projects/{project}/files/{filename:path}")
async def delete_file(project: str, filename: str):
    target = _safe_path(project, filename)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if target.is_dir():
        shutil.rmtree(str(target))
    else:
        target.unlink()
    return {"deleted": filename}


@router.post("/projects/upload-zip")
async def upload_zip(
    file: Annotated[UploadFile, File()],
    overwrite: bool = Query(False),
):
    data = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")

    all_names = zf.namelist()
    top_level = {n.split("/")[0] for n in all_names if n.split("/")[0]}
    single_root = len(top_level) == 1
    root_dir = next(iter(top_level)) if single_root else None

    zip_stem = Path(file.filename or "project").stem
    project_name = root_dir if single_root else zip_stem

    project_dir = _safe_path(project_name)
    if project_dir.exists() and not overwrite:
        raise HTTPException(status_code=409, detail="Project already exists")
    project_dir.mkdir(parents=True, exist_ok=True)

    extracted = 0
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = Path(info.filename).parts
        if any(p.startswith(".") or p in ("__MACOSX", "Thumbs.db") for p in parts):
            continue
        rel = list(parts[1:] if (single_root and parts[0] == root_dir) else parts)
        if not rel:
            continue
        target = _safe_path(project_name, *rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(zf.read(info.filename))
        extracted += 1

    return {"project": project_name, "extracted": extracted}


class ProjectConfig(BaseModel):
    compiler: str = "pdflatex"


@router.get("/projects/{project}/config")
async def get_project_config(project: str):
    project_dir = _safe_path(project)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    config_path = project_dir / ".texmobile.json"
    if not config_path.exists():
        return {"compiler": "pdflatex"}
    try:
        return json.loads(config_path.read_text())
    except Exception:
        return {"compiler": "pdflatex"}


@router.post("/projects/{project}/config")
async def save_project_config(project: str, body: ProjectConfig):
    project_dir = _safe_path(project)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    config_path = project_dir / ".texmobile.json"
    config_path.write_text(json.dumps({"compiler": body.compiler}, indent=2))
    return {"ok": True}


@router.post("/projects/{project}/upload")
async def upload_file(
    project: str,
    file: Annotated[UploadFile, File()],
    subpath: Annotated[str, Form()] = "",
):
    filename = file.filename or "upload"
    target = _safe_path(project, subpath, filename) if subpath else _safe_path(project, filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(str(target), "wb") as f:
        while chunk := await file.read(1024 * 256):
            await f.write(chunk)
    return {"uploaded": filename, "size": target.stat().st_size}
