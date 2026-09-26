"""backend/schemas.py — Pydantic response schemas."""
from pydantic import BaseModel


class OrderOut(BaseModel):
    """Pydantic schema for serialising an Order to the API response."""

    id: int
    cust_id: int
    amount: float
