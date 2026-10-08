# LocalMesh — Screen Summary (Product Specification)

## Overview
LocalMesh is a multi-user e-commerce and operations platform that treats returned or faulty items as local inventory when sensible. It surfaces and routes returns, powers local-first fulfilment, runs ad-eligibility checks by region, and provides per-warehouse and brand-service operator consoles. Primary users: shoppers, local warehouse staff, WareHub operators (central ops), and brand-service technicians.

## Look & Feel
Layout: responsive, three-tier layout on desktop (left navigation, central canvas, right contextual panel). Tablet reflows to two columns; mobile collapses to a single column with a bottom navigation bar. Controls use large tappable targets (>44px) and readable fonts.

Theme: neutral, high-contrast UI with a primary accent color (configurable) for status and call-to-action elements. Dense lists use compact rows; detail panels expand as modals or slide-over drawers on smaller screens.

Maps: interactive Leaflet map component embedded where geographic context is required (Ads tab). Map supports pan/zoom, city markers, and simple choropleth overlays (climate suitability).

Live data: queues and metric tiles update in near-real-time (push or short-poll). Loading and error states are clearly shown with retry affordances.

## Users, Accounts & Roles
All users sign up or are invited. New public signups receive the least-privileged role (Customer). Elevated roles are granted only by an Admin.

| Role | Can see | Can do |
|---|---|---|
| Customer | Their own orders, products, return form | Browse shop, place orders, submit returns with reason & optional review |
| WarehouseOperator | Warehouse-specific inventory, returns for their warehouse, transfers | Inspect/accept returns, schedule local transfers, mark capacity-used, adjust local stock condition |
| WareHubOperator | Main ops console (root /) with all warehouses & returns, Ads/Analysis tabs | Inspect/override routing decisions, run ad checks, view catalog analysis |
| BrandOperator | Brand center data (repairs, stock for brand) | Create/fulfil repair jobs, mark repair verification, dispatch to local WH or escalate to hub |
| Admin | All screens and settings | Grant roles, manage partner registry, adjust gate thresholds |

### Sign-up / Login flows
- Sign up: email, display name, password, optional organization. After signup customers land in the Shop. Admins create operator accounts: invitation link opens a flow to set password and role.
- Login: email + password. Forgot password flow lets user request an in-app reset flow (handled by the platform).
- On first login for operator roles, the user sees an onboarding modal describing their workspace (warehouse or brand center).

## Screens & Core Interactions
Each screen description lists what the user does, the product response, resulting UI, empty states, and failure paths.

### Main WareHub Ops Console — `/` (Returns Intake Terminal with 3 tabs)
Top-level landing for central ops; defaults to the Returns Queue tab.

#### Returns Queue (tab)
- User action: Open a live feed; filter by Hot / Moderate / Cold and search by product, pincode, or return ID; click a row.
- Product response: Streamed list sorted newest-first. Each row shows product, customer zone, preliminary reason classification (Dissatisfaction / Hardware defect), current routing recommendation (store locally / send to hub / send to repair), and a quick action menu (View details / Override routing / Assign to warehouse).
- Resulting screen: Clicking a row opens a slide-over with routing analysis (visual gate pass/fail indicators for Demand, Climate, Capacity), NLP-extracted reason excerpt, repair notes if defect, and an audit trail of decisions. An operator may Accept recommended routing or Override with mandatory reason.
- Empty state: "No returns in this filter" with a suggested switch to All or change date range.
- Failure path: If a routing calculation times out, a banner shows "Unable to compute routing — try again" and the row shows "Routing pending". Override is still allowed but must include manual destination.

#### Ads (tab)
- User action: Select a product and a calendar season from dropdowns; click "Evaluate".
- Product response: Sequential gate checks execute (Purchase volume, Return-reason balance, Season fit, Climate fit). Each gate displays pass/fail with metric used (counts/percentages) and a short explanation. A Leaflet map on the right overlays city markers colored by climate-fit score; clicking a city shows local demand snapshot and whether the product is ad-eligible there.
- Resulting screen: A summary card shows final eligibility: "Eligible" with list of cities, or "Suppressed" with the gate(s) that failed.
- Empty state: When no demand/history exists, every gate shows "insufficient data" and the result is "Suppressed — insufficient data".
- Failure path: If climate snapshot cannot be retrieved for a city, that city is shown disabled with tooltip "Climate data unavailable".

