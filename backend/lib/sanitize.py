"""Allowlist HTML sanitizer for rich-text and Custom HTML blocks (stdlib only).

Admin-only block, but defense in depth: scripts, event handlers, iframes (except
YouTube embeds) and unknown tags are stripped before anything is stored or rendered.
"""

import re
from html import escape
from html.parser import HTMLParser

ALLOWED_TAGS = {
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h3", "h4", "h5", "h6", "blockquote", "img", "figure", "figcaption", "span",
    "div", "table", "thead", "tbody", "tr", "td", "th", "code", "pre", "small", "sup", "sub",
}
VOID_TAGS = {"br", "hr", "img"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "form", "noscript"}
ALLOWED_ATTRS = {
    "a": {"href", "title", "target", "rel"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
}
SAFE_URL = re.compile(r"^(https?:|mailto:|/)", re.I)


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.skip_depth += 1
            return
        if tag not in ALLOWED_TAGS or self.skip_depth:
            return
        clean = []
        for name, value in attrs:
            name = name.lower()
            if name.startswith("on"):
                continue
            if name in ("href", "src") and (value is None or not SAFE_URL.match(value.strip())):
                continue
            if ALLOWED_ATTRS.get(tag) and name not in ALLOWED_ATTRS[tag]:
                continue
            clean.append(f'{name}="{escape(value or "", quote=True)}"')
        if tag == "img" and not any(n == "alt" for n, _ in attrs):
            clean.append('alt=""')
        space = " " if clean else ""
        if tag in VOID_TAGS:
            self.out.append(f"<{tag}{space}{' '.join(clean)}>")
        else:
            self.out.append(f"<{tag}{space}{' '.join(clean)}>")

    def handle_startendtag(self, tag, attrs):
        if tag in VOID_TAGS:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if tag in ALLOWED_TAGS and tag not in VOID_TAGS and not self.skip_depth:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.skip_depth:
            self.out.append(escape(data, quote=False))


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    parser = _Sanitizer()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        return escape(html, quote=False)  # unparsable input: render as plain text, never raw
    return "".join(parser.out)
