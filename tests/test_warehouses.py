"""Sanity checks for shared warehouse/stock/ad data (backend/warehouses.py).

Run with: python -m pytest tests/
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import mock_data, warehouses


def test_each_local_warehouse_has_4_to_6_product_types_at_10_to_15_units():
    for area in mock_data.AREAS:
        products = warehouses.local_warehouse_products(area["code"])
        assert 4 <= len(products) <= 6, area["code"]
        names = [p["name"] for p in products]
        assert len(names) == len(set(names)), "no duplicate product types"
        for p in products:
            assert 10 <= p["qty"] <= 15, (area["code"], p)


def test_warehouse_stock_is_deterministic():
    a = warehouses.local_warehouse_products("CHE")
    b = warehouses.local_warehouse_products("CHE")
    assert a == b


def test_total_stock_equals_central_plus_every_local_warehouse():
    warehouses.clear_overrides()
    totals = warehouses.total_stock_by_product()
    central = warehouses.central_stock()
    for name, qty in central.items():
        expected = qty
        for area in mock_data.AREAS:
            expected += sum(p["qty"] for p in warehouses.local_warehouse_products(area["code"]) if p["name"] == name)
        assert totals[name] == expected, name


def test_override_changes_qty_without_touching_other_products():
    warehouses.clear_overrides()
    before = warehouses.warehouse_summary("CHE")
    target = before["products"][0]["name"]
    updated = warehouses.apply_override("CHE", target, qty=11)
    changed = next(p for p in updated["products"] if p["name"] == target)
    assert changed["qty"] == 11
    others_before = [p for p in before["products"] if p["name"] != target]
    others_after = [p for p in updated["products"] if p["name"] != target]
    assert others_before == others_after
    warehouses.clear_overrides()


def test_ads_same_products_every_city_different_order():
    products_a = set(warehouses.ad_order_for("summer", "RAJ"))
    products_b = set(warehouses.ad_order_for("summer", "SHM"))
    assert products_a == products_b == set(warehouses.AD_SEASON_PRODUCTS["summer"])

    orders = {area["code"]: tuple(warehouses.ad_order_for("summer", area["code"])) for area in mock_data.AREAS}
    assert len(set(orders.values())) > 1, "ad order should vary by city"


def test_ads_same_city_same_order_every_time():
    assert warehouses.ad_order_for("winter", "DEL") == warehouses.ad_order_for("winter", "DEL")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS: {name}")
