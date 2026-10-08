const $ = (id) => document.getElementById(id);

const queueListEl = $("queue-list");
const emptyStateEl = $("empty-state");
const detailPlaceholder = $("detail-placeholder");
const detailContent = $("detail-content");

let returns = [];
let selectedId = null;
let demandChart = null;
let lastQueueFingerprint = "";
let climateFilter = "All";

let viewMode = "returns"; // "returns" | "ads"
let catalog = [];
let adSeason = "summer";
let selectedProduct = null;

const ICONS = {
  classify: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 10-5.4 5.4L2 19v3h3l7.3-7.3a4 4 0 005.4-5.4z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`,
  thermo: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></svg>`,
  warehouse: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg>`,
  hub: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>`,
  review: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------------------------------------------------------------------- */
/* Queue polling + list                                                   */
/* ---------------------------------------------------------------------- */

async function fetchQueue() {
  try {
    const res = await fetch("/api/returns");
    if (!res.ok) return;
    returns = await res.json();
    const fingerprint = JSON.stringify(returns.map((r) => [r.id, r.status]));
    if (fingerprint !== lastQueueFingerprint) {
      lastQueueFingerprint = fingerprint;
      renderQueueList();
    }
    renderStats();
  } catch (err) {
    /* storefront/backend not reachable yet — keep showing what we have */
  }
}

function renderStats() {
  const local = returns.filter((r) => r.status === "routed_local").length;
  const hub = returns.filter((r) => r.status === "routed_hub").length;
  const defect = returns.filter(
    (r) => r.status === "defect_repaired" || r.status === "defect_hub" || r.status === "defect_pending"
  ).length;
  $("stat-queue").textContent = returns.length;
  $("stat-local").textContent = local;
  $("stat-hub").textContent = hub;
  $("stat-defect").textContent = defect;
}

function statusMeta(status) {
  if (status === "routed_local") return { dot: "dot-local", label: "LOCAL WH" };
  if (status === "routed_hub") return { dot: "dot-hub", label: "CENTRAL HUB" };
  if (status === "defect_repaired") return { dot: "dot-repaired", label: "REPAIRED · LOCAL" };
  if (status === "defect_hub") return { dot: "dot-defect", label: "CENTRAL WAREHOUSE" };
  // Awaiting a yes/no from the Local Brand Center on whether resources are
  // available to repair this unit — see /brandcenter/.
  if (status === "defect_pending") return { dot: "dot-hub", label: "PENDING REPAIR CHECK" };
  return { dot: "dot-defect", label: "DEFECT" };
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Season the customer themselves selected on the storefront at the time of
// the return — stated context, not inferred from the product.
function seasonLabel(season) {
  const labels = { summer: "Summer", monsoon: "Monsoon", winter: "Winter" };
  return labels[season] || "Season: unknown";
}

function renderQueueList() {
  const filtered = climateFilter === "All" ? returns : returns.filter((r) => r.area_climate_zone === climateFilter);
  const hasReturns = returns.length > 0;
  const hasFiltered = filtered.length > 0;
  emptyStateEl.hidden = hasReturns;
  queueListEl.hidden = !hasReturns;

  if (hasReturns && !hasFiltered) {
    queueListEl.innerHTML = `<p class="empty-filter">No returns from a ${climateFilter} climate zone yet.</p>`;
    return;
  }

  queueListEl.innerHTML = filtered
    .map((r) => {
      const meta = statusMeta(r.status);
      const active = r.id === selectedId ? "active" : "";
      return `
        <button class="queue-row ${active}" data-id="${r.id}">
          <span class="qr-dot ${meta.dot}"></span>
          <span class="qr-main">
            <span class="qr-product">${r.product}</span>
            <span class="qr-meta">${r.area_name} (${r.area_climate_zone}) &middot; ${formatTimestamp(r.submitted_at)}</span>
          </span>
          <span class="qr-status ${meta.dot}">${meta.label}</span>
        </button>
      `;
    })
    .join("");

  queueListEl.querySelectorAll(".queue-row").forEach((row) => {
    row.addEventListener("click", () => selectReturn(row.dataset.id));
  });
}

function initClimateFilter() {
  const wrap = $("climate-filter");
  if (!wrap) return;
  wrap.querySelectorAll(".cf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      climateFilter = btn.dataset.zone;
      wrap.querySelectorAll(".cf-btn").forEach((b) => b.classList.toggle("on", b === btn));
      renderQueueList();
    });
  });
}