#### Analysis (tab)
- User action: Choose category filter(s), season(s), and climate zone(s); click "Refresh".
- Product response: Presents a pivot-style breakdown: product counts aggregated by Category × Season × Climate zone. Rows are categories; columns are seasons; each cell contains count and percent of catalog for that climate zone. Cells are clickable to open a list of products contributing to that cell.
- Resulting screen: Table with sortable columns and a right-hand mini-chart that visualizes a selected cell's distribution.
- Empty state: No products match filters → show guidance to broaden filters.
- Failure path: If aggregation fails, a Retry button appears and the previous view remains.

### SeasonMart Storefront — `/shop/`
- User action: Browse categories, apply filters (category, price, stock availability, rating), open a product detail, and submit a return from order history.
- Product response: Listings highlight local-pool availability for the user's pincode (badge "Available locally — fast delivery"). Product page shows price, stock counts (local vs. hub), ratings, and a "Request Return" button for eligible orders.
- Return submission flow: Customer selects order & item, chooses reason from structured options and optional free-text review, and indicates desired outcome (Refund / Replacement). On submit the app shows a confirmation and a return ID; the return enters the Returns Intake Queue with initial NLP classification.
- Empty state: If storefront is empty for category, shows "No items found" and recommendations.
- Failure path: If submission fails (connectivity), the screen shows a persistent auto-save draft and a retry button.

### WareHub Local Warehouse Admin — `/warehouse/`
Per-warehouse dashboard, contextually scoped to the selected warehouse (e.g., Chennai).

Tabs: Returns queue, Inventory, Transfers.

Dashboard top tiles: Today's returns (count), Sent-to-far-warehouse (count), Low-stock (count of SKUs below threshold), Capacity-used (%).

Tile interaction: clicking a tile filters the main list to that category.

- Returns queue tab: Similar to Main Returns Queue but scoped to returns routed to this warehouse. Operators can Inspect, Grade condition, Accept into local pool, Initiate transfer out, or Flag for repair.
  - Empty state: "No returns routed here today".
  - Failure path: When inventory update fails, show an error and allow manual reconciliation entry.
- Inventory tab: lists local-pool SKUs with condition breakdowns (new / repaired / open-box), on-hand counts, and minimum thresholds. Operators can mark items to be transferred out when capacity is low.
- Transfers tab: Pending and historical transfers to/from other warehouses with ETA estimates (system-calculated). Operators can mark a transfer dispatched or received.

### Local Brand Center — `/brandcenter/`
Service-centre UI for hardware-defect returns.

Tabs: Repair, Stock.

#### Repair tab
- User action: See list of incoming defect returns assigned to this center. Select item to view repair checklist.
- Product response: For each repair job, show required certification level, assigned technician, diagnostic notes, and pass/fail quality check step. Technician marks steps complete; on successful verification the job is marked "Repaired" and the unit is queued for routing gates. If repair fails or no certified technician is available, operator marks "Escalate to hub".
- Empty state: "No repair jobs assigned".
- Failure path: If verification check fails due to missing certification, operator must record reason; item is automatically flagged for escalation.

#### Stock tab
Shows brand-specific local stock counts and pending stock-check requests from warehouses. Operators can mark stock as available/unavailable and dispatch to a warehouse or customer.

## Features (subsystems and concrete interactions)
Each feature below states user action → product response → resulting UI + empty/failed states.

### Return Reason Classifier (NLP)
- Action: When a return is submitted, the system runs an NLP classification over the customer's reason and review text.
- Product response: Produces a label: Dissatisfaction or Hardware defect, plus an excerpt and confidence score. Displayed in queue rows and in the return detail panel.
- Result: Labeling determines downstream flow (dissatisfaction → routing gates; defect → repair/refund workflow).
- Empty state: Short or missing free-text → classifier returns "insufficient text" and confidence is low; operator is prompted to review.
- Failure path: If classification fails, the return is placed in a "Needs review" queue for human triage.

### Return Routing Engine (Demand / Climate / Capacity gates)
- Action: For dissatisfaction-labelled returns, the engine evaluates three gates in order: Demand, Climate, Capacity.
- Product response:
  - Demand gate: checks demand history for the customer zone; result shows order volume metric and pass/fail.
  - Climate gate: evaluates product usage profile vs. local climate snapshot; shows a simple pass/fail with rationale.
  - Capacity gate: checks target local warehouse free space. If capacity < threshold, engine selects lowest-demand held item for transfer to free space and re-evaluates.
