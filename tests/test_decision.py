"""Plain assert-based sanity checks for the demand and climate-fit rules.

Run with: python -m pytest tests/  (or: python tests/test_decision.py)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import decision


def test_demand_driven_warehouse():
    demand = decision.evaluate_demand("RAJ", "COOLER")
    assert demand["has_demand"] is True


def test_climate_fit_without_demand():
    demand = decision.evaluate_demand("BLR", "HEATER")
    climate = decision.evaluate_climate_fit("BLR", "HEATER")
    assert demand["has_demand"] is False
    assert climate["is_climate_fit"] is True


def test_central_hub_when_no_demand_and_no_climate_fit():
    demand = decision.evaluate_demand("RAJ", "HEATER")
    climate = decision.evaluate_climate_fit("RAJ", "HEATER")
    assert demand["has_demand"] is False
    assert climate["is_climate_fit"] is False

    routing = decision.decide_routing(demand, climate, "Jaipur", "Heater")
    assert routing["route"] == "central_hub"


def test_routing_prefers_demand_over_climate():
    demand = decision.evaluate_demand("RAJ", "COOLER")
    climate = decision.evaluate_climate_fit("RAJ", "COOLER")
    routing = decision.decide_routing(demand, climate, "Jaipur", "Cooler")
    assert routing["route"] == "local_warehouse"
    assert routing["driver"] == "demand"


def test_unseen_combo_falls_back_to_default_history():
    from backend import mock_data

    history = mock_data.get_purchase_history("DEL", "NONEXISTENT")
    assert history == [20, 20, 20, 20, 20, 20]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS: {name}")