async function selectReturn(id) {
  selectedId = id;
  renderQueueList();
  detailPlaceholder.hidden = true;
  detailContent.hidden = false;
  detailContent.innerHTML = `<p class="loading-msg">Loading analysis…</p>`;

  try {
    const res = await fetch(`/api/returns/${id}`);
    if (!res.ok) throw new Error("Return not found");
    const record = await res.json();
    renderDetail(record);
  } catch (err) {
    detailContent.innerHTML = `<p class="loading-msg">Could not load this return.</p>`;
  }
}

/* ---------------------------------------------------------------------- */
/* Detail panel                                                           */
/* ---------------------------------------------------------------------- */

function renderDetail(record) {
  const meta = statusMeta(record.status);
  let html = `
    <div class="detail-header">
      <div>
        <p class="detail-eyebrow">RETURN ${record.id.toUpperCase()}</p>
        <h2>${record.product}</h2>
        <p class="detail-sub">${record.area_name} <span class="zone-tag zone-${record.area_climate_zone.toLowerCase()}">${record.area_climate_zone}</span> &middot; ${seasonLabel(record.season)} &middot; received ${formatTimestamp(record.submitted_at)}</p>
      </div>
      <span class="status-badge ${meta.dot}">${meta.label}</span>
    </div>
  `;

  // Review + classification always sit on the left; the branch-specific
  // outcome (repair pipeline, or demand/climate/decision) sits on the right,
  // so the two columns fill the full width and the page doesn't need to
  // scroll to reach the decision at the bottom.
  let leftHtml = renderReview(record.review_text) + renderClassification(record.classification);
  let rightHtml = "";

  if (record.defect_branch) {
    rightHtml = renderDefect(record.defect_branch);
  } else if (record.dissatisfaction_branch) {
    const { demand, climate, decision } = record.dissatisfaction_branch;
    leftHtml += `<section class="panel">${renderDemandSection(demand)}</section>`;
    rightHtml = `<section class="panel">${renderClimateSection(climate)}<div class="section-block">${renderDecision(decision)}</div></section>`;
  }

  html += `
    <div class="detail-grid">
      <div class="detail-col">${leftHtml}</div>
      <div class="detail-col">${rightHtml}</div>
    </div>
  `;

  detailContent.innerHTML = html;

  if (record.dissatisfaction_branch) {
    drawDemandChart(record.dissatisfaction_branch.demand);
    drawClimateMap(record.dissatisfaction_branch.climate);
  }
}

function renderReview(reviewText) {
  return `
    <section class="panel">
      <p class="panel-title">${ICONS.review} Customer Review</p>
      <p class="review-text">&ldquo;${reviewText}&rdquo;</p>
    </section>
  `;
}

function labelFor(classificationLabel) {
  return classificationLabel === "hardware_defect" ? "Hardware Defect" : "Personal Dissatisfaction";
}

function renderClassification(classification) {
  const badgeClass = classification.label === "hardware_defect" ? "badge-defect" : "badge-dissatisfaction";
  const pct = Math.round(classification.confidence * 100);
  return `
    <section class="panel">
      <p class="panel-title">${ICONS.classify} Classification</p>
      <span class="badge ${badgeClass}">${labelFor(classification.label)}</span>
      <div class="confidence-row">
        <div class="confidence-track"><div class="confidence-fill" style="width:${pct}%"></div></div>
        <span class="confidence-value">${pct}% confidence</span>
      </div>
    </section>
  `;
}

