const form = document.getElementById("surveyForm");
const result = document.getElementById("result");

let brandChart;
let monthChart;

function yen(n) {
  return `¥${Number(n || 0).toLocaleString()}`;
}

function animateNumber(el, from, to, duration = 700) {
  const start = performance.now();
  const diff = to - from;

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const val = Math.round(from + diff * eased);
    el.textContent = yen(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function destroyCharts() {
  if (brandChart) { brandChart.destroy(); brandChart = null; }
  if (monthChart) { monthChart.destroy(); monthChart = null; }
}

function buildRankHTML(topBrands) {
  if (!topBrands || topBrands.length === 0) return `<p class="subtle">まだランキングがありません</p>`;
  const items = topBrands.map((b, i) => {
    const cls = i === 0 ? "top1" : "";
    const name = i === 0 ? `<strong>${b}</strong>` : b;
    return `<li class="${cls}">${name}</li>`;
  }).join("");
  return `<ol>${items}</ol>`;
}

function renderSummary(summary) {
  // アニメ毎回再生
  result.classList.remove("active");
  void result.offsetWidth;
  result.classList.add("active");

  result.innerHTML = `
    <div class="grid">
      <div class="kpi">
        <div class="label">集計人数</div>
        <div class="value">${summary.count || 0}</div>
        <div class="sub">人の集計</div>
      </div>

      <div class="kpi">
        <div class="label">平均 / 月</div>
        <div class="value" id="avgValue">${yen(summary.average)}</div>
        <div class="sub">平均（集計結果・1人/月あたり）</div>
      </div>

      <div class="kpi">
        <div class="label">支出ランク(※高いほど異常です)</div>
        <div class="value">${summary.tier || "—"}</div>
        <div class="sub">ライト 0~2万 / ミドル 2〜5万 / ヘビー 5万〜over</div>
      </div>

      <div class="kpi rank">
        <div class="label">人気ブランド</div>
        <div class="value">TOP 3</div>
        ${buildRankHTML(summary.topBrands)}
      </div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <p class="title">ブランド集計</p>
      <div class="canvas-wrap">
        <canvas id="brandChart" height="220"></canvas>
      </div>
    </div>

    <div class="section">
      <p class="title">月ごとの平均金額</p>
      <div class="canvas-wrap">
        <canvas id="monthChart" height="220"></canvas>
      </div>
    </div>

    <div class="section">
      <p class="title">ブランドごとの平均金額(TOP)</p>
      <div class="canvas-wrap">
        <canvas id="brandAvgChart" height="220"></canvas>
      </div>
    </div>
  `;

  // 結果までスムーズスクロール（スマホ気持ちいい）
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  // 平均カウントアップ
  const avgEl = document.getElementById("avgValue");
  animateNumber(avgEl, 0, Number(summary.average || 0), 750);

  // グラフ
  destroyCharts();

  // ブランド分布
  const brandLabels = Object.keys(summary.brandCount || {});
  const brandValues = Object.values(summary.brandCount || {});

  const brandCtx = document.getElementById("brandChart");
  brandChart = new Chart(brandCtx, {
    type: "bar",
    data: {
      labels: brandLabels,
      datasets: [{ data: brandValues }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      },
      animation: { duration: 800, easing: "easeOutQuart" }
    }
  });

  // 月別推移（線）
  const m = summary.monthlyAverage || { labels: [], values: [] };
  const monthCtx = document.getElementById("monthChart");
  monthChart = new Chart(monthCtx, {
    type: "line",
    data: {
      labels: m.labels || [],
      datasets: [{ data: m.values || [], tension: 0.25, pointRadius: 3 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true }
      },
      animation: { duration: 900, easing: "easeOutQuart" }
    }
  });

  // ブランド別平均（棒）
  const ba = summary.brandAverage || { labels: [], values: [] };
  const brandAvgCtx = document.getElementById("brandAvgChart");
  new Chart(brandAvgCtx, {
    type: "bar",
    data: {
      labels: ba.labels || [],
      datasets: [{ data: ba.values || [] }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true }
      },
      animation: { duration: 800, easing: "easeOutQuart" }
    }
  });
}

async function fetchSummary() {
  try {
    const res = await fetch("/summary");
    if (!res.ok) return;
    const summary = await res.json();
    if ((summary.count || 0) > 0) {
      result.classList.add("active");
      renderSummary(summary);
    }
  } catch {
    // 何もしない
  }
}

// 初回：既存の集計を表示（データがある場合）
fetchSummary();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const amount = form.amount.value;
  const brand = form.brand.value.trim();

  if (!amount || !brand) {
    alert("すべて入力してください");
    return;
  }

  const sendData = { amount: Number(amount), brand };

  try {
    const response = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendData)
    });

    if (!response.ok) throw new Error("サーバーエラー");
    const summary = await response.json();

    result.classList.add("active");
    renderSummary(summary);

    form.reset();
  } catch (err) {
    console.error(err);
    alert("通信に失敗しました（Console を確認）");
  }
});
