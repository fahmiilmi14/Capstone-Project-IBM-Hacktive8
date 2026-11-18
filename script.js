/* ============================================================
   Jakarta Air Quality Insight Dashboard — script.js
   100% driven by ispu_dki1.csv via PapaParse
   No hardcoded data. All stats computed from parsed rows.
   ============================================================ */

'use strict';

// ----------------------------------------------------------------
// 1. CONSTANTS & GLOBAL STATE
// ----------------------------------------------------------------

const CSV_PATH = 'ispu_dki1.csv';

const ISPU_COLORS = {
  BAIK:          '#22c55e',
  SEDANG:        '#eab308',
  'TIDAK SEHAT': '#ef4444',
};

const POLLUTANT_COLORS = {
  PM25: '#6366f1',
  PM10: '#f59e0b',
  O3:   '#06b6d4',
  CO:   '#f97316',
  SO2:  '#8b5cf6',
  NO2:  '#10b981',
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

let allData = [];      // cleaned rows (excludes TIDAK ADA DATA)
let filteredData = []; // current view after filters

// Chart.js instances – stored for destruction on update
const charts = {};

// ----------------------------------------------------------------
// 2. BOOTSTRAP — parse CSV, wire events, render
// ----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data, errors }) => {
      if (errors.length) {
        console.warn('PapaParse warnings:', errors.slice(0, 5));
      }
      allData = cleanData(data);
      initFilters();
      applyFilters();
      setDataStatus('ok', `${allData.length.toLocaleString('id-ID')} baris data valid`);
    },
    error: (err) => {
      setDataStatus('error', 'Gagal memuat CSV — pastikan ispu_dki1.csv ada di folder yang sama.');
      console.error('CSV load error:', err);
    },
  });

  document.getElementById('btn-reset').addEventListener('click', resetFilters);
  document.getElementById('btn-trend-monthly').addEventListener('click', () => setTrendMode('monthly'));
  document.getElementById('btn-trend-yearly').addEventListener('click', () => setTrendMode('yearly'));
});

// ----------------------------------------------------------------
// 3. DATA CLEANING
// ----------------------------------------------------------------

function cleanData(raw) {
  return raw
    .filter(r => {
      const cat = (r.categori || '').trim().toUpperCase();
      return cat !== '' && cat !== 'TIDAK ADA DATA';
    })
    .map(r => {
      const tanggal = (r.tanggal || '').trim();
      const year    = tanggal.length >= 4 ? parseInt(tanggal.substring(0, 4), 10) : NaN;
      const month   = tanggal.length >= 7 ? parseInt(tanggal.substring(5, 7), 10) : NaN;

      return {
        tanggal,
        year,
        month,
        stasiun:  (r.stasiun  || '').trim(),
        pm25:     parseFloat(r.pm25),
        pm10:     parseFloat(r.pm10),
        so2:      parseFloat(r.so2),
        co:       parseFloat(r.co),
        o3:       parseFloat(r.o3),
        no2:      parseFloat(r.no2),
        max:      parseFloat(r.max),
        critical: (r.critical || '').trim().toUpperCase(),
        categori: (r.categori || '').trim().toUpperCase(),
      };
    })
    .filter(r => !isNaN(r.year) && !isNaN(r.max));
}

// ----------------------------------------------------------------
// 4. FILTER LOGIC
// ----------------------------------------------------------------

let trendMode = 'monthly';

function initFilters() {
  const years = [...new Set(allData.map(r => r.year))].sort((a, b) => a - b);

  const selStart = document.getElementById('filter-year-start');
  const selEnd   = document.getElementById('filter-year-end');

  years.forEach(y => {
    const oS = new Option(y, y);
    const oE = new Option(y, y);
    selStart.appendChild(oS);
    selEnd.appendChild(oE);
  });

  selStart.value = years[0];
  selEnd.value   = years[years.length - 1];

  selStart.addEventListener('change', applyFilters);
  selEnd.addEventListener('change', applyFilters);
  document.getElementById('filter-category').addEventListener('change', applyFilters);
  document.getElementById('filter-critical').addEventListener('change', applyFilters);
}

