// ✅ Your published CSV URL
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQpe4PQEIW0KGdMreeRgY8dZevKVN-8T2OIqQSJUqThz_6SAIYQUokbPgPmfmkjrnQPyhZCQVuYaq6y/pub?gid=0&single=true&output=csv";

const METRICS = ["Avg NPT", "Avg MTTR", "Avg MTBF", "Avg CAP UT", "Avg Oee", "Total Output"];
const YEARS = ["24", "25", "26"];

let rawData = [];
let chart;

function showError(msg) {
  const existing = document.getElementById("errorBox");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("afterbegin",
    `<div id="errorBox" style="background:#ffe0e0;color:#a00;padding:14px;border-radius:8px;margin:10px;font-family:monospace;white-space:pre-wrap;font-size:13px;border:2px solid #c00;">⚠️ ${msg}</div>`);
  console.error(msg);
}

function showStatus(msg) {
  const existing = document.getElementById("statusBox");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("afterbegin",
    `<div id="statusBox" style="background:#e0f0ff;color:#036;padding:10px;border-radius:8px;margin:10px;font-family:monospace;font-size:13px;">⏳ ${msg}</div>`);
}

function clearStatus() {
  const existing = document.getElementById("statusBox");
  if (existing) existing.remove();
}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/[%,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function isPercent(metric) {
  return ["Avg NPT", "Avg CAP UT", "Avg Oee"].includes(metric);
}

// Try multiple methods to fetch the CSV
async function loadCSV() {
  showStatus("Loading data from Google Sheets...");

  const urls = [
    SHEET_CSV_URL,                                              // direct
    "https://corsproxy.io/?" + encodeURIComponent(SHEET_CSV_URL), // proxy 1
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(SHEET_CSV_URL) // proxy 2
  ];

  for (let i = 0; i < urls.length; i++) {
    try {
      showStatus(`Trying method ${i + 1} of ${urls.length}...`);
      const res = await fetch(urls[i], { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 10) throw new Error("Empty response");
      if (text.toLowerCase().includes("<!doctype html") || text.toLowerCase().includes("<html"))
        throw new Error("Got HTML instead of CSV — sheet not published as CSV");
      clearStatus();
      return text;
    } catch (e) {
      console.warn(`Method ${i + 1} failed:`, e.message);
      if (i === urls.length - 1) {
        throw new Error(
          `All fetch methods failed. Last error: ${e.message}\n\n` +
          `FIX:\n` +
          `1. Open your Google Sheet\n` +
          `2. File → Share → Publish to web\n` +
          `3. Choose your tab + "Comma-separated values (.csv)"\n` +
          `4. Click PUBLISH (not just Share!)\n` +
          `5. Test the URL by opening it in a new tab — you should see CSV text\n` +
          `6. Hard-refresh this page (Ctrl+Shift+R)`
        );
      }
    }
  }
}

(async function init() {
  try {
    const csvText = await loadCSV();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    rawData = parsed.data.map(row => {
      const clean = {};
      Object.keys(row).forEach(k => clean[k.trim()] = (row[k] ?? "").toString().trim());
      return clean;
    }).filter(r => r.SBU);

    if (rawData.length === 0) {
      showError("Sheet loaded but no rows with 'SBU' column found.\nCheck that your header row contains exactly: SBU, Year, Avg NPT, Avg MTTR, Avg MTBF, Avg CAP UT, Avg Oee, Total Output");
      return;
    }

    console.log("✅ Loaded", rawData.length, "rows");
    console.log("Sample row:", rawData[0]);
    initControls();
    render();
  } catch (err) {
    showError("Error loading sheet:\n" + err.message);
  }
})();

function initControls() {
  const sbuSel = document.getElementById("sbuFilter");
  sbuSel.innerHTML = '<option value="ALL">All SBUs</option>';
  const sbus = [...new Set(rawData.map(r => r.SBU))].sort();
  sbus.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; sbuSel.appendChild(o);
  });
  sbuSel.addEventListener("change", render);

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
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `${metric} — SBU Comparison (2024–2026)`, font: { size: 16 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, metric)}` } }
      },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => isPercent(metric) ? v + "%" : v.toLocaleString() } } }
    }
  });

  const thead = document.querySelector("#dataTable thead");
  thead.innerHTML = `<tr><th>SBU</th><th>2024</th><th>2025</th><th>2026</th><th>Δ 25 vs 24</th><th>Δ 26 vs 25</th></tr>`;

  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  labels.forEach(s => {
    const a = agg[s];
    const v24 = a["24"], v25 = a["25"], v26 = a["26"];
    const d1 = (v24 && v25 !== null) ? (((v25 - v24) / Math.abs(v24)) * 100).toFixed(1) + "%" : "—";
    const d2 = (v25 && v26 !== null) ? (((v26 - v25) / Math.abs(v25)) * 100).toFixed(1) + "%" : "—";
    const c1 = d1 === "—" ? "" : (parseFloat(d1) >= 0 ? "color:#0a7d2c;" : "color:#c0392b;");
    const c2 = d2 === "—" ? "" : (parseFloat(d2) >= 0 ? "color:#0a7d2c;" : "color:#c0392b;");
    tbody.insertAdjacentHTML("beforeend",
      `<tr><td>${s}</td><td>${fmt(v24, metric)}</td><td>${fmt(v25, metric)}</td><td>${fmt(v26, metric)}</td><td style="${c1}">${d1}</td><td style="${c2}">${d2}</td></tr>`);
  });
}
