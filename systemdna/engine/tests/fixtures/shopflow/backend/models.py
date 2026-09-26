"""backend/models.py — SQLAlchemy ORM models."""
from sqlalchemy import Column, Integer, Numeric, String
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Order(Base):
    """SQLAlchemy ORM model for the orders table."""

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    cust_id = Column(Integer, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