function applyFilters() {
  const yearStart = parseInt(document.getElementById('filter-year-start').value, 10);
  const yearEnd   = parseInt(document.getElementById('filter-year-end').value, 10);
  const category  = document.getElementById('filter-category').value;
  const critical  = document.getElementById('filter-critical').value;

  filteredData = allData.filter(r => {
    if (r.year < yearStart || r.year > yearEnd) return false;
    if (category !== 'ALL' && r.categori !== category) return false;
    if (critical  !== 'ALL' && r.critical !== critical)  return false;
    return true;
  });

  // Clamp year end if start > end
  if (yearStart > yearEnd) {
    document.getElementById('filter-year-end').value = yearStart;
    applyFilters();
    return;
  }

  updateFilterSummary(yearStart, yearEnd, category, critical);
  renderAll();
}

function resetFilters() {
  const years = [...new Set(allData.map(r => r.year))].sort((a, b) => a - b);
  document.getElementById('filter-year-start').value = years[0];
  document.getElementById('filter-year-end').value   = years[years.length - 1];
  document.getElementById('filter-category').value   = 'ALL';
  document.getElementById('filter-critical').value   = 'ALL';
  applyFilters();
}

function updateFilterSummary(ys, ye, cat, crit) {
  const n = filteredData.length;
  const catLabel  = cat  === 'ALL' ? 'semua kategori' : cat;
  const critLabel = crit === 'ALL' ? 'semua polutan'  : crit;
  document.getElementById('filter-summary').textContent =
    `Menampilkan ${n.toLocaleString('id-ID')} hari | ${ys}–${ye} | ${catLabel} | ${critLabel}`;
}

// ----------------------------------------------------------------
// 5. RENDER CONTROLLER
// ----------------------------------------------------------------

function renderAll() {
  renderKPI();
  renderTrendChart();
  renderCategoryChart();
  renderCriticalChart();
  renderPollutantChart();
  renderTop10Table();
  renderInsight();
}

// ----------------------------------------------------------------
// 6. KPI CARDS
// ----------------------------------------------------------------

function renderKPI() {
  const data = filteredData;
  const n    = data.length;

  if (n === 0) {
    ['kpi-total-days','kpi-avg-max','kpi-pct-unhealthy','kpi-dominant-pollutant'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('kpi-dominant-pct').textContent = 'tidak ada data';
    return;
  }

  // Total hari valid
  document.getElementById('kpi-total-days').textContent = n.toLocaleString('id-ID');

  // Rata-rata ISPU max
  const avgMax = safeAvg(data.map(r => r.max));
  document.getElementById('kpi-avg-max').textContent = avgMax.toFixed(1);

  // % TIDAK SEHAT
  const countTS = data.filter(r => r.categori === 'TIDAK SEHAT').length;
  const pctTS   = (countTS / n * 100).toFixed(1);
  document.getElementById('kpi-pct-unhealthy').textContent = pctTS + '%';

  // Dominant pollutant
  const critFreq = countBy(data, 'critical');
  const dominant = Object.entries(critFreq).sort((a, b) => b[1] - a[1])[0];
  if (dominant) {
    document.getElementById('kpi-dominant-pollutant').textContent = dominant[0];
    const pct = (dominant[1] / n * 100).toFixed(1);
    document.getElementById('kpi-dominant-pct').textContent = `${pct}% dari total hari sebagai critical`;
  }
}

// ----------------------------------------------------------------
// 7. TREND CHART (monthly / yearly)
// ----------------------------------------------------------------

function setTrendMode(mode) {
  trendMode = mode;
  document.getElementById('btn-trend-monthly').classList.toggle('active', mode === 'monthly');
  document.getElementById('btn-trend-yearly').classList.toggle('active', mode === 'yearly');
  renderTrendChart();
}

function renderTrendChart() {
  const data = filteredData;
  let labels, datasets;

  if (trendMode === 'yearly') {
    const grouped = groupBy(data, r => r.year);
    const sortedYears = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    labels = sortedYears.map(String);
    const avgMax  = sortedYears.map(y => safeAvg(grouped[y].map(r => r.max)));
    const avgPM10 = sortedYears.map(y => safeAvg(grouped[y].filter(r => !isNaN(r.pm10)).map(r => r.pm10)));
    const avgO3   = sortedYears.map(y => safeAvg(grouped[y].filter(r => !isNaN(r.o3)).map(r => r.o3)));
    const avgPM25 = sortedYears.map(y => {
      const vals = grouped[y].filter(r => !isNaN(r.pm25)).map(r => r.pm25);
      return vals.length >= 10 ? safeAvg(vals) : null;
    });

    datasets = buildTrendDatasets(avgMax, avgPM10, avgO3, avgPM25);
  } else {
    // Monthly: aggregate year-month
    const grouped = groupBy(data, r => `${r.year}-${String(r.month).padStart(2,'0')}`);
    const sortedKeys = Object.keys(grouped).sort();

    labels = sortedKeys.map(k => {
      const [y, m] = k.split('-');
      return `${MONTH_LABELS[parseInt(m,10)-1]} '${y.slice(2)}`;
    });

    const avgMax  = sortedKeys.map(k => safeAvg(grouped[k].map(r => r.max)));
    const avgPM10 = sortedKeys.map(k => safeAvg(grouped[k].filter(r => !isNaN(r.pm10)).map(r => r.pm10)));
    const avgO3   = sortedKeys.map(k => safeAvg(grouped[k].filter(r => !isNaN(r.o3)).map(r => r.o3)));
    const avgPM25 = sortedKeys.map(k => {
      const vals = grouped[k].filter(r => !isNaN(r.pm25)).map(r => r.pm25);
      return vals.length >= 5 ? safeAvg(vals) : null;
    });

    datasets = buildTrendDatasets(avgMax, avgPM10, avgO3, avgPM25);
  }

  destroyChart('trend');
  const ctx = document.getElementById('chart-trend').getContext('2d');
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : 'N/A'}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            maxTicksLimit: trendMode === 'monthly' ? 24 : 20,
            maxRotation: 45,
          },
          grid: { color: '#f1f5f9' },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

