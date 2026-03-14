"""
AI Review service — full content rewrite, translation, quality scoring, and SEO enrichment.

Architecture
------------
A single Anthropic API call uses tool_use with tool_choice="tool" to force a structured JSON
response that rewrites the article as clean HTML in the site language, scores quality, and
produces SEO metadata — all in one round-trip.

Rewrite flow
------------
1. Load article and its content_html from the DB; load the parent site.
2. Detect source language; compare to site language.
3. Truncate content_html to INPUT_CHAR_LIMIT and build prompt.
4. Call Anthropic with rewrite_article tool forced; AI returns content_html (HTML string).
5. Sanitize and store content_html; update article metadata.
6. Publish the article; set ai_score, ai_flags, and SEO fields.

Security invariants
-------------------
- API key read exclusively from Settings (environment variable); never hardcoded.
- Text sent to the API is truncated to INPUT_CHAR_LIMIT chars total.
- All anthropic.APIError subclasses are caught, logged; raw errors never reach callers.
- On any failure the article stays status=pending (no data loss).
- content_html is sanitized before being written to DB.
"""

import json
import logging

import anthropic

from app.config import get_settings
from app.database import SessionLocal
from app.models.article import Article, ArticleStatus
from app.models.site import Site, SiteLanguage
from app.services.scraper import detect_language
from app.services import settings_service
from app.utils.sanitize import sanitize_html, sanitize_text

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
INPUT_CHAR_LIMIT = 4000   # max chars sent to API per article
MAX_TOKENS = 2048          # enough for a rewritten article + metadata

LANGUAGE_NAMES = {
    "en": "English",
    "he": "Hebrew",
    "ar": "Arabic",
    "fr": "French",
}

_RTL_LANGUAGES = {SiteLanguage.he, SiteLanguage.ar}

# ---------------------------------------------------------------------------
# Tool definition — combined rewrite + score + SEO tool
# ---------------------------------------------------------------------------

_REWRITE_TOOL = {
    "name": "rewrite_article",
    "description": (
        "Rewrite and translate the article content into the target language, then score it "
        "and produce SEO metadata. Always call this tool — never respond with plain text."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Rewritten article title in the target language, max 200 characters.",
            },
            "content_html": {
                "type": "string",
                "description": (
                    "Complete article body as clean semantic HTML in the target language. "
                    "Use <h2> for main section headings, <h3> for sub-sections, "
                    "<p> for paragraphs, <blockquote> for quotes, "
                    "<img src='...' alt='...'> for images (preserve original image URLs exactly). "
                    "No classes, no inline styles, no <html>/<head>/<body> wrapper tags."
                ),
            },
            "score": {
                "type": "number",
                "description": (
                    "Overall quality score 0.0–1.0. "
                    "Consider coherence (is the rewritten article well-structured?), "
                    "relevance (on-topic for the site categories?), and readability. "
                    "Score 0.0–0.3 for: error pages, cookie notices, legal docs with no news value, spam. "
                    "Score 0.7–1.0 for: informative, well-structured, on-topic news or editorial content."
                ),
            },
            "flags": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Specific issues found (e.g. 'thin content', 'off-topic', 'spam keywords', "
                    "'error page'). Empty array if none."
                ),
            },
            "seo_title": {
                "type": "string",
                "description": "SEO-optimised title in the target language, max 60 characters.",
            },
            "seo_description": {
                "type": "string",
                "description": "Meta description in the target language, max 160 characters.",
            },
            "seo_keywords": {
                "type": "string",
                "description": "5–10 comma-separated keywords in the target language.",
            },
        },
        "required": ["title", "content_html", "score", "flags", "seo_title", "seo_description", "seo_keywords"],
    },
}

# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------

def _serialize_content_for_prompt(article_title: str, content_html: str) -> str:
    """
    Truncate article title + body to INPUT_CHAR_LIMIT characters for the prompt.
    """
    header = f"TITLE: {article_title}\n\nCONTENT:\n"
    remaining = INPUT_CHAR_LIMIT - len(header)
    if remaining <= 0:
        return header
    return header + (content_html or "")[:remaining]


