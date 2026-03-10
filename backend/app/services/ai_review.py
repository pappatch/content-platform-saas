"""
AI Review service — quality scoring, flag generation, and SEO enrichment.

Architecture
------------
A single Anthropic API call uses tool use with tool_choice="tool" to force a
structured JSON response containing score, flags, and all SEO fields. This
guarantees parseable output and avoids a second API round-trip.

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

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
BODY_CHAR_LIMIT = 2000
MAX_TOKENS = 1024

# ---------------------------------------------------------------------------
# Tool definition — forces structured output via tool_choice
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


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(title: str, body: str, category_names: list[str]) -> str:
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


# ---------------------------------------------------------------------------
# Core async function
# ---------------------------------------------------------------------------

async def ai_review_and_enrich(article_id: int) -> None:
    """
    Review and enrich a single article via the Anthropic API.

    - Loads the article and its site's categories from the DB.
    - Sends a structured review request to claude-haiku.
    - Applies the configured score threshold:
        score >= threshold  →  status = published
        score <  threshold  →  status = published, ai_flags populated (editor review)
    - Saves ai_score, ai_flags, seo_title, seo_description, seo_keywords.
    - On any error: logs it and leaves status = pending (safe to retry).
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

        # Fetch site categories for context
        category_names = [
            row.name
            for row in db.query(Category).filter(
                Category.site_id == article.site_id
            ).all()
        ]

        prompt = _build_prompt(article.title, article.body, category_names)

        try:
            result = await _call_api(prompt)
        except Exception as exc:
            # _call_api already logged the details; keep article pending
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
                article_id,
                score,
                settings.ai_review_threshold,
            )
        else:
            logger.info(
                "Article %d published with flags — score=%.2f (below threshold %.2f), flags=%s",
                article_id,
                score,
                settings.ai_review_threshold,
                flags,
            )

    except Exception:
        logger.exception("ai_review_and_enrich: unexpected error for article %d", article_id)
    finally:
        db.close()


async def _call_api(prompt: str) -> dict:
    """
    Call the Anthropic API with tool_choice forced to review_and_enrich.
    Returns the parsed tool input dict.
    Raises on any API or parsing error (caller handles recovery).
    """
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

    # Extract the tool_use block — guaranteed present because tool_choice forced it
    for block in response.content:
        if block.type == "tool_use" and block.name == "review_and_enrich":
            return block.input

    # Should never reach here when tool_choice is forced, but guard anyway
    raise ValueError("Anthropic response contained no review_and_enrich tool call")
