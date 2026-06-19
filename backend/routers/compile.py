import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from ._utils import _safe_path, get_user_projects_dir
from ..auth import AuthUser, get_current_user

router = APIRouter()

VALID_COMPILERS = {"pdflatex", "xelatex", "lualatex", "latex", "latexmk"}


class CompileRequest(BaseModel):
    project: str
    filename: str  # entry-point .tex file, relative to project root
    compiler: str = "pdflatex"

    @field_validator("compiler")
    @classmethod
    def validate_compiler(cls, v: str) -> str:
        if v not in VALID_COMPILERS:
            raise ValueError(f"compiler must be one of {sorted(VALID_COMPILERS)}")
        return v


class CompileError(BaseModel):
    line: int | None
    message: str


class CompileErrorResponse(BaseModel):
    errors: list[CompileError]
    log: str


def _build_command(compiler: str, outdir: str, src_file: Path) -> list[str]:
    base = [
        "latexmk",
        "-interaction=nonstopmode",
        "-halt-on-error",
        f"-outdir={outdir}",
    ]
    if compiler == "pdflatex":
        return base + ["-pdf", "-pdflatex=pdflatex %O %S", str(src_file)]
    elif compiler == "xelatex":
        return base + ["-pdfxe", str(src_file)]
    elif compiler == "lualatex":
        return base + ["-pdflua", str(src_file)]
    elif compiler == "latex":
        return base + ["-dvi", str(src_file)]
    else:  # "latexmk" auto
        return base + ["-pdf", str(src_file)]


def _parse_log(log_text: str) -> list[CompileError]:
    """Extract error lines from a LaTeX .log file.

    LaTeX error lines begin with '!' followed by the message; the line number
    appears on the next 'l.<n>' continuation line.
    """
    errors: list[CompileError] = []
    lines = log_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("!"):
            message = line[1:].strip()
            lineno: int | None = None
            for j in range(i + 1, min(i + 6, len(lines))):
                if lines[j].startswith("l."):
                    try:
                        lineno = int(lines[j].split()[0][2:])
                    except (ValueError, IndexError):
                        pass
                    break
            errors.append(CompileError(line=lineno, message=message))
        i += 1
    return errors


@router.post("")
async def compile_project(req: CompileRequest, current_user: AuthUser = Depends(get_current_user)):
    """Compile a LaTeX project and return the PDF, or structured errors."""
    user_dir = get_user_projects_dir(current_user.id)
    project_dir = _safe_path(user_dir, req.project)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    entry = _safe_path(user_dir, req.project, req.filename)
    if not entry.exists():
        raise HTTPException(status_code=404, detail="Entry file not found")

    with tempfile.TemporaryDirectory(prefix="texmobile_") as tmpdir:
        tmp_path = Path(tmpdir)

        shutil.copytree(str(project_dir), str(tmp_path / "src"))
        src_dir = tmp_path / "src"

        cmd = _build_command(req.compiler, tmpdir, src_dir / req.filename)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(src_dir),
        )
        _, stderr_bytes = await proc.communicate()
        stderr = stderr_bytes.decode(errors="replace")

        pdf_stem = Path(req.filename).stem
        pdf_path = tmp_path / f"{pdf_stem}.pdf"
        log_path = tmp_path / f"{pdf_stem}.log"

        if req.compiler == "latex" and proc.returncode == 0:
            dvi_path = tmp_path / f"{pdf_stem}.dvi"
            if dvi_path.exists():
                dvi_proc = await asyncio.create_subprocess_exec(
                    "dvipdf", str(dvi_path), str(pdf_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(tmp_path),
                )
                await dvi_proc.communicate()

        try:
            log_text = log_path.read_text(errors="replace")
        except FileNotFoundError:
            log_text = ""

        if proc.returncode != 0 or not pdf_path.exists():
            errors = _parse_log(log_text)
            if not errors:
                errors = [CompileError(line=None, message=stderr or "Unknown compilation error")]
            return CompileErrorResponse(errors=errors, log=log_text)

        output_pdf = project_dir / f"{pdf_stem}.pdf"
        shutil.copy2(str(pdf_path), str(output_pdf))

    return FileResponse(
        path=str(output_pdf),
        media_type="application/pdf",
        filename=f"{pdf_stem}.pdf",
    )


@router.get("/ping")
async def compile_ping():
    return {"message": "compile endpoint ready"}
