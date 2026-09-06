// scripts/generate-metrics.mjs
// Gọi GitHub REST API để lấy số liệu, render thành 1 SVG có animation (SMIL),
// rồi chèn/update vào README.md giữa 2 marker <!--METRICS:START/END-->.
// Chạy bằng Node >= 18 (đã có fetch built-in), không cần cài package ngoài.

import fs from "node:fs";

const USERNAME = process.env.GH_USERNAME || "Loc1909";
const TOKEN = process.env.GH_TOKEN;

async function ghFetch(url) {
  const res = await fetch(url, {
    headers: {
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      Accept: "application/vnd.github+json",
      "User-Agent": "readme-metrics-bot",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API lỗi ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getAllRepos(username) {
  let page = 1;
  let repos = [];
  for (;;) {
    const batch = await ghFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`
    );
    if (batch.length === 0) break;
    repos = repos.concat(batch);
    page++;
  }
  return repos;
}

function renderSVG(stats) {
  const rows = [
    ["⭐ Total Stars", stats.totalStars],
    ["📦 Public Repos", stats.publicRepos],
    ["👥 Followers", stats.followers],
    ["🍴 Total Forks", stats.totalForks],
    ["🔥 Top Language", stats.topLang],
  ];

  const rowHeight = 34;
  const height = 70 + rows.length * rowHeight;

  const rowsSvg = rows
    .map(
      (r, i) => `
    <g transform="translate(24, ${80 + i * rowHeight})" opacity="0">
      <animate attributeName="opacity" from="0" to="1"
                begin="${0.2 + i * 0.15}s" dur="0.6s" fill="freeze" />
      <text x="0" y="0" fill="#c9d1d9" font-family="Segoe UI, sans-serif" font-size="14">${r[0]}</text>
      <text x="372" y="0" fill="#58a6ff" font-family="Segoe UI, sans-serif"
            font-size="14" font-weight="bold" text-anchor="end">${r[1]}</text>
    </g>`
    )
    .join("");

  return `<svg width="420" height="${height}" viewBox="0 0 420 ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="420" height="${height}" rx="12" fill="url(#bg)" stroke="#30363d"/>
  <text x="24" y="34" fill="#58a6ff" font-family="Segoe UI, sans-serif" font-size="16" font-weight="bold">
    📊 GitHub Metrics
  </text>
  <text x="24" y="54" fill="#6e7681" font-family="Segoe UI, sans-serif" font-size="11">
    tự động cập nhật mỗi ngày bởi GitHub Actions
  </text>
  ${rowsSvg}
  <text x="24" y="${height - 14}" fill="#6e7681" font-family="Segoe UI, sans-serif" font-size="10">
    Last updated: ${stats.updatedAt.slice(0, 16).replace("T", " ")} UTC
  </text>
</svg>`;
}

function updateReadme(stats) {
  const path = "README.md";
  let content = fs.readFileSync(path, "utf8");
  const start = "<!--METRICS:START-->";
  const end = "<!--METRICS:END-->";
  const block = `${start}\n<div align="center">\n  <img src="./assets/metrics.svg" alt="GitHub Metrics" />\n</div>\n${end}`;

  const regex = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (regex.test(content)) {
    content = content.replace(regex, block);
  } else {
    content += `\n\n${block}\n`;
  }
  fs.writeFileSync(path, content);
}

async function main() {
  const user = await ghFetch(`https://api.github.com/users/${USERNAME}`);
  const repos = await getAllRepos(USERNAME);

  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);

  const langCount = {};
  for (const r of repos) {
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  }
  const topLang =
    Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  const stats = {
    followers: user.followers,
    publicRepos: user.public_repos,
    totalStars,
    totalForks,
    topLang,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync("assets", { recursive: true });
  fs.writeFileSync("assets/metrics.svg", renderSVG(stats));
  updateReadme(stats);

  console.log("Đã cập nhật metrics:", stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
