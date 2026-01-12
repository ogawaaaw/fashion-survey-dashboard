const express = require("express");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const DATA_FILE = "data.json";

function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function toMonthKey(iso) {
  // "2026-01-12T..." -> "2026-01"
  return String(iso).slice(0, 7);
}

function normalizeBrand(s) {
  return String(s || "").trim();
}

function parseBrands(input) {
  // "Comme, Yohji / Margiela" みたいなのも許容
  return String(input || "")
    .split(/[,/、]/)
    .map(normalizeBrand)
    .filter(Boolean);
}

function buildSummary(data) {
  const count = data.length;
  if (count === 0) {
    return {
      count: 0,
      average: 0,
      tier: "—",
      topBrands: [],
      brandCount: {},
      monthlyAverage: { labels: [], values: [] },
      brandAverage: { labels: [], values: [] },
    };
  }

  // 平均
  const total = data.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const average = Math.round(total / count);

  // 支出層（適当じゃなく分かりやすい区切り）
  let tier = "ミドル";
  if (average < 20000) tier = "ライト";
  else if (average >= 50000) tier = "ヘビー";

  // ブランド集計（複数ブランド入力対応）
  const brandCount = {};
  data.forEach((d) => {
    const brands = Array.isArray(d.brands) ? d.brands : [];
    brands.forEach((b) => {
      brandCount[b] = (brandCount[b] || 0) + 1;
    });
  });

  const topBrands = Object.entries(brandCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([brand]) => brand);

  // 月別平均（回答された amount を月単位で平均）
  const monthMap = {};
  data.forEach((d) => {
    const m = toMonthKey(d.createdAt);
    if (!monthMap[m]) monthMap[m] = { sum: 0, n: 0 };
    monthMap[m].sum += Number(d.amount || 0);
    monthMap[m].n += 1;
  });

  const monthKeys = Object.keys(monthMap).sort();
  const monthlyLabels = monthKeys;
  const monthlyValues = monthKeys.map((m) => Math.round(monthMap[m].sum / monthMap[m].n));

  // ブランド別平均（その回答に含まれる各ブランドに amount を割り当てて平均）
  // ※ “一番使ったブランド”アンケなので厳密配分ではないが、体験として十分に面白い
  const brandAvgMap = {};
  data.forEach((d) => {
    const amount = Number(d.amount || 0);
    const brands = Array.isArray(d.brands) ? d.brands : [];
    brands.forEach((b) => {
      if (!brandAvgMap[b]) brandAvgMap[b] = { sum: 0, n: 0 };
      brandAvgMap[b].sum += amount;
      brandAvgMap[b].n += 1;
    });
  });

  const brandAvgEntries = Object.entries(brandAvgMap)
    .map(([brand, v]) => ({ brand, avg: Math.round(v.sum / v.n), n: v.n }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8); // 多すぎるとスマホで見づらいので上位だけ

  return {
    count,
    average,
    tier,
    topBrands,
    brandCount,
    monthlyAverage: { labels: monthlyLabels, values: monthlyValues },
    brandAverage: { labels: brandAvgEntries.map(x => x.brand), values: brandAvgEntries.map(x => x.avg) },
  };
}

app.post("/submit", (req, res) => {
  const { amount, brand } = req.body;

  const n = Number(amount);
  const brands = parseBrands(brand);

  if (!Number.isFinite(n) || n <= 0 || brands.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const data = readData();

  data.push({
    amount: n,
    brands,
    createdAt: new Date().toISOString(),
  });

  writeData(data);

  res.json(buildSummary(data));
});

// 初回表示用（ページ開いた時点の集計も見せたい）
app.get("/summary", (req, res) => {
  const data = readData();
  res.json(buildSummary(data));
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で起動中`);
});
