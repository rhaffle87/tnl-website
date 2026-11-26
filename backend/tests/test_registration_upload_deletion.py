from routers.registrar import _private_upload_key
import pytest


@pytest.mark.parametrize("value", [
    "/api/media-files/uploads/%2e%2e%5cpublic%5chero.webp?sig=x",
    "/api/media-files/uploads/cv.pdf%00?sig=x",
    "https://[invalid/api/media-files/uploads/cv.pdf",
])
def test_rejects_encoded_unsafe_or_malformed_upload_urls(value):
    assert _private_upload_key(value) is None


def test_extracts_upload_key_from_signed_media_url():
    assert _private_upload_key(
        "https://labtnl.site/api/media-files/uploads/cv.pdf?sig=review-placeholder"
    ) == "uploads/cv.pdf"


def test_rejects_upload_keys_that_escape_private_upload_directory():
    assert _private_upload_key(
        "https://labtnl.site/api/media-files/uploads/../public/hero.webp?sig=x"
    ) is None


def test_does_not_treat_query_text_as_media_path():
    assert _private_upload_key(
        "https://labtnl.site/other?next=/api/media-files/uploads/cv.pdf"
    ) is None