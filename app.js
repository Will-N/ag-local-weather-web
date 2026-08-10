mapboxgl.accessToken = window.AVLING_WEATHER.mapboxToken;


const periodLabels = {
  since12z: "Current Rainfall",
  "1day": "1 day",
  "3day": "3 days",
  "7day": "7 days",
  "14day": "14 days",
  "30day": "30 days"
};


const contextPeriods = new Set([
  "7day",
  "14day",
  "30day"
]);


let manifest;
let currentPeriod = "7day";
let currentMetric = "rain";
let currentGeojson = null;
let selectedLngLat = null;


function localDateTime(utcString, options = {}) {

  const dt = new Date(utcString);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: manifest.region.timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName:
        options.includeZone
          ? "short"
          : undefined
    }
  ).format(dt);
}


function coverageText(period) {

  const product =
    manifest.products[period];

  if (
    !product?.coverage_start_utc ||
    !product?.coverage_end_utc
  ) {
    return "";
  }

  const start =
    localDateTime(
      product.coverage_start_utc
    );

  const end =
    localDateTime(
      product.coverage_end_utc,
      {includeZone: true}
    );

  return `Coverage: ${start} → ${end}`;
}


const map = new mapboxgl.Map({

  container: "map",

  style:
    "mapbox://styles/mapbox/standard",

  center: [-88.24, 40.12],

  zoom: 7.4,

  attributionControl: true
});


map.addControl(
  new mapboxgl.NavigationControl({
    showCompass: false
  }),
  "bottom-right"
);


async function loadManifest() {

  const r = await fetch(
    "data/manifest.json",
    {cache: "no-store"}
  );

  manifest = await r.json();

  const region = manifest.region;

  map.setCenter([
    region.center.lon,
    region.center.lat
  ]);

  const updated =
    new Date(
      manifest.generated_at_utc
    );

  document
    .getElementById("updated")
    .textContent =
      "Updated " +
      updated.toLocaleString(
        "en-US",
        {
          timeZone: region.timezone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short"
        }
      );

  for (
    const btn of
    document.querySelectorAll(
      "#periods button"
    )
  ) {

    if (
      !manifest.products[
        btn.dataset.period
      ]
    ) {

      btn.disabled = true;

      btn.title =
        "Product not generated yet";
    }
  }
}


function rainColorExpression() {

  return [
    "interpolate",
    ["linear"],
    ["get", "rain"],

    0.00,
    "rgba(190,255,190,0)",

    0.01,
    "rgba(190,255,190,0.60)",

    0.10,
    "rgba(125,255,122,0.62)",

    0.25,
    "rgba(35,198,93,0.64)",

    0.50,
    "rgba(22,139,210,0.65)",

    1.00,
    "rgba(39,75,216,0.66)",

    2.00,
    "rgba(217,75,217,0.68)",

    3.00,
    "rgba(239,65,54,0.70)",

    4.00,
    "rgba(255,222,61,0.72)"
  ];
}


function percentNormalColorExpression() {

  return [
    "interpolate",
    ["linear"],
    ["get", "percent_normal"],

    25,  "#8c2d04",
    50,  "#d94801",
    75,  "#fdae6b",
    90,  "#fee6ce",

    100, "#f7f7f7",

    110, "#deebf7",
    125, "#9ecae1",
    150, "#4292c6",
    200, "#08519c"
  ];
}


function departureLimit() {

  if (currentPeriod === "7day") {
    return 2;
  }

  if (currentPeriod === "14day") {
    return 3;
  }

  return 5;
}


function departureColorExpression() {

  const m = departureLimit();

  return [
    "interpolate",
    ["linear"],
    ["get", "departure"],

    -m,
    "#8c2d04",

    -m * 0.5,
    "#d94801",

    -m * 0.2,
    "#fdae6b",

    0,
    "#f7f7f7",

    m * 0.2,
    "#9ecae1",

    m * 0.5,
    "#4292c6",

    m,
    "#08519c"
  ];
}


function currentColorExpression() {

  if (
    currentMetric ===
    "percent_normal"
  ) {
    return percentNormalColorExpression();
  }

  if (
    currentMetric ===
    "departure"
  ) {
    return departureColorExpression();
  }

  return rainColorExpression();
}


function currentOpacityExpression() {

  if (currentMetric === "rain") {

    return [
      "case",

      ["<=", ["get", "rain"], 0],
      0,

      0.78
    ];
  }

  return [
    "case",

    [
      "==",
      ["get", currentMetric],
      null
    ],

    0,

    0.76
  ];
}


