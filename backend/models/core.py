"""Pydantic models for users, settings, pages, media, registrations, messages,
API keys and audit entries."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from models.content import now_utc


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------- users & auth
class UserDoc(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    name: str
    email: str
    role: str = "contributor"  # super_admin | editor | contributor | registrar | viewer
    divisions: list[str] = []  # media | academics | event — empty = unscoped
    active: bool = True
    password_hash: str = ""
    totp_secret: str | None = None
    totp_enabled: bool = False
    invite_token: str | None = None
    invite_expires_at: datetime | None = None
    created_at: datetime = Field(default_factory=now_utc)
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "contributor"
    divisions: list[str] = []
    password: str | None = None  # when omitted, an invite token is generated


class UserUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    name: str | None = None
    role: str | None = None
    divisions: list[str] | None = None
    active: bool | None = None
    password: str | None = None
    totp_enabled: bool | None = None


class LoginIn(BaseModel):
    email: str
    password: str
    code: str | None = None  # TOTP code when enabled


class InviteAccept(BaseModel):
    token: str
    password: str


# ---------------------------------------------------------------- settings
class FocusArea(BaseModel):
    name: str
    name_id: str | None = None


class ContactInfo(BaseModel):
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    address_id: str | None = None
    room: str = "B-301"
    maps_url: str | None = None


class SocialLinks(BaseModel):
    instagram: str | None = None
    youtube: str | None = None
    linkedin: str | None = None
    github: str | None = None


class SeoDefaults(BaseModel):
    title_template: str = "{title} — Telecommunication Network Laboratory ITS"
    default_description: str | None = None
    og_image_url: str | None = None


class Announcement(BaseModel):
    enabled: bool = False
    title: str | None = None
    title_id: str | None = None
    body: str | None = None
    body_id: str | None = None
    # Call to action. Optional: with no `url` the popup falls back to the events tab,
    # with no labels it falls back to the generic "Register now" button — so every
    # announcement written before these fields existed keeps behaving the same.
    cta_label: str | None = None
    cta_label_id: str | None = None
    url: str | None = None
    # Presentation. "modal" blocks the page (the historical behaviour);
    # "card" floats a non-blocking panel that never intercepts scroll or clicks,
    # for low-urgency notes. Defaulted so every stored document is unchanged.
    style: Literal["modal", "card"] = "modal"
    version: int = 0

    @field_validator("url")
    @classmethod
    def _safe_url(cls, value: str | None) -> str | None:
        """Only a site path or an explicit http(s)/mailto link may be rendered."""
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if value.startswith("//"):
            # Protocol-relative — the browser would treat this as a cross-origin URL.
            raise ValueError("announcement url must be a site path (/) or an http(s)/mailto link")
        if value.startswith("/") or value.startswith(("https://", "http://", "mailto:")):
            return value
        raise ValueError("announcement url must be a site path (/) or an http(s)/mailto link")


class ThemeTokens(BaseModel):
    color_black: str = "#111518"
    color_tan: str = "#a8977b"
    color_tan_text: str = "#7f715c"  # darker tan — small text on light surfaces (AA)
    color_green: str = "#43594A"
    color_green_hover: str = "#35483b"
    color_surface: str = "#f4f4f5"
    color_border: str = "#eaeaec"
    color_body: str = "#3f4245"
    font_heading: str = "Poppins"
    font_body: str = "Poppins"
    radius_card: int = 15
    radius_button: int = 6
    section_spacing: int = 60
    # Semantic GSM tokens for cross-period sustainability
    primary_color: str = "#223027"
    emerald_color: str = "#5D8A6B"
    obsidian_color: str = "#0C100E"
    accent_color: str = "#A8977B"
    accent_hover_color: str = "#C2B091"
    gsm_edition_label: str = "GSM Kabinet Keberlanjutan 2026"


class ThemeState(BaseModel):
    draft: ThemeTokens = Field(default_factory=ThemeTokens)
    published: ThemeTokens = Field(default_factory=ThemeTokens)


class SettingsDoc(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = "settings"
    site_title: str = "Telecommunication Network Laboratory"
    site_title_id: str = "Laboratorium Jaringan Telekomunikasi"
    short_name: str = "TNL"
    logo_url: str | None = None
    logo_url_dark: str | None = None
    its_logo_url: str | None = None
    contact: ContactInfo = Field(default_factory=ContactInfo)
    social: SocialLinks = Field(default_factory=SocialLinks)
    seo: SeoDefaults = Field(default_factory=SeoDefaults)
    focus_areas: list[FocusArea] = []
    language_default: str = "id"  # id | en
    analytics_snippet: str = ""
    maintenance_mode: bool = False
    announcement: Announcement = Field(default_factory=Announcement)
    theme: ThemeState = Field(default_factory=ThemeState)
    theme_tokens: ThemeTokens = Field(default_factory=ThemeTokens)
    retention_days: int = 90  # UU PDP registrant data retention
    updated_at: datetime = Field(default_factory=now_utc)


class SettingsUpdate(BaseModel):
    """Partial settings update — only provided keys are applied."""
    model_config = {"extra": "forbid"}
    site_title: str | None = None
    site_title_id: str | None = None
    short_name: str | None = None
    logo_url: str | None = None
    logo_url_dark: str | None = None
    its_logo_url: str | None = None
    contact: ContactInfo | None = None
    social: SocialLinks | None = None
    seo: SeoDefaults | None = None
    focus_areas: list[FocusArea] | None = None
    language_default: str | None = None
    analytics_snippet: str | None = None
    maintenance_mode: bool | None = None
    announcement: Announcement | None = None
    theme_tokens: ThemeTokens | None = None
    retention_days: int | None = None


# ---------------------------------------------------------------- pages
class PageUpsert(BaseModel):
    model_config = {"extra": "forbid"}
    slug: str
    title: str
    title_id: str | None = None
    status: str = "draft"


class PagePatch(BaseModel):
    model_config = {"extra": "forbid"}
    title: str | None = None
    title_id: str | None = None
    status: str | None = None


class BlockAdd(BaseModel):
    type: str
    props: dict[str, Any] = {}


class BlockPatch(BaseModel):
    props: dict[str, Any] | None = None
    hidden: bool | None = None


class ReorderIn(BaseModel):
    order: list[str]


# ---------------------------------------------------------------- media
class MediaPatch(BaseModel):
    model_config = {"extra": "forbid"}
    alt: str | None = None
    folder: str | None = None


class MediaFromUrl(BaseModel):
    url: str
    alt: str
    folder: str = "general"
    kind: Literal["image", "video"] = "image"


# ---------------------------------------------------------------- registrations
class RegistrationPatch(BaseModel):
    model_config = {"extra": "forbid"}
    status: Literal["pending", "accepted", "rejected", "attended", "waitlisted"] | None = None
    notes: str | None = None


class BulkEmailIn(BaseModel):
    event_id: str
    status_filter: str | None = None
    subject: str
    body: str  # HTML; {name} and {event} are substituted


class CheckinIn(BaseModel):
    code: str


class IssueCertificatesIn(BaseModel):
    event_id: str
    statuses: list[str] = ["attended"]



# ---------------------------------------------------------------- messages
class MessagePatch(BaseModel):
    model_config = {"extra": "forbid"}
    status: Literal["new", "replied", "archived"] | None = None
    reply_body: str | None = None


# ---------------------------------------------------------------- api keys
class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[Literal["read", "write"]] = ["read"]


# ---------------------------------------------------------------- v1 write API
class V1Import(BaseModel):
    items: list[dict[str, Any]]
