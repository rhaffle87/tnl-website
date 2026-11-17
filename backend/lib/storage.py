"""Storage adapter: local disk by default, S3-compatible when STORAGE_BACKEND=s3.

Local files land in MEDIA_DIR and are served back through /api/media-files/...
so the whole app stays behind one origin and respects the deployment base path.
"""

import os
import re
import uuid

MEDIA_DIR = os.environ.get("MEDIA_DIR", "/app/backend/media")
BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()


def safe_name(filename: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "_", filename or "file")[-80:]
    return f"{uuid.uuid4().hex[:10]}_{base}"


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