function updateLegend() {

  const title =
    document.getElementById(
      "legendTitle"
    );

  const ramp =
    document.getElementById(
      "legendRamp"
    );

  const labels =
    document.getElementById(
      "legendLabels"
    );


  if (currentMetric === "rain") {

    title.textContent =
      "Rainfall";

    ramp.style.background =
      `linear-gradient(
        90deg,
        rgba(190,255,190,.15) 0%,
        #7dff7a 12%,
        #23c65d 28%,
        #168bd2 45%,
        #274bd8 60%,
        #d94bd9 74%,
        #ef4136 88%,
        #ffde3d 100%
      )`;

    labels.innerHTML = `
      <span>0</span>
      <span>0.5"</span>
      <span>1"</span>
      <span>2"</span>
      <span>4"+</span>
    `;

    return;
  }


  if (
    currentMetric ===
    "percent_normal"
  ) {

    title.textContent =
      "Percent of Normal";

    ramp.style.background =
      `linear-gradient(
        90deg,
        #8c2d04 0%,
        #d94801 18%,
        #fdae6b 34%,
        #fee6ce 45%,
        #f7f7f7 50%,
        #deebf7 56%,
        #9ecae1 70%,
        #4292c6 84%,
        #08519c 100%
      )`;

    labels.innerHTML = `
      <span>&lt;50%</span>
      <span>75%</span>
      <span>100%</span>
      <span>125%</span>
      <span>150%+</span>
    `;

    return;
  }


  const m =
    departureLimit();

  title.textContent =
    "Departure from Normal";

  ramp.style.background =
    `linear-gradient(
      90deg,
      #8c2d04 0%,
      #d94801 20%,
      #fdae6b 38%,
      #f7f7f7 50%,
      #9ecae1 62%,
      #4292c6 80%,
      #08519c 100%
    )`;

  labels.innerHTML = `
    <span>-${m}"</span>
    <span>-${m / 2}"</span>
    <span>0"</span>
    <span>+${m / 2}"</span>
    <span>+${m}"</span>
  `;
}


function updateMetricSelector() {

  const selector =
    document.getElementById(
      "metricSelector"
    );

  const allowed =
    contextPeriods.has(
      currentPeriod
    );

  selector.classList.toggle(
    "hidden",
    !allowed
  );

  if (
    !allowed &&
    currentMetric !== "rain"
  ) {

    currentMetric = "rain";
  }


  for (
    const btn of
    selector.querySelectorAll(
      "button"
    )
  ) {

    btn.classList.toggle(
      "active",
      btn.dataset.metric ===
        currentMetric
    );
  }
}


function applyMetricStyle() {

  if (!map.getLayer("rain-fill")) {
    return;
  }

  map.setPaintProperty(
    "rain-fill",
    "fill-color",
    currentColorExpression()
  );

  map.setPaintProperty(
    "rain-fill",
    "fill-opacity",
    currentOpacityExpression()
  );

  updateLegend();

  updateMetricSelector();

  if (selectedLngLat) {
    inspectAt(selectedLngLat);
  }
}


