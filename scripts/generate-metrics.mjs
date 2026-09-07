// scripts/generate-metrics.mjs
// 1) Lấy số liệu GitHub (REST API) -> vẽ SVG -> chèn vào README (marker METRICS)
// 2) Lấy số liệu Duolingo (endpoint không chính thức, không cần auth nếu profile public)
//    -> vẽ SVG -> chèn vào README (marker DUOLINGO)
// Chạy bằng Node >= 18 (đã có fetch built-in), không cần cài package ngoài.

import fs from "node:fs";

const GH_USERNAME = process.env.GH_USERNAME || "Loc1909";
const GH_TOKEN = process.env.GH_TOKEN;
const DUO_USERNAME = process.env.DUO_USERNAME || "Pluviophile1909";

// ---------- Helpers dùng chung ----------

function replaceOrAppendBlock(content, startMarker, endMarker, block) {
  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (regex.test(content)) {
    return content.replace(regex, block);
  }
  return `${content}\n\n${block}\n`;
}

function updateReadme(blocks) {
  const path = "README.md";
  let content = fs.readFileSync(path, "utf8");
  for (const { start, end, html } of blocks) {
    content = replaceOrAppendBlock(content, start, end, `${start}\n${html}\n${end}`);
  }
  fs.writeFileSync(path, content);
}

// ---------- Phần 1: GitHub metrics ----------

