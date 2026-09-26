"""backend/routes.py — FastAPI route handlers."""
from fastapi import APIRouter
from backend.models import Order
from backend.schemas import OrderOut

router = APIRouter()


@router.get("/api/orders", response_model=list[OrderOut])
def get_orders():
    """Return all orders."""
    # Implementation omitted for fixture purposes
    return []


@router.get("/api/customers/{id}/orders", response_model=list[OrderOut])
def get_customer_orders(id: int):
    """Return orders for a specific customer."""
    return list_orders(id)


def list_orders(cust_id: int) -> list[OrderOut]:
    """Query orders filtered by cust_id."""
    # Implementation omitted — uses cust_id
    return []