- Result: If all pass, item is recorded into the local inventory pool for that warehouse. If demand and climate fail → route to central hub. Capacity failure triggers transfer actions.
- Empty state: If demand history absent, Demand gate shows "no history" and routing defaults to Climate gate; if still indeterminate, item is sent to hub unless operator overrides.
- Failure path: If capacity or transfer actions cannot be scheduled (no available nearby warehouses), the item is marked "Awaiting capacity" and manual operator action is required.

### Hardware Defect Workflow (BrandOperator)
- Action: Customer selects Refund or Replacement at return submission. Incoming defect returns are routed to the local Brand Center if available.
- Product response:
  - If Replacement chosen: system registers replacement order to ship from central hub; UI shows replacement order ID.
  - Faulty unit routed to brand center for repair. Repair job follows Repair tab flow. If repair passes, item re-enters routing gates as an ordinary return. If repair fails, it is escalated to central hub with audit reasons.
- Result: Replacement shipment record (no external carrier step) and repair job visible to BrandOperator and WareHubOperator.
- Empty state: No certified technicians → repair job shows "No technician available".
- Failure path: Repair job with missing verification cannot be cleared and auto-escalates.

### Local Inventory Pool & Order Fulfilment (local-first)
- Action: When a storefront order is placed, the system attempts to find the item locally first.
- Product response: If present in local pool or partner shop for the customer's zone, the order is fulfilled locally and marked "Local fulfilment — faster". If not found locally, order falls back to central hub stock and is marked "Hub fulfilment".
- Result: Storefront ranking surfaces local-pool items above hub-sourced items for customers in the region.
- Empty state: If no local sources exist, product page shows hub stock only.
- Failure path: If a local vendor fails to confirm stock at dispatch time, system flags the order for fallback to hub or customer support.

### Advertisement Eligibility Engine
- Action: On Ads tab evaluation or scheduled scoring, the engine runs four gates sequentially: Purchase volume, Return-reason balance, Season fit, Climate fit.
- Product response: Each gate returns pass/fail with supporting metrics. Eligible products get a geo-targeted list of cities where ads are recommended. Ads are not physically sent; the system provides a candidate list for marketing channels to use.
- Result: WareHubOperator sees an "Eligible in X cities" card and may export or mark campaigns.
- Empty state: Insufficient purchase volume → immediate suppression message.
- Failure path: Missing climate or purchase data for a city marks it as "undetermined".

### Live Queues, Filters & Overrides
- Action: Operators apply filters (priority Hot/Moderate/Cold based on business rules), search, and subscribe to push updates.
- Product response: Queue updates in near-real-time; clicking "Override" requires operator reason; overrides are recorded in audit logs.
- Result: Overrides update routing status immediately and notify assigned warehouse via its queue.
- Empty state: No items match filters → suggestion to clear filters.
- Failure path: Push updates failing reverts to short-poll mode; banner notifies operator.

### Audit & Explainability
- Action: Any automated decision card (routing, ad eligibility) has a "Why?" button.
- Product response: Shows the exact gates, inputs used (demand snapshot, climate summary, classifier confidence) and a time-stamped audit trail of decisions and overrides.
- Result: Operators can export the audit for a return or scan it in the detail panel.
- Empty state: If some input snapshots are missing, the explanation still lists what was unavailable.
- Failure path: If the audit cannot be produced, a message explains partial availability.

