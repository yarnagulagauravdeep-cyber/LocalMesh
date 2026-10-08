import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from backend import ads, decision, decisions_store, mock_data, returns_store, service_store, warehouses
from backend.models import (
    AdEligibilityResponse,
    AdPlacement,
    AreaOption,
    CatalogProduct,
    CategoryAnalysisResponse,
    CategoryOption,
    Classification,
    ClassifyRequest,
    DefectBranch,
    MetaResponse,
    OrderRequest,
    ProcessReviewRequest,
    ProcessReviewResponse,
    RepairNotification,
    RepairResolveRequest,
    ReturnListItem,
    ReturnRecord,
    ReturnSubmission,
    StockCheckRequest,
    StockNotification,
    StockResolveRequest,
    StockSummary,
    WarehouseDecision,
    WarehouseDecisionRequest,
    WarehouseOverrideRequest,
    WarehouseSummary,
)

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/meta", response_model=MetaResponse)
def meta():
    return MetaResponse(
        categories=[CategoryOption(code=c["code"], name=c["name"]) for c in mock_data.CATEGORIES],
        areas=[
            AreaOption(code=a["code"], name=a["name"], pincode=a["pincode"], climate_zone=a["climate_zone"])
            for a in mock_data.AREAS
        ],
    )


@router.post("/classify", response_model=Classification)
def classify_review(body: ClassifyRequest, request: Request):
    """Classify-only step, used by the storefront to decide whether to ask the
    customer for a refund/replacement preference before finalizing a return."""
    classifier = request.app.state.classifier
    label, confidence = classifier.predict(body.review_text)
    return Classification(label=label, confidence=confidence)


@router.post("/process-review", response_model=ProcessReviewResponse)
def process_review(body: ProcessReviewRequest, request: Request):
    classifier = request.app.state.classifier
    label, confidence = classifier.predict(body.review_text)
    classification = Classification(label=label, confidence=confidence)

    area = mock_data.get_area(body.area_code)
    category = mock_data.get_category(body.category_code)

    if label == "hardware_defect":
        defect = decision.evaluate_defect_resolution(category["name"], body.area_code)
        return ProcessReviewResponse(classification=classification, defect_branch=DefectBranch(**defect))

    demand = decision.evaluate_demand(body.area_code, body.category_code)
    climate = decision.evaluate_climate_fit(body.area_code, body.category_code)
    routing = decision.decide_routing(demand, climate, area["name"], category["name"])

    return ProcessReviewResponse(
        classification=classification,
        dissatisfaction_branch={
            "demand": demand,
            "climate": climate,
            "decision": routing,
        },
    )


@router.post("/returns", response_model=ReturnRecord)
def submit_return(body: ReturnSubmission, request: Request):
    classifier = request.app.state.classifier
    result = decision.process_return(
        classifier,
        body.product,
        body.season,
        body.pincode,
        body.review_text,
        body.preferred_resolution,
        body.suited_climates,
    )
    area = result["area"]

    record = ReturnRecord(
        id=uuid.uuid4().hex[:8],
        submitted_at=datetime.now(timezone.utc).isoformat(),
        product=body.product,
        season=body.season,
        pincode=body.pincode,
        area_code=area["code"],
        area_name=area["name"],
        area_climate_zone=area["climate_zone"],
        review_text=body.review_text,
        classification=result["classification"],
        defect_branch=result["defect_branch"],
        dissatisfaction_branch=result["dissatisfaction_branch"],
        status=result["status"],
        status_label=result["status_label"],
    )
    returns_store.add_return(record)

    # A hardware-defect return also files a pending repair notification at
    # the Local Brand Center, linked back to this return. It sits there
    # until staff answer whether resources are available — see
    # /service/repairs/{id}/resolve below — which also updates this return's
    # status once answered.
    if record.defect_branch is not None:
        service_store.add_repair(
            RepairNotification(
                id=uuid.uuid4().hex[:8],
                submitted_at=record.submitted_at,
                return_id=record.id,
                product=body.product,
                area_code=area["code"],
                area_name=area["name"],
                route_reason="Awaiting local brand center confirmation.",
            )
        )

    return record


@router.get("/returns", response_model=list[ReturnListItem])
def returns_queue():
    return [
        ReturnListItem(
            id=r.id,
            product=r.product,
            area_name=r.area_name,
            area_climate_zone=r.area_climate_zone,
            submitted_at=r.submitted_at,
            status=r.status,
            status_label=r.status_label,
            season=r.season,
            pincode=r.pincode,
            review_text=r.review_text,
        )
        for r in returns_store.list_returns()
    ]


