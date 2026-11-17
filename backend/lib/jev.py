"""Jev (TypeSafe) fast typed decisions.

Three uses in TNL Studio:
  • review_draft()      — smarter publish checks beyond the rule-based gates
  • triage_message()    — contact inbox category + urgency + spam flag
  • score_registration()— registrant fit score + junk flag for the Registrar

Every helper fails SOFT: Jev being busy must never block a save, a contact form
or a registration. Failures return `ai_ok: False` so a fallback never reads as a
real answer.
"""

import logging
import os
from functools import lru_cache

from dotenv import load_dotenv
from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, RetryPolicy, Score, TypeSafeAPIError, TypeSafeError

load_dotenv()
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_jev_client() -> AsyncTypeSafeClient:
    proxy = (
        os.getenv("INTEGRATION_PROXY_URL")
        or os.getenv("integration_proxy_url")
        or "https://integrations.emergentagent.com"
    ).rstrip("/")
    return AsyncTypeSafeClient(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        base_url=f"{proxy}/llm/typesafe",
        retry=RetryPolicy(max_retries=2, respect_retry_after=False),
    )


def jev_error_code(exc: TypeSafeAPIError) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        code = (err.get("type") if isinstance(err, dict) else None) or body.get("code") or body.get("error_type") or str(err or "")
    else:
        code = str(body or exc).strip()
    known = {"CAPACITY_LIMIT", "USER_CONCURRENCY_LIMIT", "CONCURRENCY_REQUEST_LIMIT", "budget_exceeded"}
    return "RATE_LIMITED" if exc.status == 429 and code not in known else code


def jev_enabled() -> bool:
    return bool(os.environ.get("EMERGENT_LLM_KEY"))


async def _ask(state, questions) -> dict | None:
    if not jev_enabled():
        return None
    try:
        return await get_jev_client().system_one(model="jev-latest", state=state, questions=questions)
    except TypeSafeAPIError as exc:
        logger.warning("jev api error %s: %s", exc.status, jev_error_code(exc))
    except TypeSafeError as exc:
        logger.warning("jev unavailable: %s", exc)
    except Exception as exc:  # noqa: BLE001 — a decision helper must never break the request
        logger.warning("jev unexpected: %s", exc)
    return None


def _levels(answer) -> tuple[int, str]:
    level = max(answer.probabilities, key=answer.probabilities.get)
    label = answer.legend.get(level, str(level)) if isinstance(answer.legend, dict) else str(level)
    return int(level), str(label)


# ---------------------------------------------------------------- 1. smarter publish checks
CONTENT_LEVELS = ["placeholder or filler", "very thin", "acceptable", "detailed and specific"]


async def review_draft(resource: str, text: str) -> dict:
    """Judge whether a draft reads as real lab content. Adds `ai_issues` to the review queue."""
    snippet = (text or "").strip()[:3000]
    if len(snippet) < 15:
        return {"ai_ok": False}
    resp = await _ask(
        {"content_type": resource, "text": snippet},
        {
            "substance": Score(
                instructions=(
                    "This is website text for a university telecommunication-networks laboratory. "
                    "How substantial and publication-ready is it?"
                ),
                criteria=CONTENT_LEVELS,
            ),
            "is_placeholder": Noul(
                instructions=(
                    "Is this placeholder, sample, dummy, or copy-pasted filler text rather than genuine "
                    "content written about this laboratory?"
                )
            ),
            "unverified_claim": Noul(
                instructions=(
                    "Does this text state a statistic, funding amount, award, ranking or partnership claim "
                    "that would need to be verified before publishing?"
                )
            ),
        },
    )
    if resp is None:
        return {"ai_ok": False}
    level, label = _levels(resp.scores["substance"])
    placeholder_p = resp.nouls["is_placeholder"].noul
    claim_p = resp.nouls["unverified_claim"].noul
    issues: list[dict] = []
    if placeholder_p > 0.75:
        issues.append({
            "field": "body", "severity": "error", "code": "ai_placeholder",
            "message": "This reads like placeholder or sample text rather than real content about the lab.",
            "hint": f"AI confidence {round(placeholder_p * 100)}%",
        })
    elif level == 0:
        issues.append({
            "field": "body", "severity": "warning", "code": "ai_thin",
            "message": "This text looks very thin. Add a few specific details before publishing.",
            "hint": f"Assessed as “{label}”",
        })
    if claim_p > 0.7:
        issues.append({
            "field": "body", "severity": "warning", "code": "ai_unverified_claim",
            "message": "This mentions a statistic or claim that should be verified before publishing.",
            "hint": f"AI confidence {round(claim_p * 100)}%",
        })
    return {
        "ai_ok": True, "substance_level": level, "substance_label": label,
        "placeholder_probability": round(placeholder_p, 3),
        "claim_probability": round(claim_p, 3), "ai_issues": issues,
    }


