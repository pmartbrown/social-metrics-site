"use strict";
(function () {
  const TZ = "America/Denver";
  const NA = "not available";
  const TOO_FEW = "too few posts to call";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mt = (iso) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " MT" : NA;
  const mtDate = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(new Date(iso));
  const pct = (x, d = 1) => x == null ? `<span class="na">${NA}</span>` : (x * 100).toFixed(d) + "%";
  const int = (x) => x == null ? `<span class="na">${NA}</span>` : Math.round(x).toLocaleString("en-US");
  const LABELS = { d1: "1 day", d7: "7 days", d30: "30 days", d90: "90 days", backfill: "backfill" };
  const PLAT = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", x: "X", tiktok: "TikTok" };
  let D, scope = "all";

  fetch("data.json", { cache: "no-store" }).then((r) => r.json()).then((d) => { D = d; init(); })
    .catch(() => { document.getElementById("summary").innerHTML = "<p>Couldn't load the data file.</p>"; });

  function init() {
    if (D.sample) document.getElementById("sample").classList.remove("hidden");
    const b = document.getElementById("banner");
    b.innerHTML = `Last updated: ${esc(mt(D.built_at_utc))} · data as of ${esc(mt(D.data_as_of_utc))}`;
    const stale = !D.data_as_of_utc || (Date.now() - new Date(D.data_as_of_utc)) > 26 * 3600e3;
    const notes = D.accounts.filter((a) => a.note).map((a) => `<div class="note">${esc(a.note)}</div>`).join("");
    if (notes) b.insertAdjacentHTML("afterend", notes);
    if (stale) { b.classList.add("stale"); b.innerHTML += " · Data is more than 26 hours old."; }
    const tabs = document.getElementById("scopes");
    [["all", "Everything"], ["RQF", "RQF brand"], ["Personal", "Personal brand"]].forEach(([k, name]) => {
      const t = document.createElement("button"); t.textContent = name; t.dataset.k = k;
      t.onclick = () => { scope = k; render(); }; tabs.appendChild(t);
    });
    const fa = document.getElementById("f-account"), fp = document.getElementById("f-platform");
    fa.innerHTML = `<option value="">All</option>` + D.accounts.map((a) => `<option value="${esc(a.account)}">${esc(a.label)}</option>`).join("");
    fp.innerHTML = `<option value="">All</option>` + Object.keys(PLAT).map((p) => `<option value="${p}">${PLAT[p]}</option>`).join("");
    ["f-account", "f-platform", "f-label"].forEach((id) => document.getElementById(id).onchange = renderTable);
    render();
  }

  function inScope(p) { return scope === "all" || p.brand === scope; }

  function trendCell(name, m, fmt, help) {
    let val, sub;
    if (m.status === NA) { val = `<span class="na">${NA}</span>`; sub = help.na; }
    else if (!["up", "down", "flat", TOO_FEW].includes(m.status)) { val = m.current == null ? `<span class="na">${NA}</span>` : fmt(m.current); sub = `<span class="na">${esc(m.status)}</span>`; }
    else if (m.status === TOO_FEW) {
      val = m.current == null ? `<span class="na">${NA}</span>` : fmt(m.current);
      sub = `<span class="na">${TOO_FEW}</span> (${m.n_current} posts now, ${m.n_prior} before; need 5 each)`;
    } else {
      const cls = m.status;
      val = `${fmt(m.current)} <span class="arrow ${cls}">${m.arrow}</span>`;
      sub = `${m.change_pct > 0 ? "+" : ""}${m.change_pct}% vs ${fmt(m.prior)} the 30 days before · ${m.n_current} vs ${m.n_prior} posts`;
    }
    return `<div class="metric"><div class="name">${esc(name)}</div><div class="val">${val}</div><div class="sub">${sub}</div><div class="sub">${esc(help.def)}</div></div>`;
  }

  function render() {
    document.querySelectorAll("#scopes button").forEach((b) => b.classList.toggle("on", b.dataset.k === scope));
    const S = D.summary[scope];
    const vclass = /^Improving/.test(S.verdict) ? "up" : (/^Declining/.test(S.verdict) ? "down" : "");
    const miss = Object.entries(S.engagement_missing_parts || {}).map(([k, pl]) => `${k} (${pl.map((p) => PLAT[p] || p).join(", ")} doesn't report it)`);
    document.getElementById("summary").innerHTML =
      `<h2>Last 30 days vs the 30 days before</h2><div class="verdict ${vclass}">${esc(S.verdict)}</div><div class="metrics">` +
      trendCell("Engagement rate", S.metrics.engagement_rate, (x) => pct(x, 2), { def: "(likes + comments + shares + saves) ÷ views", na: "No views reported" }) +
      trendCell("Watch-through", S.metrics.watch_through, (x) => pct(x, 0), { def: "Average % of each video watched, where the platform reports it", na: "None of these platforms report it" }) +
      trendCell("Reach per post", S.metrics.reach_per_post, int, { def: "Average unique accounts reached per post, where reported", na: "None of these platforms report reach" }) +
      `</div><p class="note">Each post is judged on its 7-day numbers, so the two 30-day periods are posts published ${esc(mtDate(S.window.current_start_utc))}–${esc(mtDate(S.window.current_end_utc))} (${S.posts_current} posts) vs ${esc(mtDate(S.window.prior_start_utc))}–${esc(mtDate(S.window.current_start_utc))} (${S.posts_prior} posts). Newer posts join once they're 7 days old. Up or down means a change of more than 5%. YouTube watch numbers can lag 2–3 days.` +
      (miss.length ? ` Engagement leaves out ${esc(miss.join("; "))}.` : "") + ` X counts impressions as views.</p>`;

    const rows = Object.entries(D.summary_by_platform).map(([pl, s]) => {
      if (scope !== "all" && !D.posts.some((p) => p.platform === pl && p.brand === scope)) return "";
      const c = (m, f) => m.status === NA ? `<span class="na">${NA}</span>` : (!["up", "down", "flat"].includes(m.status) ? `${m.current == null ? "" : f(m.current) + " · "}<span class="na">${esc(m.status)}</span>` : `${f(m.current)} <span class="arrow ${m.status}">${m.arrow}</span> ${m.change_pct > 0 ? "+" : ""}${m.change_pct}%`);
      return `<tr><td>${PLAT[pl] || esc(pl)}</td><td>${c(s.metrics.engagement_rate, (x) => pct(x, 2))}</td><td>${c(s.metrics.watch_through, (x) => pct(x, 0))}</td><td>${c(s.metrics.reach_per_post, int)}</td><td class="num">${s.posts_current} / ${s.posts_prior}</td></tr>`;
    }).join("");
    document.getElementById("platforms").innerHTML = `<h2>By platform</h2><p class="note">All accounts on that platform, both brands.</p><table><tr><th>Platform</th><th>Engagement rate</th><th>Watch-through</th><th>Reach per post</th><th>Posts (now / before)</th></tr>${rows}</table>`;

    const R = D.rankings[scope];
    const li = (xs) => xs.length ? "<ul>" + xs.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : `<p class="na">Nothing to call yet.</p>`;
    document.getElementById("working").innerHTML = `<h2>What's working</h2><div class="verdict">${esc(R.readout.headline)}</div><div class="cols"><div><h3>Do more of this</h3>${li(R.readout.do_more)}</div><div><h3>Doing worse than normal</h3>${li(R.readout.do_less)}</div></div><p class="note">Based on ${R.scored_posts} posts with a full 7-day score. 100 = that account's normal.</p>`;

    const names = { hook_type: "Hook style", topic: "Topic", format: "Format" };
    document.getElementById("rankings").innerHTML = `<h2>Post types ranked</h2><div class="cols">` + Object.entries(R.dimensions).map(([dim, d]) =>
      `<div><h3>${names[dim]}</h3><table><tr><th>${names[dim]}</th><th>Typical score</th><th>Middle half</th><th>Posts</th></tr>` +
      (d.rows.length ? d.rows.map((r) => `<tr><td>${esc(r.value)}</td><td class="num">${r.median == null ? `<span class="na">${TOO_FEW}</span>` : r.median.toFixed(0)}</td><td class="num">${r.median == null ? "" : r.p25.toFixed(0) + "–" + r.p75.toFixed(0)}</td><td class="num">${r.n}</td></tr>`).join("") : `<tr><td colspan="4" class="na">No tagged posts yet</td></tr>`) +
      `</table>${d.untagged ? `<p class="note">${d.untagged} scored posts have no ${names[dim].toLowerCase()} tag yet.</p>` : ""}</div>`).join("") +
      `</div><p class="note">Groups need at least ${R.min_posts} scored posts to be called. Hook and topic tags come from Lila's tag sheet.</p>`;

    renderWeekly();
    renderTable();
  }

  function scoreOf(p, lab) { const s = p.scores[lab]; return s && s.score != null && !s.partial ? s.score : null; }

  function renderWeekly() {
    const now = Date.now(), wk = 7 * 864e5;
    const c = D.posts.filter((p) => inScope(p) && p.status !== "deleted" && scoreOf(p, "d7") != null)
      .filter((p) => { const s = p.snapshots.find((x) => x.label === "d7"); return s && now - new Date(s.captured_at_utc) <= wk; })
      .sort((a, b) => scoreOf(b, "d7") - scoreOf(a, "d7"));
    const line = (p) => `<li>${esc(p.account_label)} · ${esc(mtDate(p.published_at_utc))} · <a href="${esc(p.url)}" rel="noopener noreferrer" target="_blank">${esc(p.caption || "(no caption)")}</a> · <b>${scoreOf(p, "d7").toFixed(0)}</b></li>`;
    document.getElementById("weekly").innerHTML = `<h2>This week's top 3 and bottom 3</h2>` + (c.length < 6 ? (c.length ? `<h3>Ranked (fewer than 6 posts this week)</h3><ol>${c.map(line).join("")}</ol>` : `<p class="na">${TOO_FEW}</p>`) :
      `<div class="cols"><div><h3>Top 3</h3><ul>${c.slice(0, 3).map(line).join("")}</ul></div><div><h3>Bottom 3</h3><ul>${c.slice(-3).reverse().map(line).join("")}</ul></div></div>`) +
      `<p class="note">Posts whose 7-day score came in during the last 7 days.</p>`;
  }

  function renderTable() {
    const fa = document.getElementById("f-account").value, fp = document.getElementById("f-platform").value, lab = document.getElementById("f-label").value;
    const rows = D.posts.filter((p) => inScope(p) && (!fa || p.account === fa) && (!fp || p.platform === fp));
    const body = rows.map((p) => {
      const s = p.snapshots.find((x) => x.label === lab);
      const sc = p.scores[lab];
      let score = `<span class="na">not yet</span>`;
      if (sc) score = sc.score == null ? `<span class="na">${esc(sc.note || "building baseline")}</span>` : `${sc.partial ? "◐ " : ""}${sc.score.toFixed(0)} <span class="badge ${esc(sc.badge)}">${{ winner: "Winner", under: "Under", normal: "Normal" }[sc.badge] || ""}</span>`;
      const late = s && s.late === "true";
      const v = (k, f) => s ? f(s[k]) : "";
      const detail = p.snapshots.map((x) => `<tr class="${x.late === "true" ? "late" : ""}"><td>${esc(LABELS[x.label] || x.label)}${x.late === "true" ? ` (late, ${x.age_hours}h)` : ""}</td><td class="num">${int(x.views)}</td><td class="num">${int(x.likes)}</td><td class="num">${int(x.comments)}</td><td class="num">${int(x.shares)}</td><td class="num">${int(x.saves)}</td><td class="num">${int(x.reach)}</td><td class="num">${pct(x.avg_view_pct, 0)}</td><td class="num">${x.avg_watch_s == null ? `<span class="na">${NA}</span>` : x.avg_watch_s + "s"}</td><td class="num">${int(x.follows_gained)}</td></tr>`).join("");
      return `<tr class="${late ? "late" : ""}${p.status === "deleted" ? " late" : ""}"><td>${p.thumb ? `<img class="thumb" alt="" src="${esc(p.thumb)}">` : ""}</td><td>${esc(mtDate(p.published_at_utc))}</td><td>${esc(p.account_label)}</td><td>${esc(p.format)}</td><td>${p.hook_type ? esc(p.hook_type) : '<span class="na">needs tag</span>'}</td><td>${p.topic ? esc(p.topic) : '<span class="na">needs tag</span>'}</td>` +
        `<td><details><summary><a href="${esc(p.url)}" rel="noopener noreferrer" target="_blank">${esc(p.caption || "(no caption)")}</a>${p.status === "deleted" ? " (deleted)" : ""}</summary><table><tr><th>When</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th><th>Reach</th><th>Watch-through</th><th>Avg watch</th><th>Follows</th></tr>${detail}</table></details></td>` +
        `<td class="num">${v("views", int)}</td><td class="num">${score}${late ? " (late)" : ""}</td></tr>`;
    }).join("");
    document.getElementById("table").innerHTML = rows.length ? `<table><tr><th></th><th>Posted</th><th>Account</th><th>Format</th><th>Hook</th><th>Topic</th><th>Post (click for 1d → 7d → 30d)</th><th>Views</th><th>Score</th></tr>${body}</table>` : `<p class="na">No posts yet.</p>`;
  }
})();