function buildTrendDatasets(avgMax, avgPM10, avgO3, avgPM25) {
  return [
    {
      label: 'ISPU Maks',
      data: avgMax,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
    },
    {
      label: 'PM10',
      data: avgPM10,
      borderColor: POLLUTANT_COLORS.PM10,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      borderDash: [4, 3],
    },
    {
      label: 'O3',
      data: avgO3,
      borderColor: POLLUTANT_COLORS.O3,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      borderDash: [4, 3],
    },
    {
      label: 'PM2.5*',
      data: avgPM25,
      borderColor: POLLUTANT_COLORS.PM25,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      borderDash: [2, 4],
      spanGaps: false,
    },
  ];
}

// ----------------------------------------------------------------
// 8. CATEGORY DOUGHNUT CHART
// ----------------------------------------------------------------

function renderCategoryChart() {
  const data = filteredData;
  const counts = {
    BAIK:          data.filter(r => r.categori === 'BAIK').length,
    SEDANG:        data.filter(r => r.categori === 'SEDANG').length,
    'TIDAK SEHAT': data.filter(r => r.categori === 'TIDAK SEHAT').length,
  };

  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const colors = labels.map(l => ISPU_COLORS[l] || '#9ca3af');

  destroyChart('category');
  const ctx = document.getElementById('chart-category').getContext('2d');
  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed;
              const pct = total > 0 ? (v / total * 100).toFixed(1) : '0.0';
              return ` ${ctx.label}: ${v.toLocaleString('id-ID')} hari (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [{
      id: 'center-text',
      afterDraw(chart) {
        const { width, height, ctx: c } = chart;
        c.save();
        const tsCount  = counts['TIDAK SEHAT'];
        const tsLabel  = total > 0 ? (tsCount / total * 100).toFixed(0) + '%' : '—';
        c.textAlign    = 'center';
        c.textBaseline = 'middle';
        const cx = width / 2;
        const cy = height / 2;
        c.font = `bold 22px -apple-system, "Segoe UI", sans-serif`;
        c.fillStyle = tsCount > 0 ? '#ef4444' : '#22c55e';
        c.fillText(tsLabel, cx, cy - 8);
        c.font = `10px -apple-system, "Segoe UI", sans-serif`;
        c.fillStyle = '#9ca3af';
        c.fillText('Tdk Sehat', cx, cy + 12);
        c.restore();
      },
    }],
  });

  // Custom legend
  const legendEl = document.getElementById('legend-category');
  legendEl.innerHTML = labels.map((l, i) => {
    const pct = total > 0 ? (values[i] / total * 100).toFixed(1) : '0.0';
    return `<span class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${colors[i]}"></span>
      <span class="donut-legend-label">${l}</span>
      <span>(${pct}%)</span>
    </span>`;
  }).join('');
}

// ----------------------------------------------------------------
// 9. CRITICAL POLLUTANT HORIZONTAL BAR CHART
// ----------------------------------------------------------------

function renderCriticalChart() {
  const data     = filteredData;
  const freq     = countBy(data, 'critical');
  const sorted   = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const labels   = sorted.map(([k]) => k);
  const values   = sorted.map(([, v]) => v);
  const bgColors = labels.map(l => POLLUTANT_COLORS[l] || '#94a3b8');

  destroyChart('critical');
  const ctx = document.getElementById('chart-critical').getContext('2d');
  charts.critical = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Frekuensi (hari)',
        data: values,
        backgroundColor: bgColors.map(c => c + 'CC'),
        borderColor: bgColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const n    = filteredData.length;
              const pct  = n > 0 ? (ctx.parsed.x / n * 100).toFixed(1) : '0.0';
              return ` ${ctx.parsed.x.toLocaleString('id-ID')} hari (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
          grid: { color: '#f1f5f9' },
        },
        y: {
          ticks: { font: { size: 11, weight: '600' } },
          grid: { display: false },
        },
      },
    },
  });
}

