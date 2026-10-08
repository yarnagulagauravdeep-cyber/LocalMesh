"""Ad-placement eligibility: decides whether a catalog product should be
advertised at all, and in which cities, following a fixed funnel —

    bought by many users -> clean return record -> fits current season
    -> (per city) fits the local climate -> serve ad there

Reuses the same demand engine as return routing (decision.py) and the same
climate catalog as warehouse stocking (warehouses.py) so the three readings
of "does this product fit here" never disagree with each other.
"""

from backend import decision, mock_data, warehouses

# How many of the mock cities must show demand (decision.DEMAND_THRESHOLD or
# rising, see decision._demand_from_counts) before a product counts as
# "bought by many users" network-wide, not just popular in one city.
BROAD_DEMAND_MIN_CITIES = 5

SEASON_LABELS = {"summer": "Summer", "monsoon": "Monsoon", "winter": "Winter"}

# Mirrors the storefront's own CAT dict (user/app.js) so category labels
# read the same on SeasonMart and on this ops dashboard.
CATEGORY_LABELS = {
    "cool": "Cooling",
    "heat": "Heating",
    "rain": "Weather Gear",
    "cloth": "Clothing",
    "acc": "Accessories",
    "care": "Personal Care",
    "home": "Home",
}


def get_catalog_product(name: str) -> dict | None:
    for entry_name, category, climate_code, season, price in warehouses.CATALOG:
        if entry_name == name:
            return {
                "name": entry_name,
                "category": category,
                "climate_code": climate_code,
                "season": season,
                "price": price,
            }
    return None


def list_catalog() -> list[dict]:
    return [
        {"name": name, "category": category, "climate_code": climate_code, "season": season, "price": price}
        for name, category, climate_code, season, price in warehouses.CATALOG
    ]


def _demand_by_area(product_name: str) -> dict[str, dict]:
    """Per-area demand reading for one product, keyed by area code — reused
    by both the broad "bought by many" gate and each city's own confidence
    score below, so neither recomputes against a different number."""
    return {
        area["code"]: decision._demand_from_counts(
            area["code"], product_name, mock_data.generate_purchase_history(f"{product_name}|{area['code']}")
        )
        for area in mock_data.AREAS
    }


def _demand_gate(product_name: str, area_demand: dict[str, dict]) -> dict:
    cities_with_demand = [
        mock_data.get_area(code)["name"] for code, demand in area_demand.items() if demand["has_demand"]
    ]

    passed = len(cities_with_demand) >= BROAD_DEMAND_MIN_CITIES
    total = len(mock_data.AREAS)
    if passed:
        reason = (
            f"Shows current demand in {len(cities_with_demand)} of {total} cities "
            f"({', '.join(cities_with_demand)}), meeting the broad-demand bar of "
            f"{BROAD_DEMAND_MIN_CITIES} cities."
        )
    else:
        reason = (
            f"Shows current demand in only {len(cities_with_demand)} of {total} cities, "
            f"below the broad-demand bar of {BROAD_DEMAND_MIN_CITIES} cities."
        )
    return {
        "passed": passed,
        "cities_with_demand": len(cities_with_demand),
        "total_cities": total,
        "reason": reason,
    }


def _return_reason_gate(product_name: str, returns: list) -> dict:
    # Deterministic mock baseline (see mock_data.generate_return_reason_counts)
    # so a product with no real returns yet still shows a believable
    # defect/dissatisfaction split instead of an always-zero 0/0. Real
    # returns submitted through the storefront count on top of this.
    baseline = mock_data.generate_return_reason_counts(product_name)
    defect_count = baseline["defect"]
    dissatisfaction_count = baseline["dissatisfaction"]
    needle = product_name.strip().lower()
    for r in returns:
        if r.product.strip().lower() != needle:
            continue
        if r.classification.label == "hardware_defect":
            defect_count += 1
        else:
            dissatisfaction_count += 1

    passed = defect_count <= dissatisfaction_count
    if defect_count > dissatisfaction_count:
        leading = "defects"
        reason = (
            f"Hardware defects lead returns ({defect_count} vs {dissatisfaction_count} "
            "dissatisfaction returns) — a quality issue, so it should not be advertised."
        )
    else:
        leading = "dissatisfaction"
        reason = (
            f"Dissatisfaction leads returns ({dissatisfaction_count} vs {defect_count} "
            "hardware-defect returns) — not a quality problem, safe to advertise."
        )
    return {
        "passed": passed,
        "defect_count": defect_count,
        "dissatisfaction_count": dissatisfaction_count,
        "leading": leading,
        "reason": reason,
    }


