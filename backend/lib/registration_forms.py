"""Validate the stored FormField schema before persisting any attachments."""

import re
from fastapi import HTTPException

from lib.quality import EMAIL_OK
from lib.registration_integrity import normalize_email, normalize_nim

MAX_UPLOAD = 5 * 1024 * 1024
FIELD_TYPES = {"text", "email", "tel", "nim", "select", "checkbox", "textarea", "file"}
TRUE_VALUES = {"1", "true", "on", "yes"}
FALSE_VALUES = {"", "0", "false", "off", "no"}


def field_key(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (label or "").lower()).strip("-")
    return f"f_{slug or 'field'}"


async def validate_registration_form(fields: list[dict], form, header_ok) -> tuple[dict, list]:
    if len(fields) > 100:
        raise HTTPException(503, "Registration form has too many fields; please contact the organizer.")
    definitions = {field_key(field.get("label", "")): field for field in fields}
    if len(definitions) != len(fields) or any(f.get("type", "text") not in FIELD_TYPES for f in fields):
        raise HTTPException(503, "Registration form schema needs organizer review.")
    raw_values = {}
    for key, field in definitions.items():
        values = form.getlist(key) or form.getlist(field.get("name") or "")
        if len(values) > 1:
            raise HTTPException(422, f"{field.get('label')}: provide one value.")
        raw_values[key] = values[0] if values else ""
    resolved = {}

    def visible(key, path=()):
        if key in resolved:
            return resolved[key]
        if key in path:
            raise HTTPException(503, "Registration form has a conditional cycle.")
        field = definitions[key]
        controller = field.get("show_if_field")
        result = True
        if controller:
            control_key = field_key(controller)
            if control_key not in definitions:
                raise HTTPException(503, "Registration form has an unknown conditional field.")
            actual = raw_values[control_key]
            expected = str(field.get("show_if_value") or "").strip()
            if definitions[control_key].get("type") == "checkbox":
                actual = "true" if isinstance(actual, str) and actual.strip().lower() in TRUE_VALUES else "false"
                expected = "true" if expected.lower() in TRUE_VALUES else "false"
            elif isinstance(actual, str):
                actual = actual.strip()
            result = visible(control_key, (*path, key)) and actual == expected
        resolved[key] = result
        return result

    data, uploads, missing, errors = {}, [], [], []
    for key, field in definitions.items():
        if not visible(key):
            continue
        label, kind, raw = field.get("label", ""), field.get("type", "text"), raw_values[key]
        required = field.get("required", False)
        if kind == "file":
            if hasattr(raw, "filename") and hasattr(raw, "read") and raw.filename:
                content = await raw.read(MAX_UPLOAD + 1)
                extension = "." + raw.filename.rsplit(".", 1)[-1].lower()
                if not content or len(content) > MAX_UPLOAD:
                    errors.append(f"{label}: file must be nonempty and under 5 MB.")
                elif not header_ok(content, extension):
                    errors.append(f"{label}: file type or content is not allowed.")
                else:
                    uploads.append((key, raw.filename, content))
            elif required:
                missing.append(label)
            continue
        if not isinstance(raw, str):
            errors.append(f"{label}: expected text.")
            continue
        text = raw.strip()
        if kind == "checkbox":
            lowered = text.lower()
            if lowered not in TRUE_VALUES | FALSE_VALUES:
                errors.append(f"{label}: invalid checkbox value.")
            checked = lowered in TRUE_VALUES
            if required and not checked:
                missing.append(label)
            data[key] = "true" if checked else "false"
            continue
        if not text:
            if required:
                missing.append(label)
            continue
        bound = {"email": 254, "tel": 40, "nim": 40, "textarea": 10000}.get(kind, 2000)
        if len(text) > bound or "\x00" in text:
            errors.append(f"{label}: maximum {bound} characters; null characters are not allowed.")
        if kind == "email":
            text = normalize_email(text)
            if not EMAIL_OK.fullmatch(text):
                errors.append(f"{label}: please enter a valid email address.")
        if kind == "select" and text not in [str(option).strip() for option in field.get("options", [])]:
            errors.append(f"{label}: choose one of the listed options.")
        if kind == "tel" and not 8 <= len(re.sub(r"\D", "", text)) <= 16:
            errors.append(f"{label}: please enter a valid phone/WhatsApp number.")
        if kind == "nim" or "nrp" in key or "nim" in key:
            text = normalize_nim(text)
            if not re.fullmatch(r"[0-9]{7,32}", text):
                errors.append(f"{label}: NIM/NRP must contain 7 to 32 digits.")
        if any(word in key for word in ("motivation", "motivasi", "alasan")) and len(text) < 15:
            errors.append(f"{label}: minimal 15 karakter.")
        data[key] = text
    if sum(len(content) for _, _, content in uploads) > 20 * 1024 * 1024:
        errors.append("Attachments must total at most 20 MB.")
    if missing or errors:
        raise HTTPException(422, {"message": "Please check the highlighted fields.", "missing": missing, "errors": errors})
    return data, uploads