# ---------------------------------------------------------------- 2. contact inbox triage
URGENCY_LEVELS = ["no rush", "normal", "soon", "urgent"]
MESSAGE_CATEGORIES = {
    "collaboration": "Research collaboration, industry partnership, joint project or funding enquiry",
    "student": "A student asking about practicum, assistant recruitment, grades or lab access",
    "training": "An enquiry about training, workshops, certification or registration",
    "visit": "A request to visit, tour or use the laboratory facilities",
    "other": "Anything else, including vendor pitches and general enquiries",
    "spam": "Unsolicited advertising, scams, SEO offers or nonsense text",
}


async def triage_message(name: str, subject: str, body: str) -> dict:
    resp = await _ask(
        {"from": name, "subject": subject, "message": (body or "")[:2500]},
        {
            "category": Choice(
                instructions="A message sent through a university telecom lab's contact form. Which bucket does it belong in?",
                criteria=MESSAGE_CATEGORIES,
            ),
            "urgency": Score(
                instructions="How quickly does the lab need to reply to this message?",
                criteria=URGENCY_LEVELS,
            ),
            "is_spam": Noul(instructions="Is this message spam, a scam, or unsolicited advertising?"),
        },
    )
    if resp is None:
        return {"ai_ok": False}
    choice = resp.choices["category"]
    level, label = _levels(resp.scores["urgency"])
    return {
        "ai_ok": True,
        "category": choice.choice,
        "category_confidence": round(choice.confidence, 3),
        "urgency_level": level,
        "urgency_label": label,
        "spam_probability": round(resp.nouls["is_spam"].noul, 3),
    }


# ---------------------------------------------------------------- 3. registration quality scoring
FIT_LEVELS = ["incomplete or junk", "weak", "adequate", "strong fit"]


async def score_registration(event_title: str, event_type: str, answers: dict) -> dict:
    clean = {k.replace("f_", "").replace("-", " "): v for k, v in (answers or {}).items()
             if isinstance(v, str) and v}
    if not clean:
        return {"ai_ok": False}
    resp = await _ask(
        {"event": event_title, "event_type": event_type, "answers": clean},
        {
            "fit": Score(
                instructions=(
                    "A person registered for this laboratory event. Judging only by how complete, genuine "
                    "and relevant their answers are, how strong is this registration?"
                ),
                criteria=FIT_LEVELS,
            ),
            "is_junk": Noul(
                instructions=(
                    "Are these answers fake, nonsense, test entries or auto-filled gibberish rather than "
                    "a genuine person registering?"
                )
            ),
        },
    )
    if resp is None:
        return {"ai_ok": False}
    level, label = _levels(resp.scores["fit"])
    return {
        "ai_ok": True,
        "fit_level": level,
        "fit_label": label,
        "fit_score": round(resp.scores["fit"].score, 2),
        "junk_probability": round(resp.nouls["is_junk"].noul, 3),
    }


async def close_jev() -> None:
    if jev_enabled():
        try:
            await get_jev_client().aclose()
        except Exception:  # noqa: BLE001
            pass