async function ghFetch(url) {
  const res = await fetch(url, {
    headers: {
      ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
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

async function fetchGithubStats() {
  const user = await ghFetch(`https://api.github.com/users/${GH_USERNAME}`);
  const repos = await getAllRepos(GH_USERNAME);

  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);

  const langCount = {};
  for (const r of repos) {
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  }
  const topLang =
    Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  return {
    followers: user.followers,
    publicRepos: user.public_repos,
    totalStars,
    totalForks,
    topLang,
    updatedAt: new Date().toISOString(),
  };
}

function renderGithubSVG(stats) {
  const rows = [
    ["⭐ Total Stars", stats.totalStars],
    ["📦 Public Repos", stats.publicRepos],
    ["👥 Followers", stats.followers],
    ["🍴 Total Forks", stats.totalForks],
    ["🔥 Top Language", stats.topLang],
  ];

  const rowHeight = 34;
  const footerGap = 36;
  const height = 80 + rows.length * rowHeight + footerGap;

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

  const lastRowY = 80 + (rows.length - 1) * rowHeight;
  const dividerY = lastRowY + 22;

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
  <line x1="24" y1="${dividerY}" x2="396" y2="${dividerY}" stroke="#30363d" stroke-width="1" />
  <text x="24" y="${height - 16}" fill="#6e7681" font-family="Segoe UI, sans-serif" font-size="10">
    Last updated: ${stats.updatedAt.slice(0, 16).replace("T", " ")} UTC
  </text>
</svg>`;
}

// ---------- Phần 2: Duolingo metrics ----------

async function fetchDuolingoStats(username) {
  const fields = "username,streak,totalXp,courses,creationDate";
  const url = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(
    username
  )}&fields=${fields}`;

  const res = await fetch(url, {
    headers: {
      // Một số request bị Cloudflare chặn nếu thiếu User-Agent giống trình duyệt
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Duolingo API lỗi ${res.status}`);
  }
  const data = await res.json();
  const user = data?.users?.[0];
  if (!user) {
    throw new Error(
      `Không tìm thấy user Duolingo "${username}" (có thể sai username hoặc profile đang để private)`
    );
  }

  const courses = (user.courses || []).slice().sort((a, b) => b.xp - a.xp);
  const topCourses = courses.slice(0, 3).map((c) => ({
    title: c.title,
    xp: c.xp,
  }));

  return {
    username: user.username,
    streak: user.streak ?? 0,
    totalXp: user.totalXp ?? 0,
    topCourses,
    memberSince: user.creationDate
      ? new Date(user.creationDate * 1000).toISOString().slice(0, 10)
      : "N/A",
    updatedAt: new Date().toISOString(),
  };
}

function renderDuolingoSVG(stats) {
  const rows = [
    ["🔥 Current Streak", `${stats.streak} ngày`],
    ["⚡ Total XP", stats.totalXp],
    ["📅 Member Since", stats.memberSince],
    ...stats.topCourses.map((c) => [`🗣️ ${c.title}`, `${c.xp} XP`]),
  ];

  const rowHeight = 30;
  const footerGap = 34;
  const height = 78 + rows.length * rowHeight + footerGap;

  const rowsSvg = rows
    .map(
      (r, i) => `
    <g transform="translate(24, ${78 + i * rowHeight})" opacity="0">
      <animate attributeName="opacity" from="0" to="1"
                begin="${0.2 + i * 0.15}s" dur="0.6s" fill="freeze" />
      <text x="0" y="0" fill="#3c3c3c" font-family="Segoe UI, sans-serif" font-size="14">${r[0]}</text>
      <text x="372" y="0" fill="#1cb0f6" font-family="Segoe UI, sans-serif"
            font-size="14" font-weight="bold" text-anchor="end">${r[1]}</text>
    </g>`
    )
    .join("");

  const lastRowY = 78 + (rows.length - 1) * rowHeight;
  const dividerY = lastRowY + 20;

  return `<svg width="420" height="${height}" viewBox="0 0 420 ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="420" height="${height}" rx="12" fill="#fffbf5" stroke="#e5e5e5"/>
  <circle cx="36" cy="32" r="14" fill="#58cc02"/>
  <text x="36" y="37" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="15"
        font-weight="bold" text-anchor="middle">D</text>
  <text x="58" y="30" fill="#3c3c3c" font-family="Segoe UI, sans-serif" font-size="16" font-weight="bold">
    Duolingo — ${stats.username}
  </text>
  <text x="58" y="46" fill="#8b8b8b" font-family="Segoe UI, sans-serif" font-size="11">
    tự động cập nhật mỗi ngày bởi GitHub Actions
  </text>
  ${rowsSvg}
  <line x1="24" y1="${dividerY}" x2="396" y2="${dividerY}" stroke="#e5e5e5" stroke-width="1" />
  <text x="24" y="${height - 14}" fill="#8b8b8b" font-family="Segoe UI, sans-serif" font-size="10">
    Last updated: ${stats.updatedAt.slice(0, 16).replace("T", " ")} UTC
  </text>
</svg>`;
}

// ---------- Main ----------

async function main() {
  fs.mkdirSync("assets", { recursive: true });
  const blocks = [];

  try {
    const ghStats = await fetchGithubStats();
    fs.writeFileSync("assets/metrics.svg", renderGithubSVG(ghStats));
    blocks.push({
      start: "<!--METRICS:START-->",
      end: "<!--METRICS:END-->",
      html: `<div align="center">\n  <img src="./assets/metrics.svg" alt="GitHub Metrics" />\n</div>`,
    });
    console.log("Đã cập nhật GitHub metrics:", ghStats);
  } catch (err) {
    console.error("Bỏ qua GitHub metrics do lỗi:", err.message);
  }

  try {
    const duoStats = await fetchDuolingoStats(DUO_USERNAME);
    fs.writeFileSync("assets/duolingo.svg", renderDuolingoSVG(duoStats));
    blocks.push({
      start: "<!--DUOLINGO:START-->",
      end: "<!--DUOLINGO:END-->",
      html: `<div align="center">\n  <img src="./assets/duolingo.svg" alt="Duolingo Stats" />\n</div>`,
    });
    console.log("Đã cập nhật Duolingo stats:", duoStats);
  } catch (err) {
    // Không làm fail cả job nếu Duolingo API sập/đổi format - metrics GitHub vẫn cập nhật bình thường
    console.error("Bỏ qua Duolingo stats do lỗi:", err.message);
  }

  if (blocks.length > 0) {
    updateReadme(blocks);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
