"""In-memory queue of return records submitted from the storefront.

Demo-only: no database, no persistence across restarts. A single process-wide
list is fine here since the app runs as one uvicorn worker.
"""

from backend.models import ReturnRecord

_RETURNS: list[ReturnRecord] = []


def add_return(record: ReturnRecord) -> None:
    _RETURNS.append(record)


def list_returns() -> list[ReturnRecord]:
    return list(reversed(_RETURNS))


def get_return(return_id: str) -> ReturnRecord | None:
    return next((r for r in _RETURNS if r.id == return_id), None)


def update_defect_resolution(
    return_id: str, *, repair_successful: bool, repair_reason: str, route: str, status: str, status_label: str
) -> ReturnRecord | None:
    """Fill in a hardware-defect return's repair outcome once the Local
    Brand Center has answered whether resources were available — see
    decision.resolve_repair_decision, which produces these fields."""
    for i, r in enumerate(_RETURNS):
        if r.id == return_id and r.defect_branch is not None:
            defect = r.defect_branch.model_copy(
                update={"repair_successful": repair_successful, "repair_reason": repair_reason, "route": route}
            )
            updated = r.model_copy(update={"defect_branch": defect, "status": status, "status_label": status_label})
            _RETURNS[i] = updated
            return updated
    return None


def clear() -> None:
    _RETURNS.clear()