function renderDefect(defect) {
  const resolutionLabel = defect.resolution === "replacement" ? "Replacement" : "Refund Issued";
  const pending = defect.route === null || defect.route === undefined;

  const step3 = pending
    ? `<p class="flow-step-label">Step 3 &middot; Repair Successful?
         <span class="status-pill">Awaiting Local Brand Center</span>
       </p>`
    : `<p class="flow-step-label">Step 3 &middot; Repair Successful?
         <span class="status-pill ${defect.repair_successful ? "yes" : "no"}">${defect.repair_successful ? "Yes" : "No"}</span>
       </p>`;

  const banner = pending
    ? `<div class="decision-banner central-hub">
         <p class="decision-head">${ICONS.hub}<span class="route-label">Awaiting Local Brand Center</span></p>
         <p class="reason-text">This unit is waiting on the Local Brand Center to confirm whether resources are available to repair it.</p>
       </div>`
    : (() => {
        const isLocal = defect.route === "local_warehouse";
        const bannerClass = isLocal ? "local-warehouse" : "central-hub";
        const icon = isLocal ? ICONS.warehouse : ICONS.hub;
        const routeLabel = isLocal ? "Repaired — Local Warehouse" : "Central Warehouse — Deep Repair";
        return `<div class="decision-banner ${bannerClass}">
          <p class="decision-head">${icon}<span class="route-label">${routeLabel}</span></p>
          <p class="reason-text">${defect.repair_reason}</p>
        </div>`;
      })();

  return `
    <section class="panel">
      <p class="panel-title">${ICONS.wrench} Hardware Defect — Repair Pipeline</p>

      <div class="section-block">
        <p class="flow-step-label">Step 1 &middot; Refund or Replacement?</p>
        <span class="badge badge-dissatisfaction">${resolutionLabel}</span>
        <span class="source-tag">${defect.customer_requested ? "Customer's choice" : "Auto-assigned"}</span>
        <p class="reason-text" style="margin-top:10px;">${defect.resolution_reason}</p>
      </div>

      <div class="section-block">
        <p class="flow-step-label">Step 2 &middot; Local Repair Shop</p>
        <p class="reason-text">Faulty unit sent here for inspection and repair.</p>
      </div>

      <div class="section-block">
        ${step3}
      </div>

      <div class="section-block">
        ${banner}
      </div>
    </section>
  `;
}

function statTile(label, value, unit, trendClass) {
  return `
    <div class="stat-tile">
      <p class="stat-tile-label">${label}</p>
      <p class="stat-tile-value ${trendClass || ""}">${value}${unit ? `<span class="stat-tile-unit">${unit}</span>` : ""}</p>
    </div>
  `;
}

function renderDemandSection(demand) {
  const growthSign = demand.growth_pct >= 0 ? "+" : "";
  const growthClass = demand.growth_pct >= 0 ? "up" : "down";
  const growthArrow = demand.growth_pct >= 0 ? "&#8593;" : "&#8595;";

  const tiles = [
    statTile("Recent Avg", demand.recent_avg, "/mo"),
    statTile("Prior Avg", demand.prior_avg, "/mo"),
    statTile("Change", `<span class="trend-arrow">${growthArrow}</span>${growthSign}${demand.growth_pct}`, "%", growthClass),
    statTile("Threshold", demand.threshold, "/mo"),
  ].join("");

  return `
    <div class="section-block">
      <p class="panel-title">${ICONS.chart} Recent Demand
        <span class="status-pill ${demand.has_demand ? "yes" : "no"}">Demand: ${demand.has_demand ? "Yes" : "No"}</span>
      </p>
      <div class="chart-wrap"><canvas id="demand-chart" height="150"></canvas></div>
      <div class="stat-grid">${tiles}</div>
      <p class="reason-text">${demand.reason}</p>
    </div>
  `;
}

