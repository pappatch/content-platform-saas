"""
Logo generation service — Stability AI SDXL backend with SVG fallback.

Primary path
------------
Calls the Stability AI text-to-image API (stable-diffusion-xl-1024-v1-0) to
produce a professional 1024×1024 logo icon.  Returns a
``data:image/png;base64,...`` URI suitable for direct storage in
``site.config.logo_url`` and consumption by ``<img src=...>``.

Prompt template
---------------
  "Minimalist professional logo icon for a {topic} website, clean vector
   style, {primary_color} color scheme, no text, no letters, no words,
   simple geometric or symbolic design, white background, high quality"

A negative prompt discourages text, blurriness, and low-quality artifacts.

Fallback
--------
When STABILITY_API_KEY is not configured or the API call fails for any reason,
the service falls back to the offline SVG generator (pure Python, zero deps)
so site creation is never blocked by an external API.

Security invariants
-------------------
- API key is read exclusively from Settings (never hardcoded).
- All HTTP errors are caught, logged, and trigger the SVG fallback.
- The base64 payload from Stability AI is validated as non-empty before
  wrapping in the data URI.
"""

import base64
import logging
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stability AI constants
# ---------------------------------------------------------------------------

_STABILITY_URL = (
    "https://api.stability.ai/v1/generation"
    "/stable-diffusion-xl-1024-v1-0/text-to-image"
)

_NEGATIVE_PROMPT = (
    "text, letters, words, numbers, typography, watermark, signature, "
    "ugly, blurry, low quality, cropped, distorted, noisy, oversaturated, "
    "photorealistic, photograph, person, face"
)

_REQUEST_TIMEOUT = 60.0  # Stability can be slow; generous timeout


# ---------------------------------------------------------------------------
# SVG fallback — kept from previous implementation
# ---------------------------------------------------------------------------

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_DEFAULT_PRIMARY   = "#4f46e5"
_DEFAULT_SECONDARY = "#6366f1"

_ACCENT_RULES: list[tuple[list[str], str]] = [
    (["bonsai", "tree", "plant", "garden", "flower", "leaf", "herb", "nature",
      "green", "shrub", "forest", "botanical"], "leaf"),
    (["dog", "cat", "pet", "animal", "paw", "puppy", "kitten", "shih", "tzu",
      "breed", "canine", "feline", "furry", "veterinary", "vet"], "paw"),
    (["tech", "software", "ai", "digital", "machine", "learning", "code",
      "data", "cyber", "app", "cloud", "startup", "dev", "api", "saas"], "gear"),
    (["news", "world", "global", "international", "politics", "economy",
      "business", "finance", "market", "trade", "media", "press"], "globe"),
    (["music", "sound", "audio", "noise", "sleep", "ambient", "asmr", "relax",
      "meditation", "wave", "frequency", "acoustic", "podcast"], "wave"),
]


def _safe_color(color: Optional[str], default: str) -> str:
    if color and _HEX_RE.match(color):
        return color
    return default


