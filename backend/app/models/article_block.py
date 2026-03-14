"""
BlockType enum — kept for the scraper's HTML parser which categorises
content blocks during extraction. No longer backed by a DB table.
"""
import enum


class BlockType(enum.Enum):
    heading = "heading"
    subheading = "subheading"
    paragraph = "paragraph"
    image = "image"
    quote = "quote"
    bold = "bold"