## State & What the Product Remembers (user-language)
The app persistently records the following user-facing objects and histories:
- Returns log: each return's origin (customer pincode), submitted reason text, NLP label & confidence, desired outcome (refund/replacement), initial routing recommendation, final disposition, and full audit trail of operator actions.
- Local inventory pool: items currently held per warehouse, condition grade (new/repaired/open-box), holding date, and source (return, repair, transfer).
- Repair jobs: assigned technician, checklists, verification outcome, and escalation status.
- Demand snapshots: historical order volume aggregated by zone and category used by Demand gate (kept as time-bounded aggregates).
- Climate snapshots: stored climate suitability scores for cities and timestamps used by Climate gate and Ads engine.
- Transfers: pending and historical transfers with source/destination warehouses and status.
- Ads evaluations: gate results per product-season-city and the list of eligible cities.
- Queue subscriptions & operator overrides: who overrode what and why.
- Metrics & tiles: daily counts shown on dashboards (today's returns, sent-to-far-warehouse, low-stock counts, capacity-used).

Empty states for each stored object surface clear guidance and CTA (e.g., "No repair jobs — check inbound defect returns" or "No local inventory — enable local pooling for this category").

## Rules & Logic (detailed)
- NLP classifier: runs automatically on return text; returns one of {Dissatisfaction, Hardware defect, Indeterminate} plus confidence. Small texts may yield Indeterminate and create a human-review task.
- Demand gate: passes if local historical order volume for the product's category and nearby pincodes exceeds a configurable threshold within a recent window. If absent, gate returns "no history".
- Climate gate: compares product usage profile (e.g., cooling appliances require warm humid index) to stored climate snapshot for the city; pass/fail with simple scoring (suitable / marginal / unsuitable).
- Capacity gate: compares warehouse free cubic-equivalent capacity vs. threshold. If capacity insufficient, system selects the lowest-demand local item for transfer (based on held inventory demand score) to free space and retries placement; if no transfers possible, item is queued.
- Repair escalation: if repair verification fails or certified technician absent for a required certification level, mark "Escalate to hub".
- Ads gating: all four gates must pass for ad eligibility. Gate failures are explainable and prevent ad listing in that city.
- Overrides: manual overrides are allowed at operator privilege; overrides must be accompanied by a reason and are fully audited.

## Analytics & Operator Metrics
Operator-facing metrics appear as tiles and charts with drill-down:
- Today's returns (count and trend)
- Sent-to-far-warehouse (count)
- Low-stock SKUs (count)
- Capacity-used (%) per warehouse
- Return disposition split (dissatisfaction vs hardware defect)

Each tile: click → filtered list. Empty states show "No data for date range".

## Notifications & In-app Alerts
In-app alerts surface when: a high-volume return spike occurs, a repair job fails verification, capacity crosses a critical threshold, or an override is made. Alerts are shown in the right contextual panel and can be acknowledged.

## Security & Access Controls
Role-based UI gating: users only see screens and actions allowed by their role. Elevated actions (overrides, admin settings) require two-step confirmation and are logged.

Audit log: immutable timeline of decisions, classifier outputs, and operator actions visible in return detail panels.

## Operational Settings (Admin)
Admin screens let an Admin:
- Configure gate thresholds (demand volume window and cutoff; capacity thresholds).
- Manage partner registry (repair centers, local vendors) with capability tags.
- Manage which warehouses are eligible as "local pools" for specific pincodes.

Admin actions require an explicit Save and change history is recorded. (These are operator-facing settings; new settings take effect immediately.)

## Failure Modes & Edge Cases (what operators see)
- Missing demand or climate data: gates show "insufficient data"; default to conservative routing (hub) unless overridden.
- No available warehouse capacity: item marked "Awaiting capacity" and appears on capacity action list for warehouses.
- NLP low confidence: return placed in "Human review" queue; operator can re-label and process.
- Vendor stock mismatch during fulfilment: order flagged for fallback, customer-facing message marks order as "Processing — awaiting confirmation" (no emails sent; messages are in-app only).

## Buildable Constraints and Notes
All ML/AI features operate over the app's stored data (classifier runs on submitted text; demand & climate snapshots are derived from stored aggregates). Where external real-time inputs would help (e.g., live weather), the product operates with internally stored climate snapshots and updates from operators or scheduled ingest jobs.

No external delivery/payment/email providers are required by the UI flows; replacement or transfer actions create records and statuses within the app rather than initiating third-party services.

## Acceptance Criteria (high-level)
- Returns submitted from `/shop/` appear in the Main Returns Queue within seconds with an NLP label and routing recommendation.
- WareHub and WarehouseOperator UIs reflect only their scoped data and show live tiles and queues.
- Ads tab evaluates gates and renders the Leaflet city map with per-city eligibility markers.
- Brand Center can accept repair jobs, record verification, and escalate failed repairs to the central hub queue.
- All automated decisions are explainable via an audit panel; operator overrides require reasons and are logged.

This specification provides the complete set of user-facing screens, features, rules and interactions required to build LocalMesh's core cross-subsystem workflows and operator consoles.
