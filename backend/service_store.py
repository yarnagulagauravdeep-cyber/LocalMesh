"""In-memory queues of Local Brand Center service-centre notifications.

Repair notifications are generated automatically whenever a storefront
return is classified as a hardware defect (see submit_return in routes.py).
Stock-check notifications are created when the storefront's "check local
brand center" action runs for a product that isn't in local stock. Both are
demo-only, no persistence across restarts — mirrors returns_store.py.
"""

from backend.models import RepairNotification, StockNotification

_REPAIRS: list[RepairNotification] = []
_STOCKS: list[StockNotification] = []


def add_repair(notification: RepairNotification) -> None:
    _REPAIRS.insert(0, notification)


def list_repairs() -> list[RepairNotification]:
    return list(_REPAIRS)


def get_repair(notification_id: str) -> RepairNotification | None:
    return next((r for r in _REPAIRS if r.id == notification_id), None)


def resolve_repair(notification_id: str, result: dict) -> RepairNotification | None:
    """Apply the Local Brand Center's yes/no answer to a pending repair
    notification, filling in its final fields in place."""
    for i, r in enumerate(_REPAIRS):
        if r.id == notification_id:
            updated = r.model_copy(update={**result, "pending": False})
            _REPAIRS[i] = updated
            return updated
    return None


def add_stock(notification: StockNotification) -> None:
    _STOCKS.insert(0, notification)


def list_stocks() -> list[StockNotification]:
    return list(_STOCKS)


def get_stock(notification_id: str) -> StockNotification | None:
    return next((s for s in _STOCKS if s.id == notification_id), None)


def resolve_stock(notification_id: str, result: dict) -> StockNotification | None:
    """Apply the Local Brand Center's yes/no answer to a pending stock-check
    notification, filling in its final fields in place."""
    for i, s in enumerate(_STOCKS):
        if s.id == notification_id:
            updated = s.model_copy(update={**result, "pending": False})
            _STOCKS[i] = updated
            return updated
    return None


def cancel_stock(notification_id: str) -> StockNotification | None:
    """Mark a resolved stock-check as cancelled — the customer declined the
    storefront's order-placement reconfirmation. Idempotent: a second cancel
    on an already-cancelled notification is a no-op, so the caller's stock
    release (see release_purchase) only ever fires once."""
    for i, s in enumerate(_STOCKS):
        if s.id == notification_id:
            if s.cancelled:
                return s
            updated = s.model_copy(update={"cancelled": True})
            _STOCKS[i] = updated
            return updated
    return None


def clear() -> None:
    _REPAIRS.clear()
    _STOCKS.clear()
