from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, JSON, Table
from sqlalchemy.orm import relationship
from .connection import Base
from datetime import datetime

# Junction table for Product and Tag (Many-to-Many)
product_tags = Table(
    'product_tags',
    Base.metadata,
    Column('product_id', Integer, ForeignKey('products.id', ondelete="CASCADE"), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete="CASCADE"), primary_key=True)
)

class Catalog(Base):
    __tablename__ = "catalogs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)
    imageFolderPath = Column(Text, nullable=True)
    status = Column(String(50), default="draft") # draft, processing, staging, completed
    lastListinoName = Column(Text, nullable=True)
    
    pdfs = relationship("CatalogPdf", back_populates="catalog", cascade="all, delete-orphan")
    staging_products = relationship("StagingProduct", back_populates="catalog", cascade="all, delete-orphan")

class CatalogPdf(Base):
    __tablename__ = "catalog_pdfs"
    id = Column(Integer, primary_key=True, index=True)
    catalogId = Column(Integer, ForeignKey("catalogs.id", ondelete="CASCADE"))
    fileName = Column(String(255))
    filePath = Column(Text)
    processed = Column(Boolean, default=False)
    createdAt = Column(DateTime, default=datetime.utcnow)
    
    catalog = relationship("Catalog", back_populates="pdfs")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parentId = Column(Integer, ForeignKey("categories.id"), nullable=True)
    
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")

class Brand(Base):
    __tablename__ = "brands"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    logoUrl = Column(Text, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)

# --- MASTER PRODUCTS SYSTEM ---

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(255), unique=True, index=True, nullable=False)
    parentSku = Column(String(255), nullable=True)
    ean = Column(String(50), unique=True, nullable=True)
    brand = Column(String(255), nullable=True)
    category = Column(String(255), nullable=True)
    categoryId = Column(Integer, ForeignKey("categories.id"), nullable=True)
    subCategoryId = Column(Integer, ForeignKey("categories.id"), nullable=True)
    subSubCategoryId = Column(Integer, ForeignKey("categories.id"), nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    texts = relationship("ProductText", back_populates="product", cascade="all, delete-orphan")
    prices = relationship("ProductPrice", back_populates="product", cascade="all, delete-orphan")
    extra_fields = relationship("ProductExtra", back_populates="product", cascade="all, delete-orphan")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=product_tags)
    history = relationship("ProductHistory", back_populates="product", cascade="all, delete-orphan")

class ProductText(Base):
    __tablename__ = "product_texts"
    id = Column(Integer, primary_key=True, index=True)
    productId = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    language = Column(String(10), default="it")
    title = Column(String(255))
    description = Column(Text)
    docDescription = Column(Text)
    bulletPoints = Column(Text)
    seoAiText = Column(Text)
    
    product = relationship("Product", back_populates="texts")

class ProductPrice(Base):
    __tablename__ = "product_prices"
    id = Column(Integer, primary_key=True, index=True)
    productId = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    listName = Column(String(50), default="default")
    price = Column(Float, nullable=False)
    currency = Column(String(10), default="EUR")
    
    product = relationship("Product", back_populates="prices")

class ProductExtra(Base):
    __tablename__ = "product_extras"
    id = Column(Integer, primary_key=True, index=True)
    productId = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    key = Column(String(255), nullable=False)
    value = Column(Text)
    
    product = relationship("Product", back_populates="extra_fields")

class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(Integer, primary_key=True, index=True)
    productId = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    imageUrl = Column(Text, nullable=False)
    
    product = relationship("Product", back_populates="images")

class ProductHistory(Base):
    __tablename__ = "product_histories"
    id = Column(Integer, primary_key=True, index=True)
    productId = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    data = Column(JSON)
    createdAt = Column(DateTime, default=datetime.utcnow)
    
    product = relationship("Product", back_populates="history")

# --- STAGING SYSTEM (For incoming data from PDFs) ---

class StagingProduct(Base):
    __tablename__ = "staging_products"
    id = Column(Integer, primary_key=True, index=True)
    catalogId = Column(Integer, ForeignKey("catalogs.id", ondelete="CASCADE"))
    sku = Column(String(255), index=True)
    parentSku = Column(String(255), nullable=True)
    ean = Column(String(50), nullable=True)
    brand = Column(String(255), nullable=True)
    category = Column(String(255), nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    catalog = relationship("Catalog", back_populates="staging_products")
    texts = relationship("StagingProductText", back_populates="staging_product", cascade="all, delete-orphan")
    prices = relationship("StagingProductPrice", back_populates="staging_product", cascade="all, delete-orphan")
    extra_fields = relationship("StagingProductExtra", back_populates="staging_product", cascade="all, delete-orphan")
    images = relationship("StagingProductImage", back_populates="staging_product", cascade="all, delete-orphan")

class StagingProductText(Base):
    __tablename__ = "staging_product_texts"
    id = Column(Integer, primary_key=True, index=True)
    stagingProductId = Column(Integer, ForeignKey("staging_products.id", ondelete="CASCADE"))
    language = Column(String(10), default="it")
    title = Column(String(255))
    description = Column(Text)
    docDescription = Column(Text)
    bulletPoints = Column(Text)
    seoAiText = Column(Text)
    
    staging_product = relationship("StagingProduct", back_populates="texts")

class StagingProductPrice(Base):
    __tablename__ = "staging_product_prices"
    id = Column(Integer, primary_key=True, index=True)
    stagingProductId = Column(Integer, ForeignKey("staging_products.id", ondelete="CASCADE"))
    listName = Column(String(50), default="default")
    price = Column(Float, nullable=False)
    
    staging_product = relationship("StagingProduct", back_populates="prices")

class StagingProductExtra(Base):
    __tablename__ = "staging_product_extras"
    id = Column(Integer, primary_key=True, index=True)
    stagingProductId = Column(Integer, ForeignKey("staging_products.id", ondelete="CASCADE"))
    key = Column(String(255), nullable=False)
    value = Column(Text)
    
    staging_product = relationship("StagingProduct", back_populates="extra_fields")

class StagingProductImage(Base):
    __tablename__ = "staging_product_images"
    id = Column(Integer, primary_key=True, index=True)
    stagingProductId = Column(Integer, ForeignKey("staging_products.id", ondelete="CASCADE"))
    imageUrl = Column(Text, nullable=False)
    
    staging_product = relationship("StagingProduct", back_populates="images")