def _season_gate(product_season: str, requested_season: str) -> dict:
    passed = product_season == requested_season
    product_label = SEASON_LABELS.get(product_season, product_season)
    requested_label = SEASON_LABELS.get(requested_season, requested_season)
    if passed:
        reason = f"{product_label} gear matches the selected {requested_label} season."
    else:
        reason = f"This item is tagged for {product_label}, not the selected {requested_label} season."
    return {"passed": passed, "product_season": product_season, "requested_season": requested_season, "reason": reason}


# --- Confidence: each gate's own strength as a 0-1 ratio (not just its
# pass/fail bit), so "how confident" can vary even among products that all
# pass, or all fail, the same gate. ---


def _return_strength(return_gate: dict) -> float:
    if return_gate["leading"] == "none":
        return 1.0
    total = return_gate["defect_count"] + return_gate["dissatisfaction_count"]
    return return_gate["dissatisfaction_count"] / total


def _season_strength(season_gate: dict) -> float:
    return 1.0 if season_gate["passed"] else 0.0


def _city_demand_strength(demand: dict) -> float:
    if demand["has_demand"]:
        return 1.0
    return max(0.0, min(demand["recent_avg"] / decision.DEMAND_THRESHOLD, 1.0))


def evaluate_ad_eligibility(product_name: str, requested_season: str, returns: list) -> dict | None:
    catalog_product = get_catalog_product(product_name)
    if catalog_product is None:
        return None

    area_demand = _demand_by_area(product_name)
    demand_gate = _demand_gate(product_name, area_demand)
    return_gate = _return_reason_gate(product_name, returns)
    season_gate = _season_gate(catalog_product["season"], requested_season)

    eligible = demand_gate["passed"] and return_gate["passed"] and season_gate["passed"]

    return_strength = _return_strength(return_gate)
    season_strength = _season_strength(season_gate)
    demand_strength_overall = demand_gate["cities_with_demand"] / demand_gate["total_cities"]
    confidence = round(((demand_strength_overall + return_strength + season_strength) / 3) * 100)

    suited_zones = warehouses.CLIMATE_ZONES[catalog_product["climate_code"]]
    cities = []
    for area in mock_data.AREAS:
        climate_fit = area["climate_zone"] in suited_zones
        # Per-city confidence: this city's own demand + climate fit, blended
        # with the product-wide return and season gates — so two cities with
        # the same climate fit can still carry different confidence when
        # their local demand differs.
        city_demand_strength = _city_demand_strength(area_demand[area["code"]])
        climate_strength = 1.0 if climate_fit else 0.0
        city_confidence = round(
            ((city_demand_strength + climate_strength + return_strength + season_strength) / 4) * 100
        )
        cities.append(
            {
                "area_code": area["code"],
                "area_name": area["name"],
                "climate_zone": area["climate_zone"],
                "climate_fit": climate_fit,
                "ad_eligible": eligible and climate_fit,
                "confidence": city_confidence,
            }
        )

    return {
        "product": catalog_product["name"],
        "category": catalog_product["category"],
        "season": catalog_product["season"],
        "climate_code": catalog_product["climate_code"],
        "gates": {
            "bought_by_many": demand_gate,
            "return_reason": return_gate,
            "season_fit": season_gate,
        },
        "eligible": eligible,
        "confidence": confidence,
        "cities": cities,
    }


SEASONS = ["summer", "monsoon", "winter"]
CLIMATES = ["Hot", "Moderate", "Cold"]


def category_season_climate_breakdown() -> dict:
    """Cross-tab of the shared catalog (warehouses.CATALOG — the same data
    WareHub stocks from and the Ads tab above reads): for each category, how
    many products target each season and fit each climate zone. Tallied
    directly from the real catalog entries (not randomized), so it can never
    disagree with what's actually in the catalog.
    """
    by_category: dict[str, dict] = {}
    for name, category, climate_code, season, price in warehouses.CATALOG:
        entry = by_category.setdefault(
            category,
            {
                "category": category,
                "category_name": CATEGORY_LABELS.get(category, category.title()),
                "total": 0,
                "by_season": {s: 0 for s in SEASONS},
                "by_climate": {c: 0 for c in CLIMATES},
            },
        )
        entry["total"] += 1
        entry["by_season"][season] = entry["by_season"].get(season, 0) + 1
        for zone in warehouses.CLIMATE_ZONES[climate_code]:
            entry["by_climate"][zone] += 1

    categories = sorted(by_category.values(), key=lambda c: -c["total"])
    return {"categories": categories, "seasons": SEASONS, "climates": CLIMATES}
