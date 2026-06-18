// 🔁 REPLACE with YOUR published CSV URL
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-XXXX/pub?output=csv";

// Expected columns in your sheet: SBU, Year, Value
// (or: SBU, 2024, 2025, 2026 — both formats supported below)

let rawData = [];
let chart;

Papa.parse(SHEET_CSV_URL, {
  download: true,
  header: true,
  complete: (res) => {
    rawData = res.data.filter(r => r.SBU);
    initFilter();
    render("ALL");
  },
  error: (e) => alert("Error loading sheet: " + e.message)
});

function initFilter() {
  const sel = document.getElementById("sbuFilter");
  const sbus = [...new Set(rawData.map(r => r.SBU))].sort();
  sbus.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; sel.appendChild(o);
  });
  sel.addEventListener("change", e => render(e.target.value));
}

function aggregate(filterSbu) {
  // Detect format: wide (SBU,2024,2025,2026) vs long (SBU,Year,Value)
  const sample = rawData[0] || {};
  const isWide = "2024" in sample || "2025" in sample || "2026" in sample;
  const out = {};
  rawData.forEach(r => {
    if (filterSbu !== "ALL" && r.SBU !== filterSbu) return;
    if (!out[r.SBU]) out[r.SBU] = { "2024":0, "2025":0, "2026":0 };
    if (isWide) {
      out[r.SBU]["2024"] += +r["2024"] || 0;
      out[r.SBU]["2025"] += +r["2025"] || 0;
      out[r.SBU]["2026"] += +r["2026"] || 0;
    } else {
      const y = String(r.Year);
      if (out[r.SBU][y] !== undefined) out[r.SBU][y] += +r.Value || 0;
    }
  });
  return out;
}

function render(filterSbu) {
  const agg = aggregate(filterSbu);
  const labels = Object.keys(agg);
  const d24 = labels.map(s => agg[s]["2024"]);
  const d25 = labels.map(s => agg[s]["2025"]);
  const d26 = labels.map(s => agg[s]["2026"]);

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
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: "SBU Comparison (2024–2026)" } } }
  });

  // Table
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  labels.forEach(s => {
    const a = agg[s];
    const d1 = a["2024"] ? ((a["2025"]-a["2024"])/a["2024"]*100).toFixed(1)+"%" : "—";
    const d2 = a["2025"] ? ((a["2026"]-a["2025"])/a["2025"]*100).toFixed(1)+"%" : "—";
    tbody.insertAdjacentHTML("beforeend",
      `<tr><td>${s}</td><td>${a["2024"]}</td><td>${a["2025"]}</td><td>${a["2026"]}</td><td>${d1}</td><td>${d2}</td></tr>`);
  });
}