function renderClimateSection(climate) {
  const { min_c, max_c, cold_max_c, hot_min_c } = climate.temp_scale;
  const pct = Math.max(0, Math.min(100, ((climate.avg_temp_c - min_c) / (max_c - min_c)) * 100));
  const markerColor = tempColor(climate.avg_temp_c, climate.temp_scale);
  const isWeatherNeutral = ["Hot", "Moderate", "Cold"].every((z) => climate.category_suited_climates.includes(z));
  const favorable = isWeatherNeutral ? "All climates" : climate.category_suited_climates.join(", ");

  const tiles = [statTile("Favorable for", favorable), statTile("Current condition", climate.area_climate_zone)].join("");

  return `
    <div class="section-block">
      <p class="panel-title">${ICONS.thermo} Climate Fit
        <span class="status-pill ${climate.is_climate_fit ? "yes" : "no"}">Fit: ${climate.is_climate_fit ? "Yes" : "No"}</span>
      </p>
      <div class="map-readout">
        <span class="zone-chip zone-${climate.area_climate_zone.toLowerCase()}">${climate.area_climate_zone}</span>
        <span class="readout-temp">${climate.avg_temp_c}&deg;C</span>
      </div>
      ${renderIndiaMap()}
      <div class="thermal-slider">
        <div class="thermal-track">
          <div class="thermal-marker" style="left:${pct}%;">
            <div class="thermal-marker-pin" style="border-color:${markerColor};"></div>
          </div>
        </div>
        <div class="thermal-zone-labels">
          <span>Cold (&lt;${cold_max_c}&deg;)</span>
          <span>Moderate</span>
          <span>Hot (&ge;${hot_min_c}&deg;)</span>
        </div>
      </div>
      <div class="stat-grid">${tiles}</div>
    </div>
  `;
}

function renderDecision(decision) {
  const isWarehouse = decision.route === "local_warehouse";
  const decisionClass = isWarehouse ? "local-warehouse" : "central-hub";
  const routeLabel = isWarehouse ? "Local Warehouse" : "Central Hub";
  const icon = isWarehouse ? ICONS.warehouse : ICONS.hub;

  return `
    <div class="decision-banner ${decisionClass}">
      <p class="decision-head">${icon}<span class="route-label">Decision: ${routeLabel}</span></p>
      <p class="reason-text">${decision.reason}</p>
    </div>
  `;
}