def _build_rewrite_prompt(
    serialized: str,
    target_lang: str,
    source_lang: str,
    category_names: list[str],
    is_rtl: bool,
) -> str:
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    categories_str = ", ".join(category_names) if category_names else "general"
    translating = source_lang != target_lang
    translate_note = (
        f"The source content is in {LANGUAGE_NAMES.get(source_lang, source_lang)}. "
        f"Translate it faithfully to {lang_name} while rewriting for fluency.\n"
        if translating
        else ""
    )
    rtl_note = (
        f"The target language ({lang_name}) is written right-to-left. "
        "Use appropriate RTL phrasing and punctuation conventions.\n"
        if is_rtl
        else ""
    )
    return (
        f"You are rewriting a scraped article for a {lang_name}-language news site "
        f"covering: {categories_str}.\n\n"
        f"{translate_note}"
        f"{rtl_note}"
        "Instructions:\n"
        f"1. Rewrite the article in natural, fluent {lang_name}.\n"
        "2. Preserve all facts, figures, and source information — do not invent content.\n"
        "3. Structure the article: open with a strong heading (h2), use h3 subheadings "
        "   to break up sections, write clear paragraphs.\n"
        "4. Preserve all <img> tags — keep original src URLs exactly as-is.\n"
        "5. Score the article quality and produce SEO metadata in the target language.\n\n"
        "Source content:\n"
        f"{serialized}\n\n"
        "Call rewrite_article with the result."
    )


# ---------------------------------------------------------------------------
# Core async function
# ---------------------------------------------------------------------------

