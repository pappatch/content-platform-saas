"""
AI Review service — quality scoring, flag generation, SEO enrichment, and translation.

Architecture
------------
A single Anthropic API call uses tool use with tool_choice="tool" to force a
structured JSON response containing score, flags, and all SEO fields. This
guarantees parseable output and avoids a second API round-trip.

Translation
-----------
After scraping, if the article language differs from the site language, a second
Anthropic call translates title and body to the site language. The original
language code is stored in translated_from for provenance tracking.

Security invariants
-------------------
- API key read exclusively from Settings (environment variable); never hardcoded
- Article body truncated to BODY_CHAR_LIMIT before being sent to the API
- All anthropic.APIError subclasses are caught, logged, and translated to a
  generic internal message; raw API errors never reach callers
- On any failure the article stays status=pending (no data loss)
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from app.config import get_settings
from app.database import SessionLocal
from app.models.article import Article, ArticleStatus
from app.models.category import Category
from app.models.site import Site
from app.services.scraper import detect_language

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
BODY_CHAR_LIMIT = 2000
MAX_TOKENS = 1024

LANGUAGE_NAMES = {
    "en": "English",
    "he": "Hebrew",
    "ar": "Arabic",
    "fr": "French",
}

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

_REVIEW_TOOL = {
    "name": "review_and_enrich",
    "description": (
        "Review an article for quality and relevance, then produce SEO metadata. "
        "Always call this tool — do not respond with plain text."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {
                "type": "number",
                "description": (
                    "Overall quality score from 0.0 (worst) to 1.0 (best). "
                    "Consider relevance, writing quality, spam signals, and factual tone."
                ),
            },
            "flags": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "List of specific issues found (e.g. 'clickbait title', 'thin content', "
                    "'off-topic', 'spam keywords'). Empty list if no issues."
                ),
            },
            "seo_title": {
                "type": "string",
                "description": "SEO-optimised title, max 60 characters.",
            },
            "seo_description": {
                "type": "string",
                "description": "Meta description summarising the article, max 160 characters.",
            },
            "seo_keywords": {
                "type": "string",
                "description": "5–10 comma-separated keywords relevant to the article.",
            },
        },
        "required": ["score", "flags", "seo_title", "seo_description", "seo_keywords"],
    },
}

_TRANSLATE_TOOL = {
    "name": "translate_article",
    "description": "Translate the article title and body to the target language.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Translated title.",
            },
            "body": {
                "type": "string",
                "description": "Translated body text, preserving paragraph structure.",
            },
        },
        "required": ["title", "body"],
    },
}


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_review_prompt(title: str, body: str, category_names: list[str]) -> str:
    categories_str = ", ".join(category_names) if category_names else "general"
    truncated_body = body[:BODY_CHAR_LIMIT]
    ellipsis = "…" if len(body) > BODY_CHAR_LIMIT else ""
    return (
        f"Review the following article for a site covering: {categories_str}.\n\n"
        f"Title: {title}\n\n"
        f"Body:\n{truncated_body}{ellipsis}\n\n"
        "Evaluate using these criteria:\n"
        "1. Relevance — is the content on-topic for the site categories listed above?\n"
        "2. Quality — is the writing coherent, informative, and well-structured?\n"
        "3. Spam — is it free from clickbait, keyword stuffing, or low-effort filler?\n"
        "4. Tone — is it factual and objective, not sensationalist or misleading?\n\n"
        "Call review_and_enrich with your assessment."
    )


def _build_translate_prompt(title: str, body: str, target_lang: str) -> str:
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    truncated_body = body[:BODY_CHAR_LIMIT]
    ellipsis = "…" if len(body) > BODY_CHAR_LIMIT else ""
    return (
        f"Translate the following article to {lang_name}. "
        "Preserve the paragraph structure and maintain a natural, journalistic tone.\n\n"
        f"Title: {title}\n\n"
        f"Body:\n{truncated_body}{ellipsis}\n\n"
        "Call translate_article with the translated title and body."
    )


# ---------------------------------------------------------------------------
# Core async function
# ---------------------------------------------------------------------------

async def ai_review_and_enrich(article_id: int) -> None:
    """
    Review and enrich a single article via the Anthropic API.

    Steps:
    1. Detect article language; if it differs from site language, translate first.
    2. Score, flag, and generate SEO metadata.
    3. Publish the article (with flags if score is below threshold).

    On any error: logs it and leaves status = pending (safe to retry).
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

        # --- Translation step ---
        site = db.query(Site).filter(Site.id == article.site_id).first()
        site_lang = site.language.value if site else "en"
        article_lang = detect_language(article.title + " " + article.body)

        if article_lang != site_lang:
            logger.info(
                "Article %d language=%s differs from site language=%s — translating",
                article_id, article_lang, site_lang,
            )
            try:
                translated = await _translate(article.title, article.body, site_lang)
                article.title = translated["title"]
                article.body = translated["body"]
                article.translated_from = article_lang
                db.flush()
                logger.info(
                    "Article %d translated %s→%s", article_id, article_lang, site_lang
                )
            except Exception:
                logger.warning(
                    "ai_review_and_enrich: translation failed for article %d, proceeding without",
                    article_id,
                )

        # --- Review step ---
        category_names = [
            row.name
            for row in db.query(Category).filter(
                Category.site_id == article.site_id
            ).all()
        ]

        prompt = _build_review_prompt(article.title, article.body, category_names)

        try:
            result = await _call_review_api(prompt)
        except Exception:
            logger.warning(
                "ai_review_and_enrich: API call failed for article %d, leaving pending",
                article_id,
            )
            return

        score = float(result["score"])
        flags: list[str] = result.get("flags", [])

        article.ai_score = score
        article.ai_flags = json.dumps(flags) if flags else None
        article.seo_title = result.get("seo_title") or None
        article.seo_description = result.get("seo_description") or None
        article.seo_keywords = result.get("seo_keywords") or None
        article.status = ArticleStatus.published

        db.commit()

        if score >= settings.ai_review_threshold:
            logger.info(
                "Article %d published — score=%.2f (above threshold %.2f)",
                article_id, score, settings.ai_review_threshold,
            )
        else:
            logger.info(
                "Article %d published with flags — score=%.2f (below threshold %.2f), flags=%s",
                article_id, score, settings.ai_review_threshold, flags,
            )

    except Exception:
        logger.exception("ai_review_and_enrich: unexpected error for article %d", article_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# API call helpers
# ---------------------------------------------------------------------------

async def _call_review_api(prompt: str) -> dict:
    """Call the review tool and return its input dict."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            tools=[_REVIEW_TOOL],
            tool_choice={"type": "tool", "name": "review_and_enrich"},
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
        if block.type == "tool_use" and block.name == "review_and_enrich":
            return block.input

    raise ValueError("Anthropic response contained no review_and_enrich tool call")


async def _translate(title: str, body: str, target_lang: str) -> dict:
    """Translate title + body to target_lang. Returns {title, body}."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = _build_translate_prompt(title, body, target_lang)

    response = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS * 3,  # translations can be longer than reviews
        tools=[_TRANSLATE_TOOL],
        tool_choice={"type": "tool", "name": "translate_article"},
        messages=[{"role": "user", "content": prompt}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "translate_article":
            return block.input

    raise ValueError("Anthropic response contained no translate_article tool call")