def _xml_escape(text: str) -> str:
    return (
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _get_initials(site_name: str) -> str:
    ascii_only = re.sub(r"[^a-zA-Z\s]+", " ", site_name).strip()
    words = [w for w in ascii_only.split() if w]
    if not words:
        return "S"
    if len(words) == 1:
        word = words[0].upper()
        return word[:2] if len(word) >= 2 else word[0]
    return "".join(w[0].upper() for w in words)[:3] or "S"


def _detect_accent(keywords: list[str]) -> str:
    kw_text = " ".join(k.lower() for k in keywords)
    for terms, accent in _ACCENT_RULES:
        if any(t in kw_text for t in terms):
            return accent
    return "diamond"


def _accent_svg(accent: str, color: str) -> str:
    cx, cy = 94, 94

    if accent == "leaf":
        return (
            f'<path d="M{cx},{cy - 13}'
            f' Q{cx + 12},{cy} {cx},{cy + 13}'
            f' Q{cx - 12},{cy} {cx},{cy - 13} Z"'
            f' fill="{color}" opacity="0.88"/>'
            f'<line x1="{cx}" y1="{cy + 12}" x2="{cx}" y2="{cy - 11}"'
            f' stroke="{color}" stroke-width="1.2" opacity="0.45"/>'
        )

    if accent == "paw":
        return (
            f'<ellipse cx="{cx}" cy="{cy + 5}" rx="7" ry="5" fill="{color}" opacity="0.88"/>'
            f'<circle cx="{cx - 8}" cy="{cy - 3}" r="3" fill="{color}" opacity="0.88"/>'
            f'<circle cx="{cx}" cy="{cy - 6}" r="3" fill="{color}" opacity="0.88"/>'
            f'<circle cx="{cx + 8}" cy="{cy - 3}" r="3" fill="{color}" opacity="0.88"/>'
        )

    if accent == "gear":
        import math
        r1, r2 = 12, 11

        def pts(radius: float, count: int, offset_deg: float = 0.0) -> str:
            coords = []
            for i in range(count):
                angle = math.radians(360 * i / count + offset_deg)
                coords.append(
                    f"{cx + radius * math.cos(angle):.1f},"
                    f"{cy + radius * math.sin(angle):.1f}"
                )
            return " ".join(coords)

        return (
            f'<polygon points="{pts(r1, 8, 0)}" fill="{color}" opacity="0.88"/>'
            f'<polygon points="{pts(r2, 8, 22.5)}" fill="{color}" opacity="0.88"/>'
            f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="white" opacity="0.45"/>'
        )

    if accent == "globe":
        r = 12
        return (
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none"'
            f' stroke="{color}" stroke-width="2" opacity="0.88"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="5.5" ry="{r}" fill="none"'
            f' stroke="{color}" stroke-width="1.4" opacity="0.88"/>'
            f'<line x1="{cx - r}" y1="{cy}" x2="{cx + r}" y2="{cy}"'
            f' stroke="{color}" stroke-width="1.4" opacity="0.88"/>'
        )

    if accent == "wave":
        y1, y2 = cy - 6, cy + 6
        amp = 7
        return (
            f'<path d="M{cx - 13},{y1} Q{cx - 6},{y1 - amp} {cx},{y1}'
            f' Q{cx + 6},{y1 + amp} {cx + 13},{y1}"'
            f' fill="none" stroke="{color}" stroke-width="2.2"'
            f' stroke-linecap="round" opacity="0.88"/>'
            f'<path d="M{cx - 13},{y2} Q{cx - 6},{y2 - amp} {cx},{y2}'
            f' Q{cx + 6},{y2 + amp} {cx + 13},{y2}"'
            f' fill="none" stroke="{color}" stroke-width="2.2"'
            f' stroke-linecap="round" opacity="0.88"/>'
        )

    # diamond (default)
    return (
        f'<polygon points="{cx},{cy - 13} {cx + 11},{cy} {cx},{cy + 13} {cx - 11},{cy}"'
        f' fill="{color}" opacity="0.88"/>'
    )


def _generate_svg_fallback(
    site_name: str,
    primary_color: Optional[str],
    secondary_color: Optional[str],
    keywords: list[str],
) -> str:
    """Return a data:image/svg+xml;base64 URI. Completely offline."""
    primary   = _safe_color(primary_color, _DEFAULT_PRIMARY)
    secondary = _safe_color(secondary_color, _DEFAULT_SECONDARY)

    initials  = _get_initials(site_name)
    accent_id = _detect_accent(keywords)
    accent    = _accent_svg(accent_id, secondary)

    font_size = {1: 60, 2: 50, 3: 38}.get(len(initials), 38)
    text_y    = 56 if len(initials) <= 2 else 53
    escaped   = _xml_escape(initials)

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">'
        f'<rect x="0" y="0" width="120" height="120" rx="22" ry="22" fill="{primary}"/>'
        f'<rect x="1.5" y="1.5" width="117" height="117" rx="20.5" ry="20.5"'
        f' fill="none" stroke="white" stroke-width="1.5" opacity="0.12"/>'
        f'<text x="60" y="{text_y}"'
        f' font-family="Arial,Helvetica,sans-serif"'
        f' font-size="{font_size}" font-weight="bold" fill="white"'
        f' text-anchor="middle" dominant-baseline="central" letter-spacing="1">'
        f'{escaped}</text>'
        + accent
        + '</svg>'
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------

def _build_topic(site_name: str, keywords: list[str]) -> str:
    """Return a concise topic string for the Stability AI prompt."""
    # Use up to 2 scrape keywords; fall back to site name
    clean = [k.strip() for k in keywords[:2] if k.strip()]
    return ", ".join(clean) if clean else site_name


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_logo(
    site_name: str,
    primary_color: Optional[str] = None,
    secondary_color: Optional[str] = None,
    keywords: Optional[list[str]] = None,
) -> str:
    """
    Generate a professional logo icon and return it as a ``data:`` URI.

    Tries Stability AI SDXL first; falls back to the built-in SVG generator
    when the API key is absent or the API call fails.

    Args:
        site_name:       Used for the topic description and SVG initials.
        primary_color:   Brand primary hex (``#rrggbb``); included in the prompt.
        secondary_color: Brand secondary hex (SVG fallback accent color only).
        keywords:        Scrape-job keywords for topic context.

    Returns:
        ``data:image/png;base64,...``  — from Stability AI (AI-generated), or
        ``data:image/svg+xml;base64,...`` — from the SVG fallback.
    """
    from app.config import get_settings
    settings = get_settings()
    kws = keywords or []

    if not settings.stability_api_key:
        logger.info("generate_logo: STABILITY_API_KEY not configured — using SVG fallback")
        return _generate_svg_fallback(site_name, primary_color, secondary_color, kws)

    topic      = _build_topic(site_name, kws)
    color_desc = primary_color if primary_color else "indigo blue"

    prompt = (
        f"Professional content website logo, horizontal format, minimalist brand icon, "
        f"{topic} theme, {color_desc} accent color, transparent background PNG, "
        "clean premium design like BBC or TechCrunch, no text, no letters, "
        "symbolic icon only, high contrast"
    )

    logger.info("generate_logo: calling Stability AI for %r (topic=%r)", site_name, topic)

    # SDXL requires approved dimension pairs; 800×200 is not supported.
    # 1536×640 (~2.4:1) is the closest valid landscape ratio available.
    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.post(
                _STABILITY_URL,
                headers={
                    "Authorization": f"Bearer {settings.stability_api_key}",
                    "Content-Type":  "application/json",
                    "Accept":        "application/json",
                },
                json={
                    "text_prompts": [
                        {"text": prompt,           "weight": 1.0},
                        {"text": _NEGATIVE_PROMPT, "weight": -1.0},
                    ],
                    "cfg_scale": 7,
                    "height":    640,
                    "width":     1536,
                    "samples":   1,
                    "steps":     30,
                },
            )
        resp.raise_for_status()

        artifacts = resp.json().get("artifacts") or []
        if not artifacts:
            raise ValueError("Stability AI returned no artifacts")

        b64 = artifacts[0].get("base64", "")
        if not b64:
            raise ValueError("Stability AI artifact has empty base64 payload")

        logger.info(
            "generate_logo: AI logo ready for %r (%d base64 chars)", site_name, len(b64)
        )
        return f"data:image/png;base64,{b64}"

    except Exception as exc:
        logger.warning(
            "generate_logo: Stability AI failed for %r (%s) — using SVG fallback",
            site_name,
            exc,
        )
        return _generate_svg_fallback(site_name, primary_color, secondary_color, kws)