// ----------------------------------------------------------------
// 10. POLLUTANT AVERAGE BAR CHART
// ----------------------------------------------------------------

function renderPollutantChart() {
  const data = filteredData;

  const avg = (key) => {
    const vals = data.map(r => r[key]).filter(v => !isNaN(v) && v !== null);
    return vals.length > 0 ? safeAvg(vals) : 0;
  };

  // PM25 sample info
  const pm25Rows   = data.filter(r => !isNaN(r.pm25));
  const pm25Sample = pm25Rows.length;
  const pm25NoteSpan = document.querySelector('#pm25-note span');
  if (pm25NoteSpan) {
    pm25NoteSpan.textContent =
      `Data PM2.5 tersedia untuk ${pm25Sample.toLocaleString('id-ID')} dari ${data.length.toLocaleString('id-ID')} hari — data konsisten mulai pertengahan 2021.`;
  }

  const pollutants = [
    { label: 'PM2.5', key: 'pm25', color: POLLUTANT_COLORS.PM25 },
    { label: 'PM10',  key: 'pm10', color: POLLUTANT_COLORS.PM10  },
    { label: 'SO2',   key: 'so2',  color: POLLUTANT_COLORS.SO2   },
    { label: 'CO',    key: 'co',   color: POLLUTANT_COLORS.CO    },
    { label: 'O3',    key: 'o3',   color: POLLUTANT_COLORS.O3    },
    { label: 'NO2',   key: 'no2',  color: POLLUTANT_COLORS.NO2   },
  ];

  const labels = pollutants.map(p => p.label);
  const values = pollutants.map(p => parseFloat(avg(p.key).toFixed(1)));
  const colors = pollutants.map(p => p.color);

  destroyChart('pollutants');
  const ctx = document.getElementById('chart-pollutants').getContext('2d');
  charts.pollutants = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Rata-rata Indeks',
        data: values,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Rata-rata: ${ctx.parsed.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 11, weight: '600' } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

// ----------------------------------------------------------------
// 11. TOP 10 TABLE
// ----------------------------------------------------------------

function renderTop10Table() {
  const data   = filteredData;
  const sorted = [...data].sort((a, b) => b.max - a.max).slice(0, 10);
  const tbody  = document.getElementById('table-top10');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">Tidak ada data untuk filter ini.</td></tr>';
    return;
  }

  const catClass = (cat) => {
    if (cat === 'BAIK')          return 'badge badge-baik';
    if (cat === 'SEDANG')        return 'badge badge-sedang';
    if (cat === 'TIDAK SEHAT')   return 'badge badge-ts';
    return 'badge';
  };

  const fmtNum = (v) => isNaN(v) || v === null ? '—' : v.toFixed(0);

  tbody.innerHTML = sorted.map((r, i) => `
    <tr>
      <td class="table-rank">${i + 1}</td>
      <td class="table-date">${r.tanggal}</td>
      <td class="table-ispu">${fmtNum(r.max)}</td>
      <td>
        <span class="table-pollutant-label" style="color:${POLLUTANT_COLORS[r.critical] || '#64748b'}">
          <span style="width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block;flex-shrink:0;"></span>
          ${r.critical}
        </span>
      </td>
      <td><span class="${catClass(r.categori)}">${r.categori}</span></td>
      <td class="table-num">${fmtNum(r.pm25)}</td>
      <td class="table-num">${fmtNum(r.pm10)}</td>
      <td class="table-num">${fmtNum(r.o3)}</td>
      <td class="table-num">${fmtNum(r.co)}</td>
      <td class="table-num">${fmtNum(r.so2)}</td>
    </tr>
  `).join('');
}