@router.delete("/returns")
def clear_returns():
    returns_store.clear()
    decisions_store.clear()
    return {"cleared": True}


@router.get("/returns/decisions", response_model=dict[str, WarehouseDecision])
def list_warehouse_decisions():
    """WareHub's admin-override decisions (return id -> destination), shared
    across every WareHub instance pointed at this backend so an override made
    on one device shows up on all of them. Registered before the
    /returns/{return_id} route below so "decisions" isn't swallowed as an id."""
    return decisions_store.list_decisions()


@router.get("/returns/{return_id}", response_model=ReturnRecord)
def return_detail(return_id: str):
    record = returns_store.get_return(return_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Return not found")
    return record


@router.post("/returns/{return_id}/decision", response_model=WarehouseDecision)
def set_warehouse_decision(return_id: str, body: WarehouseDecisionRequest):
    if returns_store.get_return(return_id) is None:
        raise HTTPException(status_code=404, detail="Return not found")
    decision_record = WarehouseDecision(dest=body.dest, at=datetime.now(timezone.utc).isoformat())
    decisions_store.set_decision(return_id, decision_record)
    return decision_record


@router.get("/warehouses", response_model=list[WarehouseSummary])
def list_warehouses():
    """Every local warehouse (one per area), each stocking 4-6 product
    types at 10-15 units — the shared data WareHub, SeasonMart and the
    ops dashboard all read from."""
    return warehouses.all_warehouses()


@router.get("/warehouses/{area_code}", response_model=WarehouseSummary)
def warehouse_detail(area_code: str):
    summary = warehouses.warehouse_summary(area_code)
    if summary is None:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return summary


@router.post("/warehouses/{area_code}/override", response_model=WarehouseSummary)
def override_warehouse_product(area_code: str, body: WarehouseOverrideRequest):
    """Manager override of a stocked product's name/qty/price. There is no
    "approve" endpoint — a manager always explicitly states what to change."""
    summary = warehouses.apply_override(
        area_code, body.product, qty=body.qty, price=body.price, new_name=body.new_name
    )
    if summary is None:
        raise HTTPException(status_code=404, detail="Warehouse or product not found")
    return summary


@router.delete("/warehouses/overrides")
def clear_warehouse_overrides():
    warehouses.clear_overrides()
    return {"cleared": True}


@router.get("/stock", response_model=StockSummary)
def stock_summary(products: str = ""):
    """Network-wide stock: the central warehouse's buffer, plus
    totals = central + every local warehouse's units, per product — the
    "available stock" figure SeasonMart shows on each product card.
    Defaults to the curated catalog (~23 items); pass a comma-separated
    `products` list (e.g. SeasonMart's full ~80-item catalog) to get a
    figure for every one of them, not just the curated subset."""
    names = [p for p in (name.strip() for name in products.split(",")) if p] or None
    return StockSummary(
        central=warehouses.central_stock(names),
        totals=warehouses.total_stock_by_product(names),
        purchased=warehouses.purchased_for(names) if names else {},
    )


@router.post("/orders", response_model=StockSummary)
def place_order(body: OrderRequest):
    """Checkout: draws each ordered item down from the central warehouse's
    buffer, so "available stock" actually moves when a customer buys,
    instead of staying a static, order-independent number. Returns the
    updated stock summary so the storefront can refresh immediately."""
    for item in body.items:
        warehouses.record_purchase(item.product, item.qty)
    return StockSummary(central=warehouses.central_stock(), totals=warehouses.total_stock_by_product())


@router.delete("/orders")
def clear_orders():
    warehouses.clear_purchases()
    return {"cleared": True}


@router.get("/ads", response_model=AdPlacement)
def ad_placement(season: str = "summer", area_code: str = ""):
    """Same product set for a season everywhere; order (so which products
    land in the top vs. bottom ad slot) is shuffled per city."""
    return AdPlacement(season=season, area_code=area_code, products=warehouses.ad_order_for(season, area_code))


@router.get("/catalog", response_model=list[CatalogProduct])
def catalog():
    """The full shared product catalog — every item any of the three front
    ends can stock or advertise."""
    return ads.list_catalog()


@router.get("/ads/eligibility", response_model=AdEligibilityResponse)
def ads_eligibility(product: str, season: str = "summer"):
    """Runs the four-gate ad-placement funnel (broad demand, clean return
    record, season fit, per-city climate fit) for one catalog product and
    reports which cities it's eligible to be advertised in."""
    result = ads.evaluate_ad_eligibility(product, season, returns_store.list_returns())
    if result is None:
        raise HTTPException(status_code=404, detail="Product not found in catalog")
    return result


@router.get("/analysis/categories", response_model=CategoryAnalysisResponse)
def category_analysis():
    """Cross-tab of the shared catalog: for each category, how many
    products target each season and fit each climate zone — tallied
    directly from warehouses.CATALOG (the same data WareHub stocks from and
    the Ads tab reads), so it can never disagree with the real catalog."""
    return ads.category_season_climate_breakdown()


@router.get("/service/repairs", response_model=list[RepairNotification])
def service_repairs():
    """Local Brand Center — repair-notification queue: entries filed
    automatically whenever a storefront return is classified as a hardware
    defect (see submit_return above), most recent first. Each sits pending
    until staff resolve it below."""
    return service_store.list_repairs()


@router.post("/service/repairs/{notification_id}/resolve", response_model=RepairNotification)
def resolve_repair_notification(notification_id: str, body: RepairResolveRequest):
    """Local Brand Center's one-tap decision on a pending repair
    notification: are resources (a technician + parts) available? Fills in
    the notification's final route/message, and — when this repair is
    linked to a return — updates that return's status too, so the
    storefront's own polling picks up the outcome."""
    notification = service_store.get_repair(notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Repair notification not found")
    result = decision.resolve_repair_decision(notification.product, notification.area_code, body.available)
    updated = service_store.resolve_repair(notification_id, result)
    if notification.return_id:
        status = "defect_repaired" if result["route"] == "local_warehouse" else "defect_hub"
        status_label = "Repaired: Local Warehouse" if status == "defect_repaired" else "Central Warehouse: Deep Repair"
        returns_store.update_defect_resolution(
            notification.return_id,
            repair_successful=result["repair_successful"],
            repair_reason=result["repair_reason"],
            route=result["route"],
            status=status,
            status_label=status_label,
        )
    return updated


@router.post("/service/stock-check", response_model=StockNotification)
def service_stock_check(body: StockCheckRequest):
    """Local Brand Center — out-of-stock-notification intake. Files a
    pending entry in the stock-check queue the moment a shopper searches for
    an out-of-stock item on the storefront (origin="storefront"); it sits
    there until staff resolve it below with a simple yes/no."""
    area = mock_data.get_area(body.area_code)
    if area is None:
        raise HTTPException(status_code=404, detail="Area not found")
    notification = StockNotification(
        id=uuid.uuid4().hex[:8],
        submitted_at=datetime.now(timezone.utc).isoformat(),
        product=body.product,
        area_code=body.area_code,
        area_name=area["name"],
        origin=body.origin,
        route_reason="Awaiting local brand center confirmation.",
    )
    service_store.add_stock(notification)
    return notification


@router.get("/service/stock-checks", response_model=list[StockNotification])
def service_stock_checks():
    """Local Brand Center — stock-check queue, most recent first."""
    return service_store.list_stocks()


@router.get("/service/stock-checks/{notification_id}", response_model=StockNotification)
def service_stock_check_detail(notification_id: str):
    """Single stock-check notification — polled by the storefront while a
    request is pending, so it can show the local brand center's answer the
    moment staff resolve it."""
    notification = service_store.get_stock(notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Stock check not found")
    return notification


@router.post("/service/stock-checks/{notification_id}/resolve", response_model=StockNotification)
def resolve_stock_notification(notification_id: str, body: StockResolveRequest):
    """Local Brand Center's one-tap decision on a pending stock-check
    notification: is the product available? Only a storefront-origin hit
    that resolves "available" actually draws the unit down from the
    network, exactly like a normal checkout."""
    notification = service_store.get_stock(notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Stock check not found")
    result = decision.resolve_stock_decision(notification.product, notification.area_code, body.available)
    updated = service_store.resolve_stock(notification_id, result)
    if notification.origin == "storefront" and result["route"] == "dispatch":
        warehouses.record_purchase(notification.product, 1)
    return updated


@router.post("/service/stock-checks/{notification_id}/cancel", response_model=StockNotification)
def cancel_stock_notification(notification_id: str):
    """The customer declined the storefront's order-placement reconfirmation
    after this resolved to "dispatch" — releases the unit that was drawn
    down from the network back, without discarding the notification."""
    notification = service_store.get_stock(notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Stock check not found")
    if notification.origin == "storefront" and notification.route == "dispatch" and not notification.cancelled:
        warehouses.release_purchase(notification.product, 1)
    return service_store.cancel_stock(notification_id)


@router.delete("/service/notifications")
def clear_service_notifications():
    service_store.clear()
    return {"cleared": True}
