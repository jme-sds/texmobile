import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from ._utils import PROJECTS_DIR

router = APIRouter()

CONFIG_PATH = PROJECTS_DIR / ".llm_config.json"
CONFIG_SECRET = os.environ.get("CONFIG_SECRET", "")

_http_client = httpx.AsyncClient(timeout=60.0)

_bearer = HTTPBearer(auto_error=False)


def _require_config_secret(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> None:
    if not CONFIG_SECRET:
        return
    if not credentials or credentials.credentials != CONFIG_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing CONFIG_SECRET")


# ── Config helpers ────────────────────────────────────────────────────────────

def _read_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {"api_endpoint": "", "api_key": "", "model_name": "", "default_compiler": "pdflatex"}


def _write_config(data: dict) -> None:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(data, indent=2))


# ── Conversation storage helpers ──────────────────────────────────────────────

def _chats_dir(project: str) -> Path:
    return PROJECTS_DIR / project / ".chats"


def _conv_path(project: str, conv_id: str) -> Path:
    return _chats_dir(project) / f"{conv_id}.json"


# ── Comment storage helpers ───────────────────────────────────────────────────

def _comments_path(project: str, filename: str) -> Path:
    safe = filename.replace('/', '_').replace('..', '_')
    d = PROJECTS_DIR / project / ".comments"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{safe}.json"


def _load_comments(project: str, filename: str) -> list[dict]:
    p = _comments_path(project, filename)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except Exception:
        return []


def _save_comments(project: str, filename: str, comments: list[dict]) -> None:
    _comments_path(project, filename).write_text(json.dumps(comments, indent=2))


def _list_conversations(project: str) -> list[dict]:
    d = _chats_dir(project)
    if not d.exists():
        return []
    convs = []
    for f in d.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            convs.append({
                "id": data["id"],
                "title": data["title"],
                "created_at": data["created_at"],
                "updated_at": data["updated_at"],
            })
        except Exception:
            pass
    return sorted(convs, key=lambda c: c["updated_at"], reverse=True)


def _save_conversation(
    project: str,
    conv_id: str,
    title: str,
    messages: list[dict],
    created_at: str,
) -> None:
    d = _chats_dir(project)
    d.mkdir(parents=True, exist_ok=True)
    _conv_path(project, conv_id).write_text(json.dumps({
        "id": conv_id,
        "project": project,
        "title": title,
        "created_at": created_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "messages": messages,
    }, indent=2))


def _generate_title(messages: list) -> str:
    for m in messages:
        if m.role == "user":
            text = m.content.strip()
            if text:
                return text[:50] + ("…" if len(text) > 50 else "")
    return "New conversation"


# ── LLM call helper ──────────────────────────────────────────────────────────

def _get_validated_config() -> tuple[str, str, str]:
    cfg = _read_config()
    api_endpoint = cfg.get("api_endpoint", "").rstrip("/")
    api_key = cfg.get("api_key", "")
    model_name = cfg.get("model_name", "")
    if not api_endpoint or not api_key or not model_name:
        raise HTTPException(
            status_code=400,
            detail="LLM not configured. Open Settings to set API endpoint, key, and model.",
        )
    return api_endpoint, api_key, model_name