async function showPeriod(period) {

  if (
    !manifest.products[period]
  ) {
    return;
  }

  const file =
    manifest.products[period].file;

  const r = await fetch(
    `data/${file}?v=${Date.now()}`
  );

  currentGeojson =
    await r.json();


  if (map.getSource("rain")) {

    map
      .getSource("rain")
      .setData(currentGeojson);

  } else {

    map.addSource(
      "rain",
      {
        type: "geojson",
        data: currentGeojson
      }
    );


    map.addLayer({

      id: "rain-fill",

      type: "fill",

      source: "rain",

      paint: {

        "fill-color":
          rainColorExpression(),

        "fill-opacity": [
          "case",
          ["<=", ["get", "rain"], 0],
          0,
          0.78
        ]
      }
    });


    map.addLayer({

      id: "rain-grid",

      type: "line",

      source: "rain",

      paint: {

        "line-color": [
          "case",

          ["<=", ["get", "rain"], 0],

          "rgba(85,145,185,0.42)",

          "rgba(70,105,135,0.20)"
        ],

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
  }


  currentPeriod = period;


  for (
    const btn of
    document.querySelectorAll(
      "#periods button"
    )
  ) {

    btn.classList.toggle(
      "active",
      btn.dataset.period === period
    );
  }


  updateMetricSelector();

  applyMetricStyle();
}


function findFeatureAt(lngLat) {

  if (!currentGeojson) {
    return null;
  }


  for (
    const f of
    currentGeojson.features
  ) {

    const ring =
      f.geometry.coordinates[0];

    const xs =
      ring.map(p => p[0]);

    const ys =
      ring.map(p => p[1]);

    const minx =
      Math.min(...xs);

    const maxx =
      Math.max(...xs);

    const miny =
      Math.min(...ys);

    const maxy =
      Math.max(...ys);


    if (
      lngLat.lng >= minx &&
      lngLat.lng <= maxx &&
      lngLat.lat >= miny &&
      lngLat.lat <= maxy
    ) {
      return f;
    }
  }

  return null;
}


function formatSigned(value) {

  const n = Number(value);

  if (n > 0) {
    return `+${n.toFixed(2)}`;
  }

  return n.toFixed(2);
}


function inspectAt(lngLat) {

  selectedLngLat = lngLat;

  const f =
    findFeatureAt(lngLat);

  if (!f) {
    return;
  }


  const p = f.properties;

  const label =
    document.getElementById(
      "detailLabel"
    );

  const value =
    document.getElementById(
      "detailValue"
    );

  const unit =
    document.getElementById(
      "detailUnit"
    );

  const context =
    document.getElementById(
      "detailContext"
    );


  if (
    currentMetric ===
    "percent_normal"
  ) {

    label.textContent =
      "Percent of normal rainfall";

    value.textContent =
      Number(
        p.percent_normal
      ).toFixed(0);

    unit.textContent = "%";

  } else if (
    currentMetric ===
    "departure"
  ) {

    label.textContent =
      "Rainfall departure from normal";

    value.textContent =
      formatSigned(
        p.departure
      );

    unit.textContent = "in";

  } else {

    label.textContent =
      "Rainfall at selected location";

    value.textContent =
      Number(
        p.rain
      ).toFixed(2);

    unit.textContent = "in";
  }


  if (
    contextPeriods.has(
      currentPeriod
    ) &&
    p.normal != null
  ) {

    context.innerHTML = `
      <div>
        <span>Observed</span>
        <b>${Number(p.rain).toFixed(2)} in</b>
      </div>

      <div>
        <span>Normal</span>
        <b>${Number(p.normal).toFixed(2)} in</b>
      </div>

      <div>
        <span>Departure</span>
        <b>${formatSigned(p.departure)} in</b>
      </div>

      <div>
        <span>% Normal</span>
        <b>${Number(p.percent_normal).toFixed(0)}%</b>
      </div>
    `;

  } else {

    context.innerHTML = "";
  }


  document
    .getElementById(
      "detailMeta"
    )
    .innerHTML =

      `${
        periodLabels[
          currentPeriod
        ] || currentPeriod
      }<br>` +

      `${coverageText(
        currentPeriod
      )}<br>` +

      `${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)}`;


  document
    .getElementById("detail")
    .classList.remove("hidden");


  renderMiniValues(lngLat);
}


async function valueAtPeriod(
  period,
  lngLat
) {

  const product =
    manifest.products[period];

  if (!product) {
    return null;
  }


  const r = await fetch(
    `data/${product.file}?v=${Date.now()}`
  );

  const gj =
    await r.json();


  for (const f of gj.features) {

    const ring =
      f.geometry.coordinates[0];

    const xs =
      ring.map(p => p[0]);

    const ys =
      ring.map(p => p[1]);

    const minx =
      Math.min(...xs);

    const maxx =
      Math.max(...xs);

    const miny =
      Math.min(...ys);

    const maxy =
      Math.max(...ys);


    if (
      lngLat.lng >= minx &&
      lngLat.lng <= maxx &&
      lngLat.lat >= miny &&
      lngLat.lat <= maxy
    ) {

      return Number(
        f.properties.rain
      );
    }
  }

  return null;
}


async function renderMiniValues(
  lngLat
) {

  const periods = [
    "1day",
    "7day",
    "30day"
  ];

  const box =
    document.getElementById(
      "miniPeriods"
    );

  box.innerHTML = "";


  for (const p of periods) {

    const val =
      await valueAtPeriod(
        p,
        lngLat
      );

    if (val == null) {
      continue;
    }


    const el =
      document.createElement(
        "div"
      );

    el.className =
      "mini-chip";

    el.innerHTML = `
      <span>${periodLabels[p]}</span>
      <b>${val.toFixed(2)}"</b>
    `;

    box.appendChild(el);
  }
}


document
  .getElementById("periods")
  .addEventListener(
    "click",
    e => {

      const btn =
        e.target.closest(
          "button[data-period]"
        );

      if (
        btn &&
        !btn.disabled
      ) {

        showPeriod(
          btn.dataset.period
        );
      }
    }
  );


document
  .getElementById(
    "metricSelector"
  )
  .addEventListener(
    "click",
    e => {

      const btn =
        e.target.closest(
          "button[data-metric]"
        );

      if (!btn) {
        return;
      }

      currentMetric =
        btn.dataset.metric;

      applyMetricStyle();
    }
  );


map.on(
  "click",
  e => inspectAt(e.lngLat)
);


map.on(
  "mouseenter",
  "rain-fill",
  () =>
    map.getCanvas().style.cursor =
      "crosshair"
);


map.on(
  "mouseleave",
  "rain-fill",
  () =>
    map.getCanvas().style.cursor =
      ""
);


map.on(
  "load",
  async () => {

    await loadManifest();

    const initial =
      manifest.products[
        currentPeriod
      ]
        ? currentPeriod
        : Object.keys(
            manifest.products
          )[0];

    if (initial) {
      await showPeriod(initial);
    }
  }
);
