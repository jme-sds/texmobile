"""Authentication endpoints: login, register, me, logout, demo-info."""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    MULTI_USER_MODE,
    AuthUser,
    create_access_token,
    create_user,
    get_current_user,
    maybe_reset_demo,
    verify_password,
    _find_user_by_email,
)

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Request / response models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    is_demo: bool = False


class MeResponse(BaseModel):
    id: str
    email: str
    is_demo: bool


class DemoInfoResponse(BaseModel):
    available: bool
    demo_email: Optional[str] = None
    demo_password: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = _find_user_by_email(body.email)
    if user is None or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("is_demo"):
        maybe_reset_demo(user)
    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        email=user["email"],
        is_demo=user.get("is_demo", False),
    )


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    if not MULTI_USER_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    if not _EMAIL_RE.match(body.email):
        raise HTTPException(status_code=422, detail="Invalid email address")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    user = create_user(body.email, body.password)
    token = create_access_token(user)
    return TokenResponse(access_token=token, email=user["email"])


@router.get("/me", response_model=MeResponse)
async def me(current_user: AuthUser = Depends(get_current_user)):
    return MeResponse(id=current_user.id, email=current_user.email, is_demo=current_user.is_demo)


@router.post("/logout")
async def logout():
    return {"ok": True}


@router.get("/demo-info", response_model=DemoInfoResponse)
async def demo_info():
    if not MULTI_USER_MODE or not DEMO_EMAIL or not DEMO_PASSWORD:
        return DemoInfoResponse(available=False)
    return DemoInfoResponse(available=True, demo_email=DEMO_EMAIL, demo_password=DEMO_PASSWORD)
