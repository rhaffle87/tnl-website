"""Standalone-Mongo seat ledger. Each decision is one versioned document CAS.

Registration rows are recoverable projections; only this ledger allocates seats.
No lease can expire under a stale writer and no Mongo transaction is required.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from lib import db as database

OCCUPIED = {"pending", "accepted", "attended"}
PUBLICATION_TIMEOUT = timedelta(seconds=30)


def _cms_version_query(document: dict) -> dict:
    version = document.get("_cms_version")
    return {"_cms_version": version if version is not None else {"$exists": False}}


def _publication_expired(publication: dict, now: datetime) -> bool:
    deadline = publication.get("expires_at")
    if not isinstance(deadline, datetime):
        return True
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return deadline <= now


async def _finish_event_publication(event: dict) -> None:
    """Only the owner token may settle its ledger constraint or release its fence."""
    db = database.db
    publication = event["_capacity_publication"]
    token = publication["token"]
    for _ in range(100):
        ledger = await event_ledger(event["id"])
        pending = ledger.get("capacity_transition")
        if not pending:
            break  # Another finalizer already settled it. Never rewrite a newer capacity.
        if pending.get("token") != token:
            return
        desired = publication["capacity"]
        if desired and sum(e["status"] in OCCUPIED for e in ledger["entries"]) > desired:
            raise HTTPException(503, "Capacity publication needs operator review.")
        result = await db.workflow_events.update_one({
            "_id": event["id"], "version": ledger["version"], "capacity_transition.token": token,
        }, {"$set": {"capacity": desired}, "$unset": {"capacity_transition": ""}, "$inc": {"version": 1}})
        if result.modified_count:
            break
    else:
        raise HTTPException(503, "Capacity publication is busy; please retry.")
    await db.events.update_one({
        "id": event["id"], "_cms_version": event["_cms_version"],
        "_capacity_publication.token": token, "_capacity_publication.state": "committed",
    }, {"$unset": {"_capacity_publication": ""}, "$inc": {"_cms_version": 1}})


async def recover_event_publication(event_id: str, *, now: datetime | None = None) -> bool:
    """Fence expired writers BEFORE relaxing admission; committed work only rolls forward."""
    db = database.db
    now = now or datetime.now(timezone.utc)
    changed = False
    for _ in range(100):
        # Read the ledger FIRST. If its token no longer owns the subsequent
        # event snapshot, that already-issued token can never become valid again.
        # Reading event first could mistake a newly installed constraint for an orphan.
        ledger = await db.workflow_events.find_one({"_id": event_id})
        pending = (ledger or {}).get("capacity_transition")
        event = await db.events.find_one({"id": event_id})
        publication = (event or {}).get("_capacity_publication")
        if publication and publication.get("state") == "committed":
            await _finish_event_publication(event)
            return True
        if publication and _publication_expired(publication, now):
            fenced = await db.events.update_one({
                "id": event_id, **_cms_version_query(event),
                "_capacity_publication.token": publication["token"], "_capacity_publication.state": "preparing",
            }, {"$unset": {"_capacity_publication": ""}, "$inc": {"_cms_version": 1}})
            if fenced.modified_count:
                changed = True
            continue  # Re-read: a competing CMS commit might have won the fence CAS.
        if pending and (not publication or publication.get("token") != pending.get("token")):
            # The old token cannot pass an event CAS anymore, even if its process resumes.
            removed = await db.workflow_events.update_one({
                "_id": event_id, "version": ledger["version"], "capacity_transition.token": pending["token"],
            }, {"$unset": {"capacity_transition": ""}, "$inc": {"version": 1}})
            changed = changed or bool(removed.modified_count)
            continue
        return changed
    raise HTTPException(503, "Capacity recovery is busy; please retry.")


async def _prepare_event_publication(event_id: str, publication: dict) -> None:
    db = database.db
    for attempt in range(100):
        owner = await db.events.find_one({
            "id": event_id, "_cms_version": publication["version"],
            "_capacity_publication.token": publication["token"], "_capacity_publication.state": "preparing",
        }, {"id": 1})
        if not owner:
            raise HTTPException(409, "This publication expired or the event changed. Reload before publishing.")
        ledger = await event_ledger(event_id)
        pending = ledger.get("capacity_transition")
        if pending:
            if pending.get("token") == publication["token"]:
                return
            await recover_event_publication(event_id)
            continue
        capacity = publication["capacity"]
        if capacity and sum(e["status"] in OCCUPIED for e in ledger["entries"]) > capacity:
            raise HTTPException(409, "Capacity cannot be lower than the number of occupied seats.")
        installed = await db.workflow_events.update_one({
            "_id": event_id, "version": ledger["version"], "capacity_transition": {"$exists": False},
        }, {"$set": {"capacity_transition": publication}, "$inc": {"version": 1}})
        if installed.modified_count:
            return
        await asyncio.sleep(min(attempt * .001, .025))
    raise HTTPException(503, "Capacity publication is busy; please retry.")


async def persist_event_document(current: dict, updated: dict, *, publish: bool = False) -> None:
    """Publish capacity through event fencing and a conservative, ledger-CAS constraint.

    A reservation advances the CMS version. Expiry recovery advances it again before
    dropping the constraint, so a delayed publisher cannot commit after recovery.
    """
    db = database.db
    event_id = current["id"]
    await recover_event_publication(event_id)
    query = {"id": event_id, **_cms_version_query(current), "_capacity_publication": {"$exists": False}}
    if not publish:
        result = await db.events.replace_one(query, updated)
        if not result.matched_count:
            raise HTTPException(409, "This event changed or is being published. Reload before saving.")
        return
    publication = {
        "token": uuid4().hex, "state": "preparing", "capacity": max(0, int(updated.get("capacity") or 0)),
        "version": int(current.get("_cms_version") or 0) + 1,
        "expires_at": datetime.now(timezone.utc) + PUBLICATION_TIMEOUT,
    }
    reserved = await db.events.update_one(query, {"$set": {
        "_capacity_publication": publication, "_cms_version": publication["version"],
    }})
    if not reserved.matched_count:
        raise HTTPException(409, "This event changed or is being published. Reload before publishing.")
    try:
        await _prepare_event_publication(event_id, publication)
        committed = {**updated, "_cms_version": publication["version"] + 1,
                     "_capacity_publication": {**publication, "state": "committed"}}
        result = await db.events.replace_one({
            "id": event_id, "_cms_version": publication["version"],
            "_capacity_publication.token": publication["token"], "_capacity_publication.state": "preparing",
        }, committed)
        if not result.matched_count:
            raise HTTPException(409, "This publication expired or the event changed. Reload before publishing.")
        await _finish_event_publication(committed)
        updated["_cms_version"] = publication["version"] + 2
    except Exception:
        # An uncertain CMS write may already be committed. Abort only an owned
        # preparing token; recovery rolls committed tokens forward, never back.
        await db.events.update_one({
            "id": event_id, "_cms_version": publication["version"],
            "_capacity_publication.token": publication["token"], "_capacity_publication.state": "preparing",
        }, {"$unset": {"_capacity_publication": ""}, "$inc": {"_cms_version": 1}})
        await recover_event_publication(event_id)
        raise


async def event_ledger(event_id: str) -> dict:
    db = database.db
    ledger = await db.workflow_events.find_one({"_id": event_id})
    if ledger:
        return ledger
    event = await db.events.find_one({"id": event_id}) or {}
    rows = await db.registrations.find({"event_id": event_id}).sort([("created_at", 1), ("id", 1)]).to_list(None)
    ledger = {"_id": event_id, "version": 0, "capacity": max(0, int(event.get("capacity") or 0)),
              "entries": [{"id": row["id"], "status": row.get("status", "pending"),
                           "eligible": not (row.get("anonymized") or row.get("privacy_pending"))}
                          for row in rows if row.get("status") != "processing"]}
    if ledger["capacity"] and sum(e["status"] in OCCUPIED for e in ledger["entries"]) > ledger["capacity"]:
        raise HTTPException(503, "Legacy seat allocation exceeds capacity; operator review required.")
    try:
        await db.workflow_events.insert_one(ledger)
    except DuplicateKeyError:
        ledger = await db.workflow_events.find_one({"_id": event_id})
    return ledger


async def sync_ledger(ledger: dict) -> None:
    db = database.db
    for entry in ledger["entries"]:
        await db.registrations.update_one({
            "id": entry["id"], "event_id": ledger["_id"],
            "privacy_pending": {"$ne": True}, "anonymized": {"$ne": True}, "privacy_delete": {"$ne": True},
            "$or": [{"workflow_version": {"$exists": False}}, {"workflow_version": {"$lt": ledger["version"]}}],
        }, {"$set": {"status": entry["status"], "workflow_version": ledger["version"]}})


async def change_registration(event_id: str, reg_id: str | None = None, *, status: str | None = None,
                              add: bool = False, remove: bool = False, eligible: bool | None = None,
                              capacity: int | None = None) -> dict:
    db = database.db
    for attempt in range(100):
        current = await event_ledger(event_id)
        entries = [dict(entry) for entry in current["entries"]]
        cancelled_ids = set(current.get("cancelled_ids") or [])
        cap = current["capacity"] if capacity is None else max(0, capacity)
        event = await db.events.find_one({"id": event_id}, {"capacity": 1, "_capacity_publication": 1})
        publication = (event or {}).get("_capacity_publication")
        transition = current.get("capacity_transition")
        if ((publication and (publication.get("state") == "committed" or _publication_expired(publication, datetime.now(timezone.utc))))
                or (transition and (not publication or transition.get("token") != publication.get("token")))):
            await recover_event_publication(event_id)
            continue
        if capacity is not None and (publication or transition):
            raise HTTPException(409, "Capacity is being published. Retry after publication completes.")
        published_cap = max(0, int((event or {}).get("capacity") or 0))
        # Installing/removing this constraint changes the SAME ledger version
        # used by admission CAS, so an earlier permissive snapshot cannot win.
        pending_cap = int((transition or {}).get("capacity") or 0)
        finite_limits = [value for value in (cap, published_cap, pending_cap) if value > 0]
        admission_cap = min(finite_limits) if finite_limits else 0
        target = next((entry for entry in entries if entry["id"] == reg_id), None)
        if reg_id in cancelled_ids and (add or eligible is True or status in OCCUPIED):
            raise HTTPException(409, "This registration was erased or cancelled and cannot be admitted again.")
        if add:
            from lib.privacy import registration_data_is_servable
            row = await db.registrations.find_one({"id": reg_id, "event_id": event_id})
            if not row or row.get("privacy_delete") or row.get("uploads_ready") is False or not await registration_data_is_servable(row):
                raise HTTPException(409, "This registration is not available for admission.")
        used = sum(e["status"] in OCCUPIED for e in entries)
        if capacity is not None and cap and used > cap:
            raise HTTPException(409, "Capacity cannot be lower than the number of occupied seats.")
        if add and target is None:
            target = {"id": reg_id, "status": "waitlisted", "eligible": True}
            entries.append(target)
        if reg_id is not None and (remove or eligible is False):
            cancelled_ids.add(reg_id)
        if remove:
            entries = [entry for entry in entries if entry["id"] != reg_id]
        elif target is not None:
            if eligible is not None:
                target["eligible"] = eligible
                if eligible is False:
                    target["status"] = "rejected"
            if status:
                if not target.get("eligible", True) and status in OCCUPIED:
                    raise HTTPException(409, "An erased registration cannot be approved or checked in.")
                if status in OCCUPIED and target["status"] not in OCCUPIED and admission_cap and used >= admission_cap:
                    raise HTTPException(409, "No seat is available; keep this registration waitlisted.")
                if status == "waitlisted" and target["status"] != "waitlisted":
                    entries.remove(target)
                    entries.append(target)
                target["status"] = status
        elif reg_id is not None and eligible is not False:
            raise HTTPException(404, "Registration is not in the event workflow.")
        # Array order is the atomic insertion order, not a race-prone timestamp tie.
        used = sum(e["status"] in OCCUPIED for e in entries)
        for entry in entries:
            if (entry["status"] == "waitlisted" and entry.get("eligible", True) and (not admission_cap or used < admission_cap)
                    and not (entry["id"] == reg_id and status == "waitlisted")):
                entry["status"] = "accepted"
                used += 1
        fresh = {**current, "entries": entries, "cancelled_ids": sorted(cancelled_ids), "capacity": cap, "version": current["version"] + 1}
        result = await db.workflow_events.update_one({"_id": event_id, "version": current["version"]},
                                                     {"$set": {k: fresh[k] for k in ("entries", "cancelled_ids", "capacity", "version")}})
        if result.modified_count:
            await sync_ledger(fresh)
            return fresh
        await asyncio.sleep(min(attempt * .001, .025))
    raise HTTPException(503, "Registration workflow is busy; please retry.")


async def set_event_capacity(event_id: str, capacity: int) -> int:
    previous = (await event_ledger(event_id))["capacity"]
    await change_registration(event_id, capacity=capacity)
    return previous


async def reconcile_registrations(limit: int = 100) -> int:
    db = database.db
    count = 0
    now = datetime.now(timezone.utc)
    due_publications = {"$or": [
        {"_capacity_publication.state": "committed"}, {"_capacity_publication.expires_at": {"$lte": now}},
        {"_capacity_publication": {"$exists": True}, "_capacity_publication.expires_at": {"$exists": False}},
    ]}
    async for event in db.events.find(due_publications).sort([("_capacity_publication.expires_at", 1), ("id", 1)]).limit(limit):
        await recover_event_publication(event["id"])
    due_constraints = {"$or": [
        {"capacity_transition.expires_at": {"$lte": now}},
        {"capacity_transition": {"$exists": True}, "capacity_transition.expires_at": {"$exists": False}},
    ]}
    async for ledger in db.workflow_events.find(due_constraints).sort([("capacity_transition.expires_at", 1), ("_id", 1)]).limit(limit):
        await recover_event_publication(ledger["_id"])
    async for row in db.registrations.find({"status": "processing", "uploads_ready": True,
                                           "privacy_pending": {"$ne": True}, "privacy_delete": {"$ne": True},
                                           "anonymized": {"$ne": True}}).limit(limit):
        try:
            await change_registration(row["event_id"], row["id"], add=True)
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
        count += 1
    async for row in db.registrations.find({"status": "processing", "uploads_ready": False,
            "created_at": {"$lt": datetime.now(timezone.utc) - timedelta(minutes=10)}}).limit(limit):
        from lib.privacy import request_erasure
        await request_erasure(row["id"], delete=True)
    async for ledger in db.workflow_events.find({}).sort([("reconciled_at", 1), ("_id", 1)]).limit(limit):
        event = await db.events.find_one({"id": ledger["_id"]}, {"capacity": 1})
        finite = [c for c in (ledger["capacity"], int((event or {}).get("capacity") or 0)) if c > 0]
        cap = min(finite) if finite else 0
        used = sum(e["status"] in OCCUPIED for e in ledger["entries"])
        if (not cap or used < cap) and any(e["status"] == "waitlisted" and e.get("eligible", True) for e in ledger["entries"]):
            await change_registration(ledger["_id"])
        else:
            await sync_ledger(ledger)
        await db.workflow_events.update_one({"_id": ledger["_id"]}, {"$set": {"reconciled_at": datetime.now(timezone.utc)}})
    return count


async def queue_registration_notifications(ledger: dict) -> None:
    from html import escape
    from lib.mailer import send_email
    from lib.privacy import registration_data_is_servable
    db = database.db
    event = await db.events.find_one({"id": ledger["_id"]}) or {}
    for entry in ledger["entries"]:
        row = await db.registrations.find_one({"id": entry["id"], "privacy_pending": {"$ne": True},
                                               "anonymized": {"$ne": True}})
        if (not row or not row.get("email") or entry["status"] not in ("accepted", "waitlisted")
                or row.get("status") != entry["status"] or not entry.get("eligible", True)
                or row.get("privacy_delete") or not await registration_data_is_servable(row)):
            continue
        state = entry["status"]
        # Unique deterministic job ID makes projection/worker retries idempotent.
        job_id = f"registration:{entry['id']}:{state}"
        existing = await db.outbox.find_one({"id": job_id})
        if existing and existing.get("status") != "cancelled":
            continue
        if existing and isinstance(existing.get("expires_at"), datetime):
            expiry = existing["expires_at"]
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry <= datetime.now(timezone.utc):
                continue
        body = f"<p>Your registration for <b>{escape(str(event.get('title', row.get('event_title', ''))))}</b> is {state}.</p>"
        wa = (event.get("whatsapp_group_url") or "").strip()
        if state == "accepted" and wa.startswith("https://"):
            body += f'<p><a href="{escape(wa, quote=True)}">Join the participant WhatsApp group</a></p>'
        await send_email(row["email"], f"Registration {state}: {event.get('title', '')}", body,
                         notification_id=job_id, registration_id=row["id"], expected_status=state,
                         replace_cancelled=bool(existing))
