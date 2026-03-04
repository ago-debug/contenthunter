from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Float, Text, JSON
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class Catalog(Base):
    __tablename__ = "Catalog"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)
    imageFolderPath = Column(Text)
    status = Column(String(50), default="draft")
    lastListinoName = Column(Text)

    pdfs = relationship("CatalogPdf", back_populates="catalog", cascade="all, delete-orphan")
    stagingProducts = relationship("StagingProduct", back_populates="catalog", cascade="all, delete-orphan")

class CatalogPdf(Base):
    __tablename__ = "CatalogPdf"
    id = Column(Integer, primary_key=True, autoincrement=True)
    catalogId = Column(Integer, ForeignKey("Catalog.id", ondelete="CASCADE"))
    fileName = Column(String(255), nullable=False)
    filePath = Column(String(255), nullable=False)
    processed = Column(Boolean, default=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

    catalog = relationship("Catalog", back_populates="pdfs")

class StagingProduct(Base):
    __tablename__ = "StagingProduct"
    id = Column(Integer, primary_key=True, autoincrement=True)
    catalogId = Column(Integer, ForeignKey("Catalog.id", ondelete="CASCADE"))
    sku = Column(String(255), nullable=False, index=True)
    parentSku = Column(String(255))
    ean = Column(String(255))
    brand = Column(String(255))
    category = Column(String(255))
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    catalog = relationship("Catalog", back_populates="stagingProducts")
    texts = relationship("StagingProductText", back_populates="stagingProduct", cascade="all, delete-orphan")
    prices = relationship("StagingProductPrice", back_populates="stagingProduct", cascade="all, delete-orphan")
    extraFields = relationship("StagingProductExtra", back_populates="stagingProduct", cascade="all, delete-orphan")
    images = relationship("StagingProductImage", back_populates="stagingProduct", cascade="all, delete-orphan")

class StagingProductText(Base):
    __tablename__ = "StagingProductText"
    id = Column(Integer, primary_key=True, autoincrement=True)
    stagingProductId = Column(Integer, ForeignKey("StagingProduct.id", ondelete="CASCADE"))
    language = Column(String(10), default="it")
    title = Column(String(255))
    description = Column(Text)
    docDescription = Column(Text)
    bulletPoints = Column(Text)
    seoAiText = Column(Text)

    stagingProduct = relationship("StagingProduct", back_populates="texts")

class StagingProductPrice(Base):
    __tablename__ = "StagingProductPrice"
    id = Column(Integer, primary_key=True, autoincrement=True)
    stagingProductId = Column(Integer, ForeignKey("StagingProduct.id", ondelete="CASCADE"))
    listName = Column(String(50), default="default")
    price = Column(Float, nullable=False)
    currency = Column(String(10), default="EUR")

    stagingProduct = relationship("StagingProduct", back_populates="prices")

class StagingProductExtra(Base):
    __tablename__ = "StagingProductExtra"
    id = Column(Integer, primary_key=True, autoincrement=True)
    stagingProductId = Column(Integer, ForeignKey("StagingProduct.id", ondelete="CASCADE"))
    key = Column(String(255), nullable=False)
    value = Column(Text, nullable=False)

    stagingProduct = relationship("StagingProduct", back_populates="extraFields")

class StagingProductImage(Base):
    __tablename__ = "StagingProductImage"
    id = Column(Integer, primary_key=True, autoincrement=True)
    stagingProductId = Column(Integer, ForeignKey("StagingProduct.id", ondelete="CASCADE"))
    imageUrl = Column(Text, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

    stagingProduct = relationship("StagingProduct", back_populates="images")
