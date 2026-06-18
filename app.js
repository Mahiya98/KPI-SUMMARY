// ✅ Your published CSV URL
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQpe4PQEIW0KGdMreeRgY8dZevKVN-8T2OIqQSJUqThz_6SAIYQUokbPgPmfmkjrnQPyhZCQVuYaq6y/pub?gid=0&single=true&output=csv";

// Metrics available in your sheet
const METRICS = ["Avg NPT", "Avg MTTR", "Avg MTBF", "Avg CAP UT", "Avg Oee", "Total Output"];
const YEARS = ["24", "25", "26"];
const YEAR_LABELS = { "24": "2024", "25": "2025", "26": "2026" };

let rawData = [];
let chart;

function showError(msg) {
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="background:#ffe0e0;color:#a00;padding:12px;border-radius:8px;margin:10px;font-family:monospace;white-space:pre-wrap;">⚠️ ${msg}</div>`);
  console.error(msg);
}

// Convert "31.4%", "3,519,635", "" → numbers
function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[%,\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Detect if a metric is a percentage (so we render with %)
function isPercent(metric) {
  return ["Avg NPT", "Avg CAP UT", "Avg Oee"].includes(metric);
}

fetch(SHEET_CSV_URL)
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status} - sheet may not be published`);
    return res.text();
  })
  .then(csvText => {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    // Trim whitespace from keys + values
    rawData = parsed.data.map(row => {
      const clean = {};
      Object.keys(row).forEach(k => clean[k.trim()] = (row[k] ?? "").toString().trim());
      return clean;
    }).filter(r => r.SBU);

    if (rawData.length === 0) {
      showError("Sheet loaded but no SBU rows found.");
      return;
    }
    initControls();
    render();
  })
  .catch(err => showError("Error loading sheet: " + err.message));

function initControls() {
  // SBU filter
  const sbuSel = document.getElementById("sbuFilter");
  sbuSel.innerHTML = '<option value="ALL">All SBUs</option>';
  const sbus = [...new Set(rawData.map(r => r.SBU))].sort();
  sbus.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; sbuSel.appendChild(o);
  });
  sbuSel.addEventListener("change", render);

  // Metric selector (added dynamically if missing)
  let metricSel = document.getElementById("metricFilter");
  if (!metricSel) {
    const controls = document.querySelector(".controls");
    controls.insertAdjacentHTML("beforeend",
      `<label for="metricFilter" style="margin-left:10px;"><strong>Metric:</strong></label>
       <select id="metricFilter"></select>`);
    metricSel = document.getElementById("metricFilter");
  }
  metricSel.innerHTML = "";
  METRICS.forEach(m => {
    const o = document.createElement("option");
    o.value = m; o.textContent = m;
    if (m === "Total Output") o.selected = true;
    metricSel.appendChild(o);
  });
  metricSel.addEventListener("change", render);
}

function aggregate(filterSbu, metric) {
  const out = {};
  rawData.forEach(r => {
    if (filterSbu !== "ALL" && r.SBU !== filterSbu) return;
    const y = String(r.Year).trim();
    if (!YEARS.includes(y)) return;
    if (!out[r.SBU]) out[r.SBU] = { "24": null, "25": null, "26": null };
    out[r.SBU][y] = num(r[metric]);
  });
  return out;
}

function fmt(v, metric) {
  if (v === null || v === undefined) return "—";
  if (isPercent(metric)) return v.toFixed(1) + "%";
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function render() {
  const filterSbu = document.getElementById("sbuFilter").value;
  const metric = document.getElementById("metricFilter").value;
  const agg = aggregate(filterSbu, metric);
  const labels = Object.keys(agg).sort();

  const d24 = labels.map(s => agg[s]["24"] ?? 0);
  const d25 = labels.map(s => agg[s]["25"] ?? 0);
  const d26 = labels.map(s => agg[s]["26"] ?? 0);

  // Chart
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("sbuChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "2024", data: d24, backgroundColor: "#4e79a7" },
        { label: "2025", data: d25, backgroundColor: "#f28e2b" },
        { label: "2026", data: d26, backgroundColor: "#59a14f" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `${metric} — SBU Comparison (2024–2026)`, font: { size: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, metric)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => isPercent(metric) ? v + "%" : v.toLocaleString() }
        }
      }
    }
  });

  // Table
  const thead = document.querySelector("#dataTable thead");
  thead.innerHTML = `<tr>
    <th>SBU</th><th>2024</th><th>2025</th><th>2026</th>
    <th>Δ 25 vs 24</th><th>Δ 26 vs 25</th>
  </tr>`;

  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  labels.forEach(s => {
    const a = agg[s];
    const v24 = a["24"], v25 = a["25"], v26 = a["26"];
    const d1 = (v24 && v25 !== null) ? (((v25 - v24) / Math.abs(v24)) * 100).toFixed(1) + "%" : "—";
    const d2 = (v25 && v26 !== null) ? (((v26 - v25) / Math.abs(v25)) * 100).toFixed(1) + "%" : "—";
    const color1 = d1 === "—" ? "" : (parseFloat(d1) >= 0 ? "color:#0a7d2c;" : "color:#c0392b;");
    const color2 = d2 === "—" ? "" : (parseFloat(d2) >= 0 ? "color:#0a7d2c;" : "color:#c0392b;");
    tbody.insertAdjacentHTML("beforeend",
      `<tr>
        <td>${s}</td>
        <td>${fmt(v24, metric)}</td>
        <td>${fmt(v25, metric)}</td>
        <td>${fmt(v26, metric)}</td>
        <td style="${color1}">${d1}</td>
        <td style="${color2}">${d2}</td>
      </tr>`);
  });
}
