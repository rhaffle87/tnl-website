"""Storage adapter: local disk by default, S3-compatible when STORAGE_BACKEND=s3.

Local files land in MEDIA_DIR and are served back through /api/media-files/...
so the whole app stays behind one origin and respects the deployment base path.
"""

import io
import os
import re
import uuid
import zipfile

MEDIA_DIR = os.environ.get("MEDIA_DIR", "/app/backend/media")
BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()


def safe_name(filename: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "_", filename or "file")[-80:]
    return f"{uuid.uuid4().hex[:10]}_{base}"


# Content types positively identified from magic bytes, with the one extension
# each is stored under. Uploads derive their extension from this table, never
# from the client-supplied filename (`evil.html` may actually hold a PNG).
def sniff_content_type(data: bytes) -> tuple[str, str] | None:
    """Identify an uploaded file from its bytes: (canonical mime, canonical ext).

    Returns None when the format has no reliable signature. Callers must then
    reject executable/unknown extensions instead of trusting the request.
    """
    if not data:
        return None
    if data.startswith(bytes.fromhex("89504e470d0a1a0a")):
        return "image/png", ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", ".gif"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    if data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        # OOXML documents are ZIP archives too: inspect member names so a
        # .docx/.xlsx/.pptx is stored under its real format, not as .zip.
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                members = set(zf.namelist())
        except (zipfile.BadZipFile, OSError, ValueError):
            members = set()
        if "[Content_Types].xml" in members:
            if any(name.startswith("word/") for name in members):
                return (
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ".docx",
                )
            if any(name.startswith("xl/") for name in members):
                return (
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    ".xlsx",
                )
            if any(name.startswith("ppt/") for name in members):
                return (
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    ".pptx",
                )
        return "application/zip", ".zip"
    if data.startswith(b"BM"):
        return "image/bmp", ".bmp"
    return None


def _local_put(data: bytes, key: str) -> str:
    path = os.path.join(MEDIA_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    return f"/api/media-files/{key}"


def _s3_put(data: bytes, key: str, content_type: str) -> str:
    import boto3
    bucket = os.environ["S3_BUCKET"]
    session = boto3.session.Session()
    client = session.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
    )
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    public = os.environ.get("S3_PUBLIC_URL", "").rstrip("/")
    return f"{public}/{key}" if public else f"{os.environ.get('S3_ENDPOINT', '').rstrip('/')}/{bucket}/{key}"


def put_object(data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """Store bytes under `key`; return the URL the frontend should use."""
    if BACKEND == "s3":
        return _s3_put(data, key, content_type)
    return _local_put(data, key)


def delete_object(key: str) -> None:
    if BACKEND == "s3":
        try:
            import boto3
            session = boto3.session.Session()
            client = session.client(
                "s3",
                endpoint_url=os.environ.get("S3_ENDPOINT") or None,
                aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
                aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
                region_name=os.environ.get("S3_REGION", "us-east-1"),
            )
            client.delete_object(Bucket=os.environ["S3_BUCKET"], Key=key)
        except Exception:  # noqa: BLE001
            pass
        return
    path = os.path.join(MEDIA_DIR, key)
    if os.path.isfile(path):
        os.remove(path)


def local_path(key: str) -> str:
    return os.path.join(MEDIA_DIR, key)
