"""Configurable lifespan hook; all work remains durable if a worker stops."""

import asyncio
import logging
import os

from lib import db as database
from lib.mailer import deliver_pending, reconcile_reply_delivery
from lib.privacy import run_retention_sweep
from lib.registration_workflow import reconcile_registrations, queue_registration_notifications

logger = logging.getLogger(__name__)


async def workflow_tick() -> dict:
    reconciled = await reconcile_registrations()
    retention = await run_retention_sweep()
    async for ledger in database.db.workflow_events.find({}):
        await queue_registration_notifications(ledger)
    deliveries = await deliver_pending(int(os.environ.get("MAIL_BATCH_SIZE", "25")))
    await reconcile_reply_delivery()
    return {"reconciled": reconciled, "retention": retention, "delivery": deliveries}


async def run_workflow_worker(stop: asyncio.Event) -> None:
    if os.environ.get("WORKFLOW_WORKER_ENABLED", "1").lower() not in ("1", "true", "yes"):
        return
    interval = max(1, int(os.environ.get("WORKFLOW_WORKER_INTERVAL_SECONDS", "30")))
    while not stop.is_set():
        try:
            await workflow_tick()
        except Exception as exc:
            logger.error("Workflow worker tick failed (%s)", type(exc).__name__)
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
