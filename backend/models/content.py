"""Pydantic v2 models for lab content resources. Every TS interface in
frontend/src/lib/types.ts mirrors these — keep the two in sync in the same edit.

Dates are ISO strings (YYYY-MM-DD) for event/publication dates; created_at/updated_at
are aware UTC datetimes so JavaScript `new Date(...)` parses them correctly.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class MemberSocial(BaseModel):
    scholar: str | None = None
    sinta: str | None = None
    scopus: str | None = None
    instagram: str | None = None
    linkedin: str | None = None
    github: str | None = None
    cv_url: str | None = None


class Member(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    name: str
    title_prefix: str | None = None  # Dr., Prof., Dr.techn.
    role: str = "assistant"  # lecturer | researcher | assistant
    position: str | None = None  # coordinator | head | vice | staff | member
    division: str | None = None
    batch: str | None = None  # e.g. 2025/2026
    bio: str | None = None
    bio_id: str | None = None
    email_public: str | None = None
    email_personal: str | None = None  # private
    phone: str | None = None  # private
    nim: str | None = None  # private
    show_nim: bool = False
    show_personal_email: bool = False
    photo_url: str | None = None
    photo_alt: str | None = None
    expertise: list[str] = []
    social: MemberSocial = Field(default_factory=MemberSocial)
    is_head: bool = False
    quote: str | None = None
    quote_id: str | None = None
    status: str = "active"  # active | alumni
    order: int = 0
    published: bool = True
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class PostSEO(BaseModel):
    title: str | None = None
    description: str | None = None
    og_image_url: str | None = None


class Post(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    title: str
    title_id: str | None = None
    slug: str | None = None
    excerpt: str | None = None
    excerpt_id: str | None = None
    body: str = ""  # sanitized HTML
    body_id: str = ""
    category: str = "Announcement"
    tags: list[str] = []
    cover_url: str | None = None
    cover_alt: str | None = None
    author: str | None = None
    status: str = "draft"  # draft | published
    published_at: datetime | None = None
    seo: PostSEO = Field(default_factory=PostSEO)
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class EventModule(BaseModel):
    title: str
    detail: str | None = None
    date: str | None = None


class EventContact(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None


class FormField(BaseModel):
    type: str = "text"  # text | email | tel | nim | select | checkbox | textarea | file
    label: str
    required: bool = False
    options: list[str] = []
    show_if_field: str | None = None  # label of the controlling field
    show_if_value: str | None = None


class MediaItem(BaseModel):
    url: str
    alt: str = ""


class Event(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    title: str
    title_id: str | None = None
    slug: str | None = None
    type: str = "training"  # training | recruitment | workshop | practicum | social
    description: str = ""
    description_id: str = ""
    poster_urls: list[str] = []
    documentation: list[MediaItem] = []
    start_date: str | None = None  # YYYY-MM-DD
    end_date: str | None = None
    reg_open_date: str | None = None
    reg_close_date: str | None = None
    capacity: int = 0  # 0 = unlimited
    price: int = 0  # IDR, 0 = free
    location: str | None = None
    modules: list[EventModule] = []
    contacts: list[EventContact] = []
    form_fields: list[FormField] = []
    status: str = "draft"  # draft | published
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Activity(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    title: str
    title_id: str | None = None
    category: str = "internal"  # social | internal | academic
    description: str = ""
    description_id: str = ""
    date: str | None = None
    images: list[MediaItem] = []
    order: int = 0
    published: bool = True
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Project(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    kind: str = "rd"  # rd (R&D project) | social (community project)
    title: str
    title_id: str | None = None
    year: str | None = None
    location: str | None = None
    participants: str | None = None
    focus: str | None = None  # focus technology
    description: str = ""
    description_id: str = ""
    background: str = ""
    modules: list[EventModule] = []
    impact: list[EventModule] = []
    images: list[MediaItem] = []
    cluster: str | None = None
    tags: list[str] = []
    is_testbed: bool = False
    status: str = "draft"
    verified: bool = False
    verified_by: str | None = None
    verified_date: str | None = None
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Publication(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    title: str
    authors: str | None = None
    venue: str | None = None
    year: int | None = None
    ptype: str = "journal"  # journal | conference | book | other
    url: str | None = None
    doi: str | None = None
    abstract: str = ""
    tags: list[str] = []
    linked_member_ids: list[str] = []
    status: str = "draft"
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Partner(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    name: str
    url: str | None = None
    logo_url: str | None = None
    order: int = 0
    published: bool = True
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class PracticumResource(BaseModel):
    id: str = Field(default_factory=_uuid)
    title: str
    file_url: str
    file_type: str = "pdf"  # pdf | pkt | py | zip | docx | other
    size_bytes: int | None = None
    updated_at: datetime = Field(default_factory=now_utc)


class PracticumShift(BaseModel):
    id: str = Field(default_factory=_uuid)
    day: str  # Senin, Selasa, Rabu, Kamis, Jumat
    time_slot: str  # e.g. 08:00 - 10:00 WIB
    coordinator_name: str
    quota: int = 20
    room: str = "Ruang B-301"
    notes: str | None = None


class PracticumModule(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    code: str | None = None
    name: str
    name_id: str | None = None
    description: str = ""
    description_id: str = ""
    semester: str | None = None
    resources: list[PracticumResource] = []
    shifts: list[PracticumShift] = []
    order: int = 0
    published: bool = True
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Equipment(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    name: str
    name_id: str | None = None
    category: str = "server"  # server | sdr | networking | optical | test_tool | other
    specs: str = ""
    specs_id: str | None = None
    photo_url: str | None = None
    photo_alt: str | None = None
    quantity: int = 1
    location: str = "Ruang B-301"
    status: str = "available"  # available | in_use | maintenance
    # Internal inventory fields (stripped from public responses)
    serial_number: str | None = None
    asset_code: str | None = None
    internal_notes: str | None = None
    order: int = 0
    published: bool = True
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class BlockModel(BaseModel):
    id: str = Field(default_factory=_uuid)
    type: str
    props: dict[str, Any] = {}
    hidden: bool = False


class PageRevision(BaseModel):
    id: str = Field(default_factory=_uuid)
    saved_at: datetime = Field(default_factory=now_utc)
    saved_by: str = ""
    title: str = ""
    blocks: list[dict] = []


class PageDoc(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(default_factory=_uuid)
    slug: str
    title: str
    title_id: str | None = None
    blocks: list[BlockModel] = []
    status: str = "draft"  # draft | published
    is_system: bool = False
    revisions: list[PageRevision] = []
    needs_review: bool = False
    issues: list[dict] = []
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


CONTENT_MODELS: dict[str, type[BaseModel]] = {
    "posts": Post,
    "members": Member,
    "events": Event,
    "activities": Activity,
    "projects": Project,
    "publications": Publication,
    "partners": Partner,
    "practicum": PracticumModule,
    "equipment": Equipment,
}

TITLE_FIELD: dict[str, str] = {
    "posts": "title", "members": "name", "events": "title", "activities": "title",
    "projects": "title", "publications": "title", "partners": "name", "practicum": "name",
    "equipment": "name",
}
