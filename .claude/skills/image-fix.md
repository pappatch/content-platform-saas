# Skill: /image-fix

Scan all published articles for missing, broken, duplicate, or off-topic images and fix them using site-specific Unsplash search queries.

Invoke with: `/image-fix [site_id]` — site_id is required.
Example: `/image-fix 2` fixes all image issues for the Bonsai site.

---

## Step 1 — Load site context

Query the database to load context for the given site:

```sql
-- Site info + scrape keywords
SELECT s.id, s.name, s.language,
       GROUP_CONCAT(j.keywords, ',') as scrape_keywords
FROM sites s
LEFT JOIN scrape_jobs j ON j.site_id = s.id
WHERE s.id = [site_id]
GROUP BY s.id;

-- All published articles for this site
SELECT id, title, main_image_url, seo_keywords, ai_flags
FROM articles
WHERE site_id = [site_id] AND status = 'published'
ORDER BY id;

-- Site default images
SELECT config FROM sites WHERE id = [site_id];
-- Extract config.default_images (JSON array of up to 5 URLs)
```

Parse the `scrape_keywords` JSON arrays from each ScrapeJob into a flat deduplicated list.
These become the primary Unsplash search queries.

## Step 2 — Classify each article image

For each article, classify its `main_image_url` into one of these categories:

| Category | Condition | Action |
|----------|-----------|--------|
| **OK** | URL is valid, passes HEAD check (200, content-type: image/*, size > 5KB) | Skip |
| **Missing** | `main_image_url` is NULL or empty string | Fix |
| **Broken** | HEAD request returns non-200, timeout, or connection error | Fix |
| **Noise** | URL matches `_NOISE_RE` pattern: SVG, `.svg`, `WhatsApp`, `pixel.gif`, `1x1`, `placeholder` | Fix |
| **Duplicate** | Same Unsplash photo ID (`photo-<hex>`) used by 2+ articles on this site | Fix one, keep others |
| **Off-topic** | URL contains hardcoded fallback keywords mismatched to site topic (e.g. "shih-tzu" on a bonsai site) | Fix |

### Noise patterns to detect
```
/\.svg(\?|$)/i
/WhatsApp/i
/pixel\.(gif|png)/i
/1x1\.(gif|png)/i
/placeholder/i
/source\.unsplash\.com\/featured\/\?(?!.*[site_keyword])/i
```

### Off-topic detection
Cross-reference the URL's keyword hints (Unsplash `?` param, filename, or CDN path) against the site's scrape keywords. Flag as off-topic if zero overlap.

## Step 3 — Build fix queue

Collect all articles requiring a fix. For each, determine the best Unsplash search query:

1. **Primary query**: article's `seo_keywords` (first 2–3 words) combined with the most specific site scrape keyword
2. **Fallback query**: site name + most specific scrape keyword (e.g. "bonsai tree care")
3. **Last resort**: first entry from `site.config.default_images` (pre-validated curated images)

Build an `excluded_urls` set from all currently-valid article images on this site to prevent duplicate assignments.

## Step 4 — Fix images

For each article in the fix queue:

1. Search Unsplash: `GET /search/photos?query=[primary_query]&per_page=10`
   (use the `UNSPLASH_ACCESS_KEY` from `backend/.env`)
2. Filter candidates: skip any URL whose `photo-<id>` key is in `excluded_urls`
3. HEAD-validate the first non-excluded candidate
4. If primary query yields nothing, retry with fallback query
5. If fallback also fails, use `site.config.default_images[0]` as the last resort
6. Update the article: `UPDATE articles SET main_image_url = '[url]' WHERE id = [id]`
7. Add the new URL's photo key to `excluded_urls`
8. Wait 0.5s between Unsplash calls to avoid rate-limiting (50 req/hour on demo key)

## Step 5 — Report

```
/image-fix report — Site [id]: [name]
Date: [date]

Articles scanned:   [N]
Already OK:         [N]
Fixed:
  Missing:    [N] → assigned Unsplash image
  Broken:     [N] → replaced with valid image
  Noise:      [N] → replaced (SVG / placeholder detected)
  Duplicate:  [N] → replaced with unique image
  Off-topic:  [N] → replaced with topic-specific image

Failed (no suitable image found):  [N]
  [list article IDs and titles that could not be fixed]

Skipped (status != published):  [N]

Search queries used:
  [query] → [N] articles assigned
  [query] → [N] articles assigned
```

If any articles failed, suggest:
- Running `/image-fix [site_id]` again after populating `site.config.default_images` via the admin Site modal → "✦ Auto-fill empty"
- Manually setting `main_image_url` for the listed article IDs via the CMS Article editor
