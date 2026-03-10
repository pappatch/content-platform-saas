from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)  # למשל: "road-bikes" — לשימוש ב-URL
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)

    # קשרים
    site = relationship("Site", back_populates="categories")
    articles = relationship("Article", back_populates="category")
