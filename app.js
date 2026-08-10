mapboxgl.accessToken = window.AVLING_WEATHER.mapboxToken;

const periodLabels = {
  since12z: "Current Rainfall",
  last24hours: "24 hours",
  "1day": "1 day",
  "3day": "3 days",
  "7day": "7 days",
  "14day": "14 days",
  "30day": "30 days",
};

let manifest;
let currentPeriod = "7day";
let selectedLngLat = null;


function localDateTime(utcString, options = {}) {
  const dt = new Date(utcString);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: manifest.region.timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: options.includeZone ? "short" : undefined
  }).format(dt);
}


function localTimeOnly(utcString, includeZone = false) {
  const dt = new Date(utcString);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: manifest.region.timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: includeZone ? "short" : undefined
  }).format(dt);
}


function coverageText(period) {
  const product = manifest.products[period];

  if (!product?.coverage_start_utc || !product?.coverage_end_utc) {
    return "";
  }

  const start = localDateTime(product.coverage_start_utc);
  const end = localDateTime(product.coverage_end_utc, {
    includeZone: true
  });

  if (period === "since12z") {
    return `Coverage: ${start} → ${end}`;
  }

  return `Coverage: ${start} → ${end}`;
}

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/standard",
  center: [-88.24, 40.12],
  zoom: 7.4,
  attributionControl: true
});

map.addControl(new mapboxgl.NavigationControl({showCompass:false}), "bottom-right");

async function loadManifest() {
  const r = await fetch("data/manifest.json", {cache:"no-store"});
  manifest = await r.json();

  const region = manifest.region;
  map.setCenter([region.center.lon, region.center.lat]);

  const updated = new Date(manifest.generated_at_utc);
  document.getElementById("updated").textContent =
    "Updated " + updated.toLocaleString("en-US", {
      timeZone: region.timezone,
      month:"short", day:"numeric", hour:"numeric", minute:"2-digit",
      timeZoneName:"short"
    });

  for (const btn of document.querySelectorAll("#periods button")) {
    if (!manifest.products[btn.dataset.period]) {
      btn.disabled = true;
      btn.title = "Product not generated yet";
    }
  }
}

function rainColorExpression() {
  // Prototype rainfall ramp in inches. Replace with exact chosen NWS ramp in v0.2.
  return [
    "interpolate", ["linear"], ["get", "rain"],
    0.00, "rgba(190,255,190,0)",
    0.01, "rgba(190,255,190,0.60)",
    0.10, "rgba(125,255,122,0.62)",
    0.25, "rgba(35,198,93,0.64)",
    0.50, "rgba(22,139,210,0.65)",
    1.00, "rgba(39,75,216,0.66)",
    2.00, "rgba(217,75,217,0.68)",
    3.00, "rgba(239,65,54,0.70)",
    4.00, "rgba(255,222,61,0.72)"
  ];
}

async function showPeriod(period) {
  if (!manifest.products[period]) return;

  const file = manifest.products[period].file;
  const r = await fetch(`data/${file}?v=${Date.now()}`);
  const geojson = await r.json();

  if (map.getSource("rain")) {
    map.getSource("rain").setData(geojson);
  } else {
    map.addSource("rain", {type:"geojson", data:geojson});
    map.addLayer({
      id:"rain-fill",
      type:"fill",
      source:"rain",
      paint:{
        "fill-color": rainColorExpression(),

        // Zero-rain cells remain completely transparent.
        // Any measurable rainfall uses the normal rainfall color ramp.
        "fill-opacity": [
          "case",
          ["<=", ["get", "rain"], 0],
          0,
          0.78
        ]
      }
    });

    // Show the footprint/grid even when rainfall is zero.
    // Zero cells get a subtle blue outline; rain cells retain a
    // fainter boundary so the underlying HRAP grid remains visible.
    map.addLayer({
      id:"rain-grid",
      type:"line",
      source:"rain",
      paint:{
        "line-color": [
          "case",
          ["<=", ["get", "rain"], 0],
          "rgba(85, 145, 185, 0.42)",
          "rgba(70, 105, 135, 0.20)"
        ],

        // Keep grid lines subtle when zoomed out and slightly clearer
        // as the user zooms toward an individual farm.
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.25,
          7, 0.40,
          9, 0.65,
          11, 0.90
        ]
      }
    });
    map.addLayer({
      id:"rain-selected",
      type:"line",
      source:"rain",
      filter:["==", ["get","_selected"], true],
      paint:{
        "line-color":"#111",
        "line-width":2
      }
    });
  }

  currentPeriod = period;
  for (const btn of document.querySelectorAll("#periods button")) {
    btn.classList.toggle("active", btn.dataset.period === period);
  }

  if (selectedLngLat) {
    inspectAt(selectedLngLat);
  }
}

function inspectAt(lngLat) {
  selectedLngLat = lngLat;
  const point = map.project(lngLat);
  const feats = map.queryRenderedFeatures(point, {layers:["rain-fill"]});
  if (!feats.length) return;

  const f = feats[0];
  document.getElementById("detailRain").textContent = Number(f.properties.rain).toFixed(2);
  const coverage = coverageText(currentPeriod);

  document.getElementById("detailMeta").innerHTML =
    `${periodLabels[currentPeriod] || currentPeriod}<br>` +
    `${coverage}<br>` +
    `${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)}`;
  document.getElementById("detail").classList.remove("hidden");

  renderMiniValues(lngLat);
}

async function valueAtPeriod(period, lngLat) {
  const product = manifest.products[period];
  if (!product) return null;
  const r = await fetch(`data/${product.file}`);
  const gj = await r.json();

  // Simple point-in-bbox test is adequate because v0.1 raster polygons are rectangles.
  for (const f of gj.features) {
    const ring = f.geometry.coordinates[0];
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys);
    if (lngLat.lng >= minx && lngLat.lng <= maxx && lngLat.lat >= miny && lngLat.lat <= maxy) {
      return Number(f.properties.rain);
    }
  }
  return null;
}

async function renderMiniValues(lngLat) {
  const periods = ["1day","7day","30day"];
  const box = document.getElementById("miniPeriods");
  box.innerHTML = "";
  for (const p of periods) {
    const val = await valueAtPeriod(p, lngLat);
    if (val == null) continue;
    const el = document.createElement("div");
    el.className = "mini-chip";
    el.innerHTML = `<span>${periodLabels[p]}</span><b>${val.toFixed(2)}"</b>`;
    box.appendChild(el);
  }
}

document.getElementById("periods").addEventListener("click", e => {
  const btn = e.target.closest("button[data-period]");
  if (btn && !btn.disabled) showPeriod(btn.dataset.period);
});

map.on("click", e => inspectAt(e.lngLat));
map.on("mouseenter", "rain-fill", () => map.getCanvas().style.cursor = "crosshair");
map.on("mouseleave", "rain-fill", () => map.getCanvas().style.cursor = "");

map.on("load", async () => {
  await loadManifest();
  const initial = manifest.products[currentPeriod]
    ? currentPeriod
    : Object.keys(manifest.products)[0];
  if (initial) await showPeriod(initial);
});
