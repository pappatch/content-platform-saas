"""
Sanitize block content before saving — strip dangerous tags and attributes.

SECURITY NOTES
--------------
This sanitizer uses a *denylist* approach (remove known-bad patterns) rather
than an *allowlist* approach (keep only known-good tags/attributes).  A
denylist is inherently weaker: a motivated attacker may find novel bypass
vectors not listed here.

For production deployments that render content_html with dangerouslySetInnerHTML
in the browser, consider adding a client-side allowlist sanitizer such as
DOMPurify (https://github.com/cure53/DOMPurify).  The server-side pass here
is the first line of defence; DOMPurify would provide defence-in-depth.

This module intentionally avoids heavy dependencies (e.g. bleach / lxml) so
it can run in environments without those packages.  If you add bleach, replace
the functions below with bleach.clean() using an explicit allowlist.
"""

import re

# Tags whose content (and the tag itself) should be removed entirely.
# Covers paired tags.
_DANGEROUS_TAGS = re.compile(
    r"<(script|iframe|object|embed|form|style|template|svg|math)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)

# Self-closing or void dangerous tags (no matching closing tag).
_DANGEROUS_SELF_CLOSING = re.compile(
    r"<(script|iframe|object|embed|form|style|template|svg|math|meta|link|base)\b[^>]*/?>",
    re.IGNORECASE,
)

# javascript: and data: URLs in href/src/action/formaction attributes.
_DANGEROUS_ATTR = re.compile(
    r"""(href|src|action|formaction|xlink:href)\s*=\s*["']\s*(javascript:|data:|vbscript:)[^"']*["']""",
    re.IGNORECASE,
)

# Inline on* event handlers (onclick, onload, onerror, …).
_EVENT_HANDLERS = re.compile(r"""\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)""", re.IGNORECASE)

# srcdoc attribute on any element (allows full HTML injection inside iframes).
_SRCDOC_ATTR = re.compile(r"""\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*')""", re.IGNORECASE)


def sanitize_html(html: str) -> str:
    """
    Remove dangerous constructs from an HTML string before storing or rendering.

    Strips: script/iframe/object/embed/form/style/svg/math/meta/link/base tags,
    javascript:/data:/vbscript: URL schemes, on* event handlers, and srcdoc
    attributes.

    NOTE: This is a denylist-based sanitizer.  For defence-in-depth, also run
    DOMPurify on the client side before rendering with dangerouslySetInnerHTML.
    """
    if not html:
        return html
    html = _DANGEROUS_TAGS.sub("", html)
    html = _DANGEROUS_SELF_CLOSING.sub("", html)
    html = _DANGEROUS_ATTR.sub(r'\1="#"', html)
    html = _EVENT_HANDLERS.sub("", html)
    html = _SRCDOC_ATTR.sub("", html)
    return html.strip()


def sanitize_text(text: str) -> str:
    """
    Strip all HTML tags from a string, returning plain text.

    Used for fields that must never contain markup (image alt text, SEO
    titles, etc.).
    """
    if not text:
        return text
    return re.sub(r"<[^>]+>", "", text).strip()
