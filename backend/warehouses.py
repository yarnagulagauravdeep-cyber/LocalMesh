"""Local-warehouse stock, central-warehouse stock, and seasonal ad placement.

This is the single source of truth shared by all three front ends (the
SeasonMart storefront, the WareHub local-warehouse admin app, and the
LocalMesh ops dashboard) so none of them hard-code their own inventory or
ad numbers — they all read (and, for WareHub, write) through here.

Catalog
-------
Each entry is a product that also exists in the SeasonMart storefront
catalog (by name), tagged with the climate zones it's suited for and the
season it's associated with. A local warehouse's stock is a deterministic
4-6 item subset of this catalog, picked from the items that suit the
warehouse's area climate, each seeded with 10-15 units. The central
warehouse carries a larger deterministic buffer of every catalog item.
"name"/"qty"/"price" are the only fields a manager can override.
"""

import hashlib
import random

from backend import decision, mock_data

# name, category, climate code (subset of H/M/C), season tag, price (INR)
CATALOG = [
    ("Tower Air Cooler 40L", "cool", "H", "summer", 6499),
    ("Pedestal Fan 400 mm", "cool", "H", "summer", 1499),
    ("Portable Neck Fan", "cool", "H", "summer", 899),
    ("Polarised Sunglasses", "acc", "HM", "summer", 799),
    ("SPF 50 Sunscreen 100 ml", "care", "HM", "summer", 349),
    ("Wide-brim Sun Hat", "acc", "HM", "summer", 399),
    ("Cooling Towel", "acc", "H", "summer", 249),
    ("UV Protection Arm Sleeves", "acc", "H", "summer", 199),
    ("Auto-open Umbrella", "rain", "HMC", "monsoon", 449),
    ("Rain Jacket and Pants Set", "rain", "HMC", "monsoon", 899),
    ("Waterproof Gumboots", "rain", "HMC", "monsoon", 749),
    ("Anti-slip Rain Sandals", "rain", "HMC", "monsoon", 649),
    ("Waterproof Dry Bag 20 L", "rain", "HMC", "monsoon", 549),
    ("Waterproof Phone Pouch", "rain", "HMC", "monsoon", 199),
    ("Folding Clothes Drying Stand", "home", "HMC", "monsoon", 1299),
    ("Wool Blend Sweater", "cloth", "MC", "winter", 1299),
    ("Room Heater 2000 W", "heat", "C", "winter", 1899),
    ("Storage Water Heater 15 L", "heat", "C", "winter", 5999),
    ("Thermal Gloves", "acc", "C", "winter", 299),
    ("Thermal Innerwear Set", "cloth", "MC", "winter", 799),
    ("Electric Blanket", "heat", "C", "winter", 1799),
    ("Moisturising Body Lotion 400 ml", "care", "MC", "winter", 299),
    ("Hot Water Bottle", "home", "C", "winter", 349),
]

CLIMATE_ZONES = {
    "H": ["Hot"], "M": ["Moderate"], "C": ["Cold"],
    "HM": ["Hot", "Moderate"], "MC": ["Moderate", "Cold"], "HC": ["Hot", "Cold"],
    "HMC": ["Hot", "Moderate", "Cold"],
}

MIN_PRODUCT_TYPES = 4
MAX_PRODUCT_TYPES = 6
MIN_UNITS = 10
MAX_UNITS = 15

# Same four products advertise every city in a given season — only their
# on-page order (and so which ones land in the top vs. bottom ad slot)
# varies by city, as a stand-in for local demand ranking.
AD_SEASON_PRODUCTS = {
    "summer": ["Tower Air Cooler 40L", "Pedestal Fan 400 mm", "Portable Neck Fan", "Cooling Towel"],
    "monsoon": ["Auto-open Umbrella", "Rain Jacket and Pants Set", "Waterproof Gumboots", "Waterproof Dry Bag 20 L"],
    "winter": ["Room Heater 2000 W", "Wool Blend Sweater", "Electric Blanket", "Thermal Gloves"],
}

# Manager overrides (set via WareHub's "Override product" action), keyed by
# (area_code, original_product_name) -> {"name"?, "qty"?, "price"?}.
_overrides: dict[tuple[str, str], dict] = {}

# Units sold through SeasonMart checkout (POST /api/orders), keyed by
# product name. Subtracted from the central warehouse's buffer so placing
# an order actually moves the "available stock" figure the storefront
# shows, instead of that number being a static, order-independent display.
_purchased: dict[str, int] = {}


