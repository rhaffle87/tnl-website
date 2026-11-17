"""Singleton settings record — the single source of truth for site identity,
contact details, social links, SEO defaults, language defaults, analytics,
maintenance mode, announcement popup and the theme tokens."""

from lib.db import db
from models.core import SettingsDoc


async def get_settings() -> dict:
    await db.settings.update_one(
        {"id": "settings"},
        {"$setOnInsert": SettingsDoc().model_dump()},
        upsert=True,
    )
    doc = await db.settings.find_one({"id": "settings"})
    return doc or {}