async def _call_llm(api_endpoint: str, api_key: str, model_name: str, messages: list[dict]) -> str:
    try:
        resp = await _http_client.post(
            f"{api_endpoint}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model_name, "messages": messages},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Config endpoints ──────────────────────────────────────────────────────────

class ConfigOut(BaseModel):
    api_endpoint: str
    api_key_set: bool
    model_name: str
    default_compiler: str


class ConfigIn(BaseModel):
    api_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    default_compiler: Optional[str] = None


@router.get("/config", response_model=ConfigOut)
async def get_config():
    cfg = _read_config()
    return ConfigOut(
        api_endpoint=cfg.get("api_endpoint", ""),
        api_key_set=bool(cfg.get("api_key", "")),
        model_name=cfg.get("model_name", ""),
        default_compiler=cfg.get("default_compiler", "pdflatex"),
    )


@router.post("/config")
async def save_config(body: ConfigIn, _: None = Depends(_require_config_secret)):
    cfg = _read_config()
    if body.api_endpoint is not None:
        cfg["api_endpoint"] = body.api_endpoint
    if body.api_key is not None and body.api_key != "":
        cfg["api_key"] = body.api_key
    if body.model_name is not None:
        cfg["model_name"] = body.model_name
    if body.default_compiler is not None:
        cfg["default_compiler"] = body.default_compiler
    _write_config(cfg)
    return {"ok": True}


# ── Conversation endpoints ────────────────────────────────────────────────────

@router.get("/conversations/{project}")
async def list_conversations(project: str):
    return _list_conversations(project)


@router.get("/conversations/{project}/{conv_id}")
async def get_conversation(project: str, conv_id: str):
    path = _conv_path(project, conv_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Conversation not found")
    return json.loads(path.read_text())


@router.delete("/conversations/{project}/{conv_id}")
async def delete_conversation(project: str, conv_id: str):
    path = _conv_path(project, conv_id)
    if path.exists():
        path.unlink()
    return {"ok": True}


# ── Chat send endpoint ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    document_context: Optional[str] = None
    project: Optional[str] = None
    conversation_id: Optional[str] = None
    conversation_title: Optional[str] = None
    conversation_created_at: Optional[str] = None


@router.post("/send")
async def chat(body: ChatRequest):
    api_endpoint, api_key, model_name = _get_validated_config()

    llm_messages = []
    if body.document_context:
        llm_messages.append({
            "role": "system",
            "content": (
                "You are a helpful LaTeX assistant. "
                "The user is editing the following document:\n\n"
                f"{body.document_context}"
            ),
        })
    llm_messages.extend({"role": m.role, "content": m.content} for m in body.messages)

    content = await _call_llm(api_endpoint, api_key, model_name, llm_messages)

    # Persist conversation when a project is provided.
    if body.project and body.conversation_id:
        all_messages = [{"role": m.role, "content": m.content} for m in body.messages]
        all_messages.append({"role": "assistant", "content": content})
        title = body.conversation_title or _generate_title(body.messages)
        created_at = body.conversation_created_at or datetime.now(timezone.utc).isoformat()
        _save_conversation(body.project, body.conversation_id, title, all_messages, created_at)

    return {"content": content}


# ── Test connection endpoint ──────────────────────────────────────────────────

@router.post("/test")
async def test_connection():
    api_endpoint, api_key, model_name = _get_validated_config()
    content = await _call_llm(
        api_endpoint, api_key, model_name,
        [{"role": "user", "content": "Reply with exactly one word: ok"}],
    )
    return {"ok": True, "response": content}


# ── Check for errors endpoint ─────────────────────────────────────────────────

class CheckErrorsRequest(BaseModel):
    document: str
    filename: Optional[str] = None


class ErrorSuggestionItem(BaseModel):
    id: str
    description: str
    original: str
    replacement: str


class CheckErrorsResponse(BaseModel):
    suggestions: list[ErrorSuggestionItem]


CHECK_ERRORS_SYSTEM = """You are a LaTeX error-detection engine. Analyze the provided document for errors that would cause compilation to fail or produce incorrect output. Consider ONLY hard errors:

Structural / delimiter errors:
- Missing or mismatched \\begin{}..\\end{} pairs
- Missing \\end{document}
- Unmatched curly braces { } (extra opening or closing brace)
- Unclosed or unmatched square brackets [ ] in optional arguments
- Unmatched \\left / \\right delimiter pairs (e.g. \\left( without \\right))
- Unclosed math mode delimiters ($, $$, \\[..\\], \\(..\\))
- Odd number of unescaped $ signs

Command / syntax errors:
- Missing \\documentclass or \\begin{document}
- Undefined control sequences or malformed commands
- Missing required arguments to commands (e.g. \\frac{}{} with empty or absent args)
- Double superscript or subscript without braces (x^a^b or x_a_b)
- \\newcommand defining an already-defined command (should use \\renewcommand)
- Wrong number of arguments passed to a \\newcommand or \\newenvironment
- \\verb or \\verb* used inside a command argument (fragile context)
- \\# \\$ etc. escape used where literal character was intended and vice versa

Environment misuse errors:
- \\item used outside a list environment (itemize, enumerate, description)
- \\caption used outside a float environment (figure, table)
- \\hline or \\cline used outside a tabular or array environment
- Mismatched column count in tabular (more & separators in a row than columns declared in the format)
- \\multicolumn span exceeding remaining columns

Package / preamble errors:
- Using a command from a package that is not loaded (e.g. \\includegraphics without graphicx)
- Package options that are mutually exclusive or conflict with document class options

Math errors:
- Math-mode-only commands (\\frac, \\sum, \\int, etc.) used outside math mode
- Text-mode commands inside math mode without \\text{}
- Syntax errors inside math environments

Return ONLY a raw JSON object with NO markdown fences, NO explanation text:
{"suggestions":[{"id":"<uuid>","description":"<one sentence>","original":"<exact verbatim substring>","replacement":"<corrected text>"}]}

Rules:
- "original" MUST be an exact character-for-character substring of the document.
- Omit any suggestion where original equals replacement.
- If there are no errors return: {"suggestions":[]}
- Never suggest stylistic changes — only hard compilation errors.
- Keep "original" as short as possible while uniquely identifying the error site.
- Maximum 20 suggestions."""


def _normalize_with_mapping(text: str) -> tuple[str, list[int]]:
    result: list[str] = []
    mapping: list[int] = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            result.append(' ')
            mapping.append(i)
            while i < len(text) and text[i].isspace():
                i += 1
        else:
            result.append(text[i])
            mapping.append(i)
            i += 1
    return ''.join(result), mapping


def resolve_anchor(anchor: str, doc: str) -> str | None:
    """Return the anchor if it is an exact substring of doc, or snap it to the
    actual document text via whitespace-normalized matching. Returns None when
    no match can be found so callers can drop the item."""
    if anchor in doc:
        return anchor
    norm_doc, mapping = _normalize_with_mapping(doc)
    norm_anchor = re.sub(r'\s+', ' ', anchor).strip()
    if not norm_anchor:
        return None
    idx = norm_doc.find(norm_anchor)
    if idx == -1:
        return None
    orig_start = mapping[idx]
    orig_end = mapping[idx + len(norm_anchor) - 1] + 1
    return doc[orig_start:orig_end]


def _parse_suggestions(raw: str, key: str = "suggestions") -> list[dict] | None:
    try:
        return json.loads(raw).get(key, [])
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group()).get(key, [])
        except json.JSONDecodeError:
            pass
    return None


def _build_suggestion_list(parsed: list[dict], document: str) -> list[ErrorSuggestionItem]:
    clean = []
    for item in parsed:
        if not all(k in item for k in ("original", "replacement", "description")):
            continue
        if item["original"] == item["replacement"]:
            continue
        resolved = resolve_anchor(item["original"], document)
        if resolved is None:
            continue
        clean.append(ErrorSuggestionItem(
            id=item.get("id") or str(uuid.uuid4()),
            description=item["description"],
            original=resolved,
            replacement=item["replacement"],
        ))
    return clean


@router.post("/check-errors", response_model=CheckErrorsResponse)
async def check_errors(body: CheckErrorsRequest):
    api_endpoint, api_key, model_name = _get_validated_config()
    user_content = f"Filename: {body.filename or 'untitled.tex'}\n\n{body.document}"
    messages = [
        {"role": "system", "content": CHECK_ERRORS_SYSTEM},
        {"role": "user", "content": user_content},
    ]
    raw = await _call_llm(api_endpoint, api_key, model_name, messages)
    parsed = _parse_suggestions(raw)
    if parsed is None:
        raise HTTPException(
            status_code=422,
            detail={"error": "llm_parse_failure", "raw": raw[:500]},
        )
    return CheckErrorsResponse(suggestions=_build_suggestion_list(parsed, body.document))


# ── Writing assist endpoint ───────────────────────────────────────────────────

class WritingAssistRequest(BaseModel):
    document: str
    instruction: str
    filename: Optional[str] = None


class WritingAssistResponse(BaseModel):
    suggestions: list[ErrorSuggestionItem]


WRITING_ASSIST_SYSTEM = """You are an expert academic and technical writing assistant. Your job is to improve the written content of a LaTeX document according to the user's specific instruction.

Focus areas based on instruction: flow and transitions, logical structure and argument organization, clarity and conciseness, paragraph cohesion, sentence variety, precision of language, and overall readability.

You MUST:
- Follow the user's instruction precisely — only make the type of changes requested
- Preserve ALL LaTeX commands, environments, and math expressions exactly as-is
- Keep changes minimal and targeted — do not rewrite sections not covered by the instruction
- Return ONLY a raw JSON object with NO markdown fences, NO explanation text:
{"suggestions":[{"id":"<uuid>","description":"<one sentence explaining the improvement>","original":"<exact verbatim substring from the document>","replacement":"<improved text>"}]}

Rules:
- "original" MUST be an exact character-for-character substring of the document
- Omit any suggestion where original equals replacement
- If no improvements are needed for the given instruction, return: {"suggestions":[]}
- Never "fix" things outside the scope of the instruction
- Keep "original" as short as possible while uniquely identifying the target passage
- LaTeX commands inside "original" and "replacement" must remain syntactically valid
- Maximum 20 suggestions"""


@router.post("/writing-assist", response_model=WritingAssistResponse)
async def writing_assist(body: WritingAssistRequest):
    api_endpoint, api_key, model_name = _get_validated_config()
    user_content = (
        f"Instruction: {body.instruction}\n\n"
        f"Filename: {body.filename or 'untitled.tex'}\n\n"
        f"{body.document}"
    )
    messages = [
        {"role": "system", "content": WRITING_ASSIST_SYSTEM},
        {"role": "user", "content": user_content},
    ]
    raw = await _call_llm(api_endpoint, api_key, model_name, messages)
    parsed = _parse_suggestions(raw)
    if parsed is None:
        raise HTTPException(
            status_code=422,
            detail={"error": "llm_parse_failure", "raw": raw[:500]},
        )
    return WritingAssistResponse(suggestions=_build_suggestion_list(parsed, body.document))


# ── Comment assist endpoint ───────────────────────────────────────────────────

class DocumentCommentItem(BaseModel):
    id: str
    description: str
    anchored_text: str
    instruction: str
    status: str = "active"
    created_at: str


class CommentAssistRequest(BaseModel):
    document: str
    instruction: str
    filename: Optional[str] = None
    project: Optional[str] = None


class CommentAssistResponse(BaseModel):
    comments: list[DocumentCommentItem]


class UpdateCommentRequest(BaseModel):
    status: str


COMMENT_ASSIST_SYSTEM = """You are an expert academic writing reviewer. Provide targeted, actionable inline comments on specific passages based on the user's instruction. Do NOT suggest replacement text — write analytical reviewer comments only.

Return ONLY a raw JSON object with NO markdown fences:
{"comments":[{"id":"<uuid>","description":"<actionable comment>","anchoredText":"<exact verbatim substring>"}]}

Rules:
- "anchoredText" MUST be an exact character-for-character substring of the document
- Keep "anchoredText" as short as possible while uniquely identifying the passage
- Maximum 20 comments
- If no comments needed, return: {"comments":[]}"""


@router.get("/comments/{project}/{filename}")
async def list_comments(project: str, filename: str):
    return _load_comments(project, filename)


@router.post("/comment-assist", response_model=CommentAssistResponse)
async def comment_assist(body: CommentAssistRequest):
    api_endpoint, api_key, model_name = _get_validated_config()
    user_content = (
        f"Instruction: {body.instruction}\n\n"
        f"Filename: {body.filename or 'untitled.tex'}\n\n"
        f"{body.document}"
    )
    messages = [
        {"role": "system", "content": COMMENT_ASSIST_SYSTEM},
        {"role": "user", "content": user_content},
    ]
    raw = await _call_llm(api_endpoint, api_key, model_name, messages)
    raw_comments = _parse_suggestions(raw, "comments")
    if raw_comments is None:
        raise HTTPException(status_code=422, detail={"error": "llm_parse_failure", "raw": raw[:500]})
    now = datetime.now(timezone.utc).isoformat()
    clean = []
    for item in raw_comments:
        if not all(k in item for k in ("anchoredText", "description")):
            continue
        resolved = resolve_anchor(item["anchoredText"], body.document)
        if resolved is None:
            continue
        c = DocumentCommentItem(
            id=item.get("id") or str(uuid.uuid4()),
            description=item["description"],
            anchored_text=resolved,
            instruction=body.instruction,
            status="active",
            created_at=now,
        )
        clean.append(c)
    if body.project and body.filename:
        existing = _load_comments(body.project, body.filename)
        new_texts = {c.anchored_text for c in clean}
        existing = [e for e in existing if e.get("anchored_text") not in new_texts]
        existing.extend([c.model_dump() for c in clean])
        _save_comments(body.project, body.filename, existing)
    return CommentAssistResponse(comments=clean)


@router.patch("/comments/{project}/{filename}/{comment_id}")
async def update_comment(project: str, filename: str, comment_id: str, body: UpdateCommentRequest):
    comments = _load_comments(project, filename)
    for c in comments:
        if c["id"] == comment_id:
            c["status"] = body.status
            break
    _save_comments(project, filename, comments)
    return {"ok": True}


@router.delete("/comments/{project}/{filename}/{comment_id}")
async def delete_comment_endpoint(project: str, filename: str, comment_id: str):
    comments = [c for c in _load_comments(project, filename) if c["id"] != comment_id]
    _save_comments(project, filename, comments)
    return {"ok": True}
