"""In-memory store of WareHub admin override decisions, keyed by return id.

Shared across every WareHub instance that talks to this backend (e.g. two
laptops on the same hotspot) so an override made on one device is reflected
everywhere — mirrors returns_store.py: demo-only, no persistence across
restarts.
"""

from backend.models import WarehouseDecision

_DECISIONS: dict[str, WarehouseDecision] = {}


def set_decision(return_id: str, decision: WarehouseDecision) -> None:
    _DECISIONS[return_id] = decision


def list_decisions() -> dict[str, WarehouseDecision]:
    return dict(_DECISIONS)


def clear() -> None:
    _DECISIONS.clear()