async def ai_review_and_enrich(article_id: int) -> None:
    """
    Rewrite, translate (if needed), score, and publish a single pending article.

    Steps:
    1. Load article and its content_html; load the parent site.
    2. Detect source language; compare to site language.
    3. Truncate content_html to INPUT_CHAR_LIMIT and build prompt.
    4. Call Anthropic with rewrite_article tool forced; AI returns content_html.
    5. Sanitize and store content_html; update article metadata.
    6. Set status = published; commit.

    On any error: logs and leaves status = pending (safe to retry).
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "ai_review_and_enrich: ANTHROPIC_API_KEY not set — skipping article %d",
            article_id,
        )
        return

    db = SessionLocal()
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            logger.error("ai_review_and_enrich: article %d not found", article_id)
            return

        if article.status != ArticleStatus.pending:
            logger.info(
                "ai_review_and_enrich: article %d is not pending (status=%s), skipping",
                article_id,
                article.status.value,
            )
            return

        # Load site for language + category context
        from app.models.category import Category
        site = db.query(Site).filter(Site.id == article.site_id).first()
        site_lang_enum = site.language if site else SiteLanguage.en
        site_lang = site_lang_enum.value
        is_rtl = site_lang_enum in _RTL_LANGUAGES

        # Detect source language from title + plain-text snippet of content
        text_sample = sanitize_text((article.content_html or "")[:2000])
        sample = article.title + " " + text_sample
        source_lang = detect_language(sample)

        # Gather site category names for context
        category_names = [
            row.name
            for row in db.query(Category)
            .filter(Category.site_id == article.site_id)
            .all()
        ]

        # Serialize content and build prompt
        serialized = _serialize_content_for_prompt(article.title, article.content_html or "")
        prompt = _build_rewrite_prompt(
            serialized, site_lang, source_lang, category_names, is_rtl
        )

        # Call API
        try:
            result = await _call_rewrite_api(prompt)
        except Exception:
            logger.warning(
                "ai_review_and_enrich: API call failed for article %d, leaving pending",
                article_id,
            )
            return

        # --- Update article body ---
        raw_html = result.get("content_html") or ""
        article.content_html = sanitize_html(raw_html) or None

        # --- Update article fields ---
        new_title = sanitize_text(result.get("title") or "").strip()
        if new_title:
            article.title = new_title[:500]

        if source_lang != site_lang:
            article.translated_from = source_lang

        score = float(result.get("score", 0.0))
        score = max(0.0, min(1.0, score))
        flags: list[str] = [str(f) for f in result.get("flags", []) if f]

        article.ai_score = score
        article.ai_flags = json.dumps(flags) if flags else None
        article.seo_title = sanitize_text(result.get("seo_title") or "")[:200] or None
        article.seo_description = sanitize_text(result.get("seo_description") or "")[:500] or None
        article.seo_keywords = sanitize_text(result.get("seo_keywords") or "")[:500] or None

        # Determine publish status from platform settings
        threshold    = settings_service.get("ai_review_threshold", 0.5)
        auto_publish = settings_service.get("auto_publish_enabled", True)

        if auto_publish and score >= threshold:
            article.status = ArticleStatus.published
            logger.info(
                "Article %d auto-published — score=%.2f ≥ threshold %.2f",
                article_id, score, threshold,
            )
        else:
            article.status = ArticleStatus.pending
            reason = (
                f"score {score:.2f} < threshold {threshold:.2f}"
                if auto_publish
                else "auto_publish_enabled=false"
            )
            logger.info(
                "Article %d kept pending — %s, flags=%s",
                article_id, reason, flags,
            )

        # Validate existing image or fetch one; never leave published articles imageless.
        # validate_and_fix_article_image:
        #   1. returns current URL if already valid
        #   2. retries with different keywords on failure
        #   3. falls back to site.config.default_images if all Unsplash calls fail
        from app.services.image_validator import validate_and_fix_article_image

        site_defaults: list[str] | None = None
        if site and isinstance(getattr(site, "config", None), dict):
            imgs = site.config.get("default_images")
            if isinstance(imgs, list) and imgs:
                site_defaults = imgs

        # Collect image URLs already in use on this site so the new article
        # gets a unique photo (duplicate prevention).
        existing_site_urls: set[str] = {
            row[0]
            for row in db.query(Article.main_image_url)
            .filter(
                Article.site_id == article.site_id,
                Article.main_image_url.isnot(None),
                Article.id != article_id,
            )
            .all()
            if row[0]
        }

        image_keywords = article.seo_keywords or article.title or ""
        image_url = await validate_and_fix_article_image(
            article_id,
            article.main_image_url,
            image_keywords,
            site_defaults,
            excluded_urls=existing_site_urls,
        )
        if image_url:
            article.main_image_url = image_url

        # Auto-assign category if none set — keyword matching against category names
        if not article.category_id:
            cats = db.query(Category).filter(Category.site_id == article.site_id).all()
            if cats:
                article_text = (
                    f"{article.title} {article.seo_keywords or ''} "
                    f"{article.seo_description or ''}"
                ).lower()
                best_cat, best_score = None, 0
                for cat in cats:
                    # Score = number of category name words found in article text
                    words = [w.strip() for w in cat.name.lower().split() if len(w) > 2]
                    score = sum(1 for w in words if w in article_text)
                    if score > best_score:
                        best_score, best_cat = score, cat
                if best_cat and best_score > 0:
                    article.category_id = best_cat.id
                    logger.info(
                        "ai_review: auto-assigned article %d → category '%s' (score=%d)",
                        article_id, best_cat.name, best_score,
                    )

        db.commit()

    except Exception:
        logger.exception("ai_review_and_enrich: unexpected error for article %d", article_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# API call helper
# ---------------------------------------------------------------------------

async def _call_rewrite_api(prompt: str) -> dict:
    """Call the rewrite_article tool and return its input dict."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            tools=[_REWRITE_TOOL],
            tool_choice={"type": "tool", "name": "rewrite_article"},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        logger.error("Anthropic API: authentication failed — check ANTHROPIC_API_KEY")
        raise
    except anthropic.RateLimitError:
        logger.warning("Anthropic API: rate limit hit")
        raise
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error %d: %s", exc.status_code, exc.message)
        raise
    except anthropic.APIConnectionError:
        logger.error("Anthropic API: connection error")
        raise
    except anthropic.APIError as exc:
        logger.error("Anthropic API: %s", exc)
        raise

    for block in response.content:
        if block.type == "tool_use" and block.name == "rewrite_article":
            return block.input

    raise ValueError("Anthropic response contained no rewrite_article tool call")