def _seeded_rng(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def _fits_area(entry, climate_zone: str) -> bool:
    return climate_zone in CLIMATE_ZONES[entry[2]]


def _base_local_products(area_code: str) -> list[dict]:
    """The deterministic, un-overridden 4-6 item / 10-15 unit stock list for
    one local warehouse, before any manager overrides are applied."""
    area = mock_data.get_area(area_code)
    if not area:
        return []
    pool = [c for c in CATALOG if _fits_area(c, area["climate_zone"])]
    if len(pool) < MIN_PRODUCT_TYPES:
        pool = list(CATALOG)

    pick_rng = _seeded_rng(f"localwh-pick|{area_code}")
    count = min(pick_rng.randint(MIN_PRODUCT_TYPES, MAX_PRODUCT_TYPES), len(pool))
    chosen = pick_rng.sample(pool, count)

    products = []
    for name, category, climate_code, season, price in chosen:
        qty_rng = _seeded_rng(f"localwh-qty|{area_code}|{name}")
        products.append({
            "name": name,
            "category": category,
            "climate_code": climate_code,
            "season": season,
            "qty": qty_rng.randint(MIN_UNITS, MAX_UNITS),
            "price": price,
            # Recent average monthly purchases for this product in this
            # area — lets WareHub flag the warehouse's least-in-demand item
            # instead of inventory being demand-blind.
            "recent_demand": decision.product_demand_strength(name, area_code),
        })
    return products


def local_warehouse_products(area_code: str) -> list[dict]:
    """Stock for one local warehouse, with manager overrides applied."""
    products = _base_local_products(area_code)
    for p in products:
        override = _overrides.get((area_code, p["name"]))
        if override:
            if "qty" in override:
                p["qty"] = override["qty"]
            if "price" in override:
                p["price"] = override["price"]
            if "name" in override:
                p["name"] = override["name"]
    return products


def warehouse_summary(area_code: str) -> dict | None:
    area = mock_data.get_area(area_code)
    if not area:
        return None
    products = local_warehouse_products(area_code)
    return {
        "area_code": area["code"],
        "area_name": area["name"],
        "products": products,
        "total_units": sum(p["qty"] for p in products),
    }


def all_warehouses() -> list[dict]:
    return [warehouse_summary(a["code"]) for a in mock_data.AREAS]


def central_stock(names: list[str] | None = None) -> dict[str, int]:
    """Central-hub buffer stock: a deterministic base quantity per product,
    minus whatever's been sold through checkout so far. Defaults to the
    curated catalog; pass explicit names to cover any product — including
    the ~60 SeasonMart items that aren't in the smaller curated catalog
    local warehouses stock from — since the formula (seeded by the
    product name alone) is just as deterministic for a name outside
    CATALOG as for one inside it."""
    target_names = names if names is not None else [name for name, *_rest in CATALOG]
    out = {}
    for name in target_names:
        rng = _seeded_rng(f"centralwh-qty|{name}")
        base = rng.randint(40, 150)
        out[name] = max(0, base - _purchased.get(name, 0))
    return out


def record_purchase(product: str, qty: int) -> None:
    """Record units sold through SeasonMart checkout, drawn down from the
    central warehouse's buffer (local-warehouse stock is managed separately
    by WareHub and isn't touched by a regular retail sale)."""
    if qty <= 0:
        return
    _purchased[product] = _purchased.get(product, 0) + qty


def release_purchase(product: str, qty: int) -> None:
    """Undo a previously recorded purchase — e.g. a customer declined the
    order-placement reconfirmation after a Local Brand Center confirmed a
    unit was available. Floored at zero so it can never go negative."""
    if qty <= 0:
        return
    _purchased[product] = max(0, _purchased.get(product, 0) - qty)


def purchased_for(names: list[str]) -> dict[str, int]:
    """Units sold so far for each of the given products — what the
    storefront subtracts from a product's own "units left" countdown so
    that figure moves too, not just the network stock total."""
    return {name: _purchased.get(name, 0) for name in names}


def clear_purchases() -> None:
    _purchased.clear()


def total_stock_by_product(names: list[str] | None = None) -> dict[str, int]:
    """Network-wide available stock per product: the central warehouse's
    buffer plus every local warehouse's units of that product, added
    together — the number SeasonMart shows as "available stock". Defaults
    to the curated catalog; pass explicit names to cover any product."""
    totals = dict(central_stock(names))
    for area in mock_data.AREAS:
        for p in local_warehouse_products(area["code"]):
            if p["name"] in totals:
                totals[p["name"]] = totals.get(p["name"], 0) + p["qty"]
    return totals


def apply_override(area_code: str, product: str, *, qty: int | None = None,
                    price: int | None = None, new_name: str | None = None) -> dict | None:
    """Manager override of a stocked product's properties. Replaces the old
    one-click "approve" step: a manager always explicitly sets what they
    want changed, never just rubber-stamps a default."""
    products = local_warehouse_products(area_code)
    match = next((p for p in products if p["name"] == product), None)
    if match is None:
        return None
    key = (area_code, product)
    override = dict(_overrides.get(key, {}))
    if qty is not None:
        override["qty"] = max(0, qty)
    if price is not None:
        override["price"] = max(0, price)
    if new_name:
        override["name"] = new_name
    _overrides[key] = override
    return warehouse_summary(area_code)


def clear_overrides() -> None:
    _overrides.clear()


def ad_order_for(season: str, area_code: str) -> list[str]:
    """Same product set for every city in a given season; order (and so top
    vs. bottom ad slot) is shuffled deterministically per (season, city) to
    stand in for different local demand rankings."""
    products = list(AD_SEASON_PRODUCTS.get(season, AD_SEASON_PRODUCTS["summer"]))
    rng = _seeded_rng(f"adorder|{season}|{area_code or 'DEFAULT'}")
    rng.shuffle(products)
    return products