// ----------------------------------------------------------------
// 12. AUTOMATED INSIGHT PANEL
// ----------------------------------------------------------------

function renderInsight() {
  const data   = filteredData;
  const panel  = document.getElementById('insight-content');
  const n      = data.length;

  if (n === 0) {
    panel.innerHTML = '<p class="insight-placeholder">Tidak ada data yang cocok dengan filter yang dipilih. Coba ubah rentang tahun atau kategori.</p>';
    return;
  }

  const countCat = countBy(data, 'categori');
  const countCrit= countBy(data, 'critical');
  const sortedCrit = Object.entries(countCrit).sort((a, b) => b[1] - a[1]);
  const topCrit  = sortedCrit[0];

  const pctBaik  = ((countCat['BAIK']          || 0) / n * 100).toFixed(1);
  const pctSed   = ((countCat['SEDANG']         || 0) / n * 100).toFixed(1);
  const pctTS    = ((countCat['TIDAK SEHAT']    || 0) / n * 100).toFixed(1);
  const avgMax   = safeAvg(data.map(r => r.max)).toFixed(1);
  const maxRow   = data.reduce((best, r) => r.max > best.max ? r : best, data[0]);

  // Year range info
  const years = [...new Set(data.map(r => r.year))].sort((a, b) => a - b);
  const yearRange = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : `${years[0]}`;

  // Trend insight (compare first third vs last third of years)
  let trendInsight = '';
  if (years.length >= 4) {
    const half      = Math.floor(years.length / 2);
    const earlyYrs  = years.slice(0, half);
    const lateYrs   = years.slice(-half);
    const earlyData = data.filter(r => earlyYrs.includes(r.year));
    const lateData  = data.filter(r => lateYrs.includes(r.year));
    const earlyAvg  = safeAvg(earlyData.map(r => r.max));
    const lateAvg   = safeAvg(lateData.map(r => r.max));
    const diff      = lateAvg - earlyAvg;
    const pctChange = earlyAvg > 0 ? Math.abs(diff / earlyAvg * 100).toFixed(1) : '—';
    if (diff > 0) {
      trendInsight = `Rata-rata ISPU pada periode ${lateYrs[0]}–${lateYrs[lateYrs.length-1]} (<strong>${lateAvg.toFixed(1)}</strong>) meningkat ${pctChange}% dibanding periode awal ${earlyYrs[0]}–${earlyYrs[earlyYrs.length-1]} (<strong>${earlyAvg.toFixed(1)}</strong>).`;
    } else if (diff < 0) {
      trendInsight = `Rata-rata ISPU pada periode ${lateYrs[0]}–${lateYrs[lateYrs.length-1]} (<strong>${lateAvg.toFixed(1)}</strong>) turun ${pctChange}% dibanding periode awal ${earlyYrs[0]}–${earlyYrs[earlyYrs.length-1]} (<strong>${earlyAvg.toFixed(1)}</strong>).`;
    } else {
      trendInsight = `Rata-rata ISPU relatif stabil antara periode awal dan akhir.`;
    }
  }

  // Recommendation based on % TIDAK SEHAT
  let recommendation = '';
  const tsNum = parseFloat(pctTS);
  if (tsNum === 0) {
    recommendation = `<span class="insight-rec">Tidak ada hari dengan kategori TIDAK SEHAT pada periode ini — kualitas udara relatif terjaga.</span>`;
  } else if (tsNum < 5) {
    recommendation = `<span class="insight-rec">Hanya ${pctTS}% hari kategori TIDAK SEHAT — risiko sedang.</span> Kelompok sensitif (lansia, anak-anak, penderita asma) disarankan membatasi aktivitas luar ruangan di hari dengan ISPU tinggi.`;
  } else if (tsNum < 15) {
    recommendation = `<span class="insight-rec">Sebanyak ${pctTS}% hari masuk kategori TIDAK SEHAT — risiko signifikan.</span> Disarankan penggunaan masker N95 di luar ruangan, peningkatan kualitas filtrasi udara dalam ruangan, dan pemantauan real-time ISPU sebelum beraktivitas.`;
  } else {
    recommendation = `<span class="insight-rec">Lebih dari ${pctTS}% hari masuk kategori TIDAK SEHAT — risiko tinggi terhadap kesehatan publik.</span> Diperlukan langkah intervensi serius: pengurangan emisi kendaraan, pengetatan standar industri, dan sistem peringatan dini publik.`;
  }

  // PM25 dominance insight
  const pm25DaysValid = data.filter(r => !isNaN(r.pm25)).length;
  let pm25Insight = '';
  if (pm25DaysValid > 50) {
    const avgPM25 = safeAvg(data.filter(r => !isNaN(r.pm25)).map(r => r.pm25)).toFixed(1);
    const pm25CritDays = countCrit['PM25'] || 0;
    pm25Insight = `PM2.5 tercatat pada ${pm25DaysValid.toLocaleString('id-ID')} hari dengan rata-rata indeks <strong>${avgPM25}</strong>. PM2.5 menjadi critical polutan pada <strong>${pm25CritDays.toLocaleString('id-ID')}</strong> hari — polutan halus ini paling berbahaya karena mampu menembus ke paru-paru dalam.`;
  }

  const insights = [
    `Periode analisis: <strong>${yearRange}</strong> dengan <strong>${n.toLocaleString('id-ID')}</strong> hari data valid.`,
    `Distribusi kualitas: BAIK <strong>${pctBaik}%</strong> | SEDANG <strong>${pctSed}%</strong> | TIDAK SEHAT <strong>${pctTS}%</strong>. Rata-rata ISPU harian: <strong>${avgMax}</strong>.`,
    topCrit ? `Polutan dominan: <strong>${topCrit[0]}</strong> menjadi pemicu utama pada <strong>${topCrit[1].toLocaleString('id-ID')}</strong> hari (${(topCrit[1]/n*100).toFixed(1)}% dari total hari).` : null,
    maxRow  ? `Puncak polusi tertinggi: <strong>${maxRow.tanggal}</strong> dengan ISPU <strong>${maxRow.max}</strong> (${maxRow.critical}, ${maxRow.categori}).` : null,
    trendInsight || null,
    pm25Insight   || null,
    recommendation,
  ].filter(Boolean);

  panel.innerHTML = insights.map(t =>
    `<div class="insight-item"><span class="insight-dot"></span><span>${t}</span></div>`
  ).join('');
}

// ----------------------------------------------------------------
// 13. UTILITY FUNCTIONS
// ----------------------------------------------------------------

function safeAvg(arr) {
  const valid = arr.filter(v => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return 0;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function countBy(arr, field) {
  return arr.reduce((acc, item) => {
    const k = item[field] || 'UNKNOWN';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function setDataStatus(type, msg) {
  const el = document.getElementById('data-status');
  // Update text
  el.querySelector('span').textContent = msg;
  // Swap class
  el.className = el.className.replace(/status-\w+/g, '').trim();
  if (type === 'ok') {
    el.classList.add('status-ok');
    el.querySelector('.status-icon').style.display = 'none';
  } else if (type === 'error') {
    el.classList.add('status-error');
    el.querySelector('.status-icon').style.display = 'none';
  } else {
    el.classList.add('status-loading');
  }
}

// ----------------------------------------------------------------
// 14. SIDEBAR TOGGLE (mobile)
// ----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const toggle  = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 &&
          !sidebar.contains(e.target) &&
          !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Smooth scroll for nav links + active state
  document.querySelectorAll('.nav-item[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Update active class
      document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // Close sidebar on mobile after click
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });
});