function drawDemandChart(demand) {
  const canvas = $("demand-chart");
  if (!canvas) return;

  if (demandChart) {
    demandChart.destroy();
    demandChart = null;
  }

  const seriesColor = cssVar("--series-1");
  const seriesSoft = cssVar("--series-1-soft");
  const textSecondary = cssVar("--text-secondary");

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 150);
  gradient.addColorStop(0, seriesSoft);
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  demandChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: demand.months,
      datasets: [
        {
          label: "Purchases",
          data: demand.counts,
          borderColor: seriesColor,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: seriesColor,
          pointBorderColor: seriesColor,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      interaction: { intersect: false, mode: "index" },
      scales: {
        x: { ticks: { color: textSecondary, font: { family: "var(--mono)" } }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { color: textSecondary, font: { family: "var(--mono)" } }, grid: { color: cssVar("--gridline") }, border: { display: false } },
      },
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Thermal color scale (used by the climate-fit slider marker)            */
/* ---------------------------------------------------------------------- */

function lerpColor(c1, c2, t) {
  const rgb = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

// Colors are anchored to the Cold/Moderate/Hot zone boundaries (not the raw
// min/max) so anything in the Cold zone always reads as a shade of blue and
// anything in the Hot zone always reads as a shade of red — a mid-range
// temperature near 0..max shouldn't wash out into an ambiguous olive tone.
function tempColor(tempC, scale) {
  const { min_c, max_c, cold_max_c, hot_min_c } = scale;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const DEEP_BLUE = [30, 64, 130];
  const LIGHT_BLUE = [96, 165, 217];
  const AMBER = [217, 150, 40];
  const ORANGE = [224, 110, 40];
  const DEEP_RED = [153, 27, 27];

  if (tempC < cold_max_c) {
    const t = clamp01((tempC - min_c) / (cold_max_c - min_c || 1));
    return lerpColor(DEEP_BLUE, LIGHT_BLUE, t);
  }
  if (tempC >= hot_min_c) {
    const t = clamp01((tempC - hot_min_c) / (max_c - hot_min_c || 1));
    return lerpColor(ORANGE, DEEP_RED, t);
  }
  const t = clamp01((tempC - cold_max_c) / (hot_min_c - cold_max_c || 1));
  return lerpColor(LIGHT_BLUE, AMBER, t);
}

/* ---------------------------------------------------------------------- */
/* Map (Leaflet + OpenStreetMap tiles, OpenWeatherMap temperature overlay) */
/* ---------------------------------------------------------------------- */

// Real coordinates for each mock area — mirrors backend AREAS (mock_data.py).
const LATLNG = {
  RAJ: { lat: 26.9124, lng: 75.7873 }, // Jaipur
  DEL: { lat: 28.6139, lng: 77.209 }, // Delhi
  BLR: { lat: 12.9716, lng: 77.5946 }, // Bengaluru
  PUN: { lat: 18.5204, lng: 73.8567 }, // Pune
  SHM: { lat: 31.1048, lng: 77.1734 }, // Shimla
  MUM: { lat: 19.076, lng: 72.8777 }, // Mumbai
  CHE: { lat: 13.0827, lng: 80.2707 }, // Chennai
  KOL: { lat: 22.5726, lng: 88.3639 }, // Kolkata
  LKO: { lat: 26.8467, lng: 80.9462 }, // Lucknow
  LEH: { lat: 34.1526, lng: 77.5771 }, // Leh
};

const OWM_API_KEY = "25892280879006561ec590e8c037a197";

function isDarkMode() {
  return document.documentElement.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Base map tiles: OpenStreetMap (light) / CARTO dark-matter (dark) — both
// free, keyless. OpenWeatherMap's own tile layer (the provided key) is laid
// on top as a live temperature heatmap, since OWM has no base map of its own.
// Plain OpenStreetMap tiles — the only base layer that needs no API key at
// all. Dark mode is faked with a CSS filter on the tile pane (see
// .dark-map-pane in styles.css) rather than a second, keyed tile provider
// (CARTO's dark tiles looked free but now gate on their own API key, same
// problem as Google — this sidesteps that entirely).
function baseTileLayer() {
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
}

function weatherTileLayer() {
  return L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`, {
    opacity: 0.45,
    attribution: '&copy; <a href="https://openweathermap.org/copyright">OpenWeatherMap</a>',
  });
}

function buildMap(el) {
  el.classList.toggle("dark-map-pane", isDarkMode());
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  baseTileLayer().addTo(map);
  weatherTileLayer().addTo(map);
  return map;
}

function circleMarker(map, coords, color, radius) {
  return L.circleMarker([coords.lat, coords.lng], {
    radius,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  }).addTo(map);
}

function renderIndiaMap() {
  return `<div class="india-map-wrap" id="gmap-climate"></div>`;
}

function drawClimateMap(climate) {
  const el = document.getElementById("gmap-climate");
  const coords = LATLNG[climate.area_code];
  if (!el || !coords) return;
  const color = tempColor(climate.avg_temp_c, climate.temp_scale);
  const map = buildMap(el);
  map.setView([coords.lat, coords.lng], 5);
  const marker = circleMarker(map, coords, color, 10);
  const icon = climate.area_climate_zone === "Hot" ? "🔥" : climate.area_climate_zone === "Cold" ? "❄️" : "";
  marker.bindPopup(`<b>${icon} ${climate.avg_temp_c}&deg;C</b>`, { closeButton: false }).openPopup();
}

/* ---------------------------------------------------------------------- */
/* Ad eligibility                                                         */
/* ---------------------------------------------------------------------- */

const SEASON_LABEL = { summer: "Summer", monsoon: "Monsoon", winter: "Winter" };

function initViewTabs() {
  const tabs = $("view-tabs");
  if (!tabs) return;
  tabs.querySelectorAll(".vt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view === viewMode) return;
      viewMode = btn.dataset.view;
      tabs.querySelectorAll(".vt-btn").forEach((b) => b.classList.toggle("on", b === btn));
      $("returns-view").hidden = viewMode !== "returns";
      $("ads-view").hidden = viewMode !== "ads";
      $("analysis-view").hidden = viewMode !== "analysis";
      detailContent.hidden = true;
      detailContent.innerHTML = "";
      detailPlaceholder.hidden = viewMode === "analysis";
      if (viewMode === "returns") {
        detailPlaceholder.querySelector("p").textContent = "Select a return from the queue to view its routing analysis.";
      } else if (viewMode === "ads") {
        detailPlaceholder.querySelector("p").textContent = "Select a product to check where it's eligible to be advertised.";
      }
      if (viewMode === "ads" && !catalog.length) fetchCatalog();
      if (viewMode === "analysis") fetchCategoryAnalysis();
    });
  });
}

function initSeasonFilter() {
  const wrap = $("season-filter");
  if (!wrap) return;
  wrap.querySelectorAll(".cf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      adSeason = btn.dataset.season;
      wrap.querySelectorAll(".cf-btn").forEach((b) => b.classList.toggle("on", b === btn));
      if (selectedProduct) selectProduct(selectedProduct);
    });
  });
}

async function fetchCatalog() {
  const listEl = $("product-list");
  listEl.innerHTML = `<p class="loading-msg">Loading catalog…</p>`;
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) throw new Error("catalog fetch failed");
    catalog = await res.json();
    renderProductList();
  } catch (err) {
    listEl.innerHTML = `<p class="loading-msg">Could not load the product catalog.</p>`;
  }
}

function renderProductList() {
  const listEl = $("product-list");
  listEl.innerHTML = catalog
    .map((p) => {
      const active = p.name === selectedProduct ? "active" : "";
      return `
        <button class="product-row ${active}" data-name="${p.name}">
          <span class="pr-main">
            <span class="pr-name">${p.name}</span>
            <span class="pr-meta">${SEASON_LABEL[p.season] || p.season} &middot; &#8377;${p.price}</span>
          </span>
        </button>
      `;
    })
    .join("");
  listEl.querySelectorAll(".product-row").forEach((row) => {
    row.addEventListener("click", () => selectProduct(row.dataset.name));
  });
}

async function selectProduct(name) {
  selectedProduct = name;
  renderProductList();
  detailPlaceholder.hidden = true;
  detailContent.hidden = false;
  detailContent.innerHTML = `<p class="loading-msg">Analyzing ad eligibility…</p>`;

  try {
    const res = await fetch(`/api/ads/eligibility?product=${encodeURIComponent(name)}&season=${encodeURIComponent(adSeason)}`);
    if (!res.ok) throw new Error("eligibility fetch failed");
    const data = await res.json();
    renderAdDetail(data);
  } catch (err) {
    detailContent.innerHTML = `<p class="loading-msg">Could not analyze this product.</p>`;
  }
}

function gateRow(icon, title, gate, dataHtml) {
  return `
    <div class="gate-row ${gate.passed ? "gate-pass" : "gate-fail"}">
      <span class="gate-icon">${gate.passed ? "✓" : "✕"}</span>
      <div class="gate-body">
        <p class="gate-title">${title}</p>
        ${dataHtml}
      </div>
    </div>
  `;
}

function demandGateData(gate) {
  const tiles = [statTile("Cities with demand", `${gate.cities_with_demand}/${gate.total_cities}`)].join("");
  return `<div class="stat-grid gate-stat-grid">${tiles}</div>`;
}

function returnGateData(gate) {
  const tiles = [
    statTile("Defects", gate.defect_count),
    statTile("Dissatisfaction", gate.dissatisfaction_count),
  ].join("");
  return `<div class="stat-grid gate-stat-grid">${tiles}</div>`;
}

function seasonGateData(gate) {
  const tiles = [
    statTile("Product season", SEASON_LABEL[gate.product_season] || gate.product_season),
    statTile("Requested season", SEASON_LABEL[gate.requested_season] || gate.requested_season),
  ].join("");
  return `<div class="stat-grid gate-stat-grid">${tiles}</div>`;
}

function renderAdDetail(data) {
  const { gates, eligible, cities, confidence: confPct } = data;
  const eligibleCities = cities.filter((c) => c.ad_eligible);

  const html = `
    <div class="detail-header">
      <div>
        <p class="detail-eyebrow">AD ELIGIBILITY</p>
        <h2>${data.product}</h2>
        <p class="detail-sub">${SEASON_LABEL[data.season] || data.season} item &middot; evaluated for ${SEASON_LABEL[adSeason] || adSeason}</p>
      </div>
      <div class="eligibility-confidence">
        <span class="status-badge ${eligible ? "dot-local" : "dot-defect"}">${eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</span>
        <div class="confidence-row">
          <div class="confidence-track"><div class="confidence-fill" style="width:${confPct}%"></div></div>
          <span class="confidence-value">${confPct}% confidence</span>
        </div>
      </div>
    </div>
    <section class="panel ad-detail-grid">
      <div class="ad-gates-col">
        <p class="panel-title">${ICONS.classify} Eligibility Gates</p>
        ${gateRow(ICONS.chart, "Bought by many users", gates.bought_by_many, demandGateData(gates.bought_by_many))}
        ${gateRow(ICONS.review, "Return reason", gates.return_reason, returnGateData(gates.return_reason))}
        ${gateRow(ICONS.thermo, "Suits current season", gates.season_fit, seasonGateData(gates.season_fit))}
        <div class="decision-banner ${eligible ? "local-warehouse" : "central-hub"}">
          <p class="decision-head">${eligible ? ICONS.warehouse : ICONS.hub}<span class="route-label">${eligible ? `Eligible in ${eligibleCities.length} of ${cities.length} cities` : "Do not advertise"}</span></p>
          <p class="reason-text">${
            eligible
              ? "Passed all gates — advertise in the cities below whose climate suits this product."
              : "Stopped at the first failed gate above, so this product should not be advertised anywhere right now."
          }</p>
        </div>
      </div>
      <div class="ad-cities-col">
        <p class="panel-title">${ICONS.hub} Suits City Climate</p>
        ${renderAdCityMap(cities)}
      </div>
    </section>
  `;
  detailContent.innerHTML = html;
  drawAdsMap(cities);
}

function renderAdCityMap(cities) {
  const legend = cities
    .map(
      (c) =>
        `<span class="city-chip ${c.ad_eligible ? "yes" : "no"}">${c.area_name} <b class="city-chip-conf">${c.confidence}%</b><small>${c.climate_zone}</small></span>`
    )
    .join("");
  return `
    <div class="india-map-wrap ad-map-wrap" id="gmap-ads"></div>
    <div class="city-chip-grid">${legend}</div>
  `;
}

function drawAdsMap(cities) {
  const el = document.getElementById("gmap-ads");
  if (!el) return;
  const map = buildMap(el);
  const points = [];
  cities.forEach((c) => {
    const coords = LATLNG[c.area_code];
    if (!coords) return;
    points.push([coords.lat, coords.lng]);
    circleMarker(map, coords, c.ad_eligible ? "#3fb765" : "#6b7685", 7).bindTooltip(
      `${c.area_name} (${c.climate_zone}) &middot; ${c.confidence}% confidence`
    );
  });
  if (points.length) map.fitBounds(points, { padding: [16, 16] });
}

/* ---------------------------------------------------------------------- */
/* Category analysis (season x climate breakdown from the shared catalog) */
/* ---------------------------------------------------------------------- */

const CLIMATE_HUE = { Hot: "var(--hot-hue)", Moderate: "var(--moderate-hue)", Cold: "var(--cold-hue)" };

async function fetchCategoryAnalysis() {
  detailPlaceholder.hidden = true;
  detailContent.hidden = false;
  detailContent.innerHTML = `<p class="loading-msg">Tallying the catalog…</p>`;
  try {
    const res = await fetch("/api/analysis/categories");
    if (!res.ok) throw new Error("analysis fetch failed");
    const data = await res.json();
    renderCategoryAnalysis(data);
  } catch (err) {
    detailContent.innerHTML = `<p class="loading-msg">Could not load the category analysis.</p>`;
  }
}

function analysisBar(value, max, colorVar) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
    <div class="analysis-cell">
      <div class="analysis-bar-track"><div class="analysis-bar-fill" style="width:${pct}%;background:${colorVar}"></div></div>
      <span class="analysis-cell-value">${value}</span>
    </div>
  `;
}

function renderCategoryAnalysis(data) {
  const { categories, seasons, climates } = data;
  const totalProducts = categories.reduce((sum, c) => sum + c.total, 0);
  const maxSeason = Math.max(1, ...categories.flatMap((c) => seasons.map((s) => c.by_season[s] || 0)));
  const maxClimate = Math.max(1, ...categories.flatMap((c) => climates.map((z) => c.by_climate[z] || 0)));

  const rows = categories
    .map((c) => {
      const seasonCells = seasons.map((s) => `<td>${analysisBar(c.by_season[s] || 0, maxSeason, "var(--accent)")}</td>`).join("");
      const climateCells = climates
        .map((z) => `<td>${analysisBar(c.by_climate[z] || 0, maxClimate, CLIMATE_HUE[z] || "var(--accent)")}</td>`)
        .join("");
      return `
        <tr>
          <td class="analysis-row-label">${c.category_name}<span class="analysis-row-total">${c.total} product${c.total === 1 ? "" : "s"}</span></td>
          ${seasonCells}
          ${climateCells}
        </tr>
      `;
    })
    .join("");

  const html = `
    <div class="detail-header">
      <div>
        <p class="detail-eyebrow">CATEGORY ANALYSIS</p>
        <h2>Season &amp; Climate Breakdown</h2>
        <p class="detail-sub">${totalProducts} catalog products across ${categories.length} categories &middot; tallied from the shared catalog, not estimated</p>
      </div>
    </div>
    <section class="panel">
      <p class="panel-title">${ICONS.chart} Products by Category, Season &amp; Climate Fit</p>
      <div class="analysis-table-wrap">
        <table class="analysis-table">
          <thead>
            <tr>
              <th>Category</th>
              ${seasons.map((s) => `<th>${SEASON_LABEL[s] || s}</th>`).join("")}
              ${climates.map((z) => `<th>${z}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="sub-note" style="margin-top:10px;">Season columns count products tagged for that season; climate columns count products suited for that zone (a weather-neutral item like rain gear counts in all three).</p>
    </section>
  `;
  detailContent.innerHTML = html;
}

initClimateFilter();
initViewTabs();
initSeasonFilter();
fetchQueue();
setInterval(fetchQueue, 4000);

// Clear queue button
const clearBtn = document.getElementById("clear-queue");
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!returns.length) return;
    if (!confirm("Clear all returns from the queue? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/returns", { method: "DELETE" });
      if (res.ok) {
        returns = [];
        selectedId = null;
        lastQueueFingerprint = "";
        renderQueueList();
        renderStats();
        detailContent.hidden = true;
        detailPlaceholder.hidden = false;
      }
    } catch (err) {
      console.error("Failed to clear queue", err);
    }
  });
}
