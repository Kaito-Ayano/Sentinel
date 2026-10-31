/* app.js — 总览 + 规则页 + 团伙关系图谱（D3）；复核台（D4）预留接口 window.__TEAM_I_RESULT */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);

  const params = { r1: 5, r2: 3, ip: 5, dev: 3, addr: 5, amt: 8 }; // 默认阈值（规格 v1.1 §3）
  let result = null, trendChart = null, graphChart = null;

  const RULES = [
    { key: "r1", sliders: [["r1", 3, 10]],        name: "R1 凌晨集中下单",   weight: 3, desc: p => `近 7 天 00:00–05:59 订单 ≥ ${p.r1}` },
    { key: "r2", sliders: [["r2", 1, 5]],         name: "R2 新账户早期爆发", weight: 2, desc: p => `注册后 7 天内下单 ≥ ${p.r2} 笔` },
    { key: "r3", sliders: [["ip", 3, 10], ["dev", 2, 6]], name: "R3 共享 IP/设备", weight: 2, desc: p => `同 IP 关联账户 ≥ ${p.ip} 或同设备 ≥ ${p.dev}` },
    { key: "r4", sliders: [["addr", 3, 10]],      name: "R4 地址聚集",       weight: 2, desc: p => `同收货地址关联账户 ≥ ${p.addr}` },
    { key: "r5", sliders: [["amt", 5, 15]],       name: "R5 金额模式重复",   weight: 2, desc: p => `同一金额 7 天内 ≥ ${p.amt} 次，且账户资源被 ≥4 个账户共用` },
  ];

  function debounce(fn, ms) {
    let id = null;
    return function () { clearTimeout(id); id = setTimeout(fn, ms); };
  }

  function recompute() {
    const data = (typeof ORDERS !== "undefined") ? ORDERS : [];
    result = window.AuditEngine.compute(data, params);
    window.__TEAM_I_RESULT = result; // D3/D4 复用
    renderKpi();
    renderTrend();
    renderRules();
    if (document.querySelector("#page-graph").classList.contains("active")) renderGraph();
    if (document.querySelector("#page-review").classList.contains("active")) renderReview();
  }

  /* ================= 总览 ================= */
  function renderKpi() {
    const k = result.kpi;
    $("#kpi-orders").textContent = k.totalOrders.toLocaleString();
    $("#kpi-share").textContent = k.anomalyShare.toFixed(1) + "%";
    $("#kpi-high").textContent = k.highRiskCount;
    $("#kpi-gangs").textContent = k.gangCount;
  }

  function renderTrend() {
    const el = $("#trend");
    if (!window.echarts) {
      el.innerHTML = '<div class="fallback">图表需联网加载 ECharts CDN（jsdelivr）。数字不受影响。</div>';
      return;
    }
    trendChart = trendChart || echarts.init(el);
    trendChart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      xAxis: { type: "category", data: result.trend.map(x => x.date.slice(5)), axisLabel: { fontSize: 10, interval: 2 } },
      yAxis: { type: "value", minInterval: 1 },
      series: [{
        type: "line", data: result.trend.map(x => x.count), smooth: true, symbol: "none",
        lineStyle: { color: "#86bc25", width: 2 },
        areaStyle: { color: "rgba(134,188,37,.12)" },
        markPoint: { data: [{ type: "max", name: "峰值" }], symbolSize: 38 }
      }]
    });
  }

  /* ================= 规则页 ================= */
  function renderRules() {
    for (const r of RULES) {
      let n = 0, sum = 0;
      for (const v of result.perAcc.values()) if (v.hits.includes(r.key)) { n++; sum += v.risk; }
      $(`#hit-${r.key}`).textContent = n;
      $(`#risk-${r.key}`).textContent = "avg 风险分 " + (n ? (sum / n).toFixed(1) : "-");
    }
    $("#chip-high").textContent = result.kpi.highRiskCount;
    $("#chip-gangs").textContent = result.kpi.gangCount;
    const fmt = d => window.AuditEngine.fmtDay(d);
    const byBest = [...result.perAcc.values()].filter(v => v.hits.includes("r1")).sort((a, b) => b.best - a.best).slice(0, 10);
    $("#sample-r1").innerHTML = byBest.map(v =>
      `<tr><td class="num">${v.id}</td><td class="num">${fmt(v.reg)}</td><td class="num">${v.best}</td><td class="num">${v.nOrders}</td><td class="num">${v.risk}</td></tr>`).join("");
    const byEarly = [...result.perAcc.values()].filter(v => v.hits.includes("r2")).sort((a, b) => b.early - a.early).slice(0, 10);
    $("#sample-r2").innerHTML = byEarly.map(v =>
      `<tr><td class="num">${v.id}</td><td class="num">${fmt(v.reg)}</td><td class="num">${v.early}</td><td class="num">${v.nOrders}</td><td class="num">${v.risk}</td></tr>`).join("");
  }

  function buildRuleCards() {
    const host = $("#rules-grid");
    host.innerHTML = "";
    for (const r of RULES) {
      const card = document.createElement("div");
      card.className = "rule-card";
      card.innerHTML =
        `<div class="head"><span class="name">${r.name}</span><span class="w">权重 +${r.weight}</span></div>` +
        `<div class="desc">${r.desc(params)}</div>` +
        r.sliders.map(([k, min, max]) =>
          `<div class="row"><label>${k.toUpperCase()}</label><input type="range" data-k="${k}" min="${min}" max="${max}" step="1" value="${params[k]}"><span class="val" id="val-${k}">${params[k]}</span></div>`
        ).join("") +
        `<div class="hit">命中 <b id="hit-${r.key}">-</b> 个账户 ｜ <span id="risk-${r.key}"></span></div>`;
      host.appendChild(card);
    }
    host.querySelectorAll("input[type=range]").forEach(inp => {
      inp.addEventListener("input", e => {
        const k = e.target.dataset.k;
        params[k] = +e.target.value;
        $("#val-" + k).textContent = params[k];
      });
      inp.addEventListener("input", debounce(recompute, 400));
    });
  }

  /* ================= 图谱页（D3） ================= */
  const CATS = [{ name: "账户" }, { name: "共享 IP" }, { name: "共享设备" }, { name: "共享地址" }];
  const RES_CAT = { ipAcc: 1, devAcc: 2, addrAcc: 3 };
  const RES_COLOR = { 1: "#6f9fd8", 2: "#8b7fd0", 3: "#d99b6c" };
  const riskColor = r => r >= 10 ? "#d9534f" : r >= 7 ? "#e6b450" : r >= 4 ? "#9bc66b" : "#dff0c6";
  let nodeById = new Map(), selSet = new Set(), hl = new Set(), lastGraph = null, graphClickBound = false;

  function componentOf(accId) {
    for (const g of result.gangs) if (g.includes(accId)) return g;
    return [accId];
  }

  function buildGraph() {
    selSet = new Set();
    result.gangs.forEach(g => g.forEach(id => selSet.add(id)));
    const nodes = [], links = [], nameIdx = new Map();
    const addNode = (name, catIdx, color, symbol, size, extra) => {
      if (nameIdx.has(name)) return nameIdx.get(name);
      const idx = nodes.length;
      nameIdx.set(name, idx);
      nodes.push({ name, catIdx, color, symbol, symbolSize: size, extra });
      return idx;
    };
    // 账户节点
    result.gangs.forEach(g => {
      g.forEach(acc => {
        const v = result.perAcc.get(acc);
        addNode(acc, 0, riskColor(v.risk), "circle", Math.min(26, 10 + v.risk * 1.8), v);
      });
    });
    // 共享资源节点（仅 ≥2 账户共用且至少 1 个成员在团伙内）+ 边
    const RES_FIELDS = [["ipAcc", 1], ["devAcc", 2], ["addrAcc", 3]];
    for (const [mf, catIdx] of RES_FIELDS) {
      result.resources[mf].forEach((accSet, res) => {
        const members = [...accSet];
        if (members.length < 2) return;
        const hasSel = members.some(a => selSet.has(a));
        if (!hasSel) return;
        const ri = addNode(res, catIdx, RES_COLOR[catIdx], "rect", 12, { n: members.length });
        members.forEach(a => {
          if (!selSet.has(a)) return;
          const ai = addNode(a, 0, riskColor(result.perAcc.get(a).risk), "circle", Math.min(26, 10 + result.perAcc.get(a).risk * 1.8), result.perAcc.get(a));
          links.push({ source: ai, target: ri });
        });
      });
    }
    // ≤500 节点防护
    if (nodes.length > 500) {
      const keep = new Set(nodes.slice(0, 500).map(n => n.name));
      const idx2name = nodes.map(n => n.name);
      for (let i = nodes.length - 1; i >= 500; i--) { nameIdx.delete(idx2name[i]); nodes.pop(); }
      for (let i = links.length - 1; i >= 0; i--) {
        const l = links[i];
        if (!nameIdx.has(nodes[l.source].name) || !nameIdx.has(nodes[l.target].name)) links.splice(i, 1);
      }
    }
    return { nodes, links };
  }

  function renderGraph() {
    const el = $("#graphChart");
    const hint = $("#g-hint");
    if (!window.echarts) { hint.textContent = "需要联网加载 ECharts CDN"; return; }
    graphChart = graphChart || echarts.init(el);
    const showLabels = $("#g-show-labels").checked;
    const { nodes, links } = buildGraph();
    nodeById = new Map(nodes.map(n => [n.name, n]));
    lastGraph = { nodes, links };
    const dim = hl.size > 0 ? n => !hl.has(n.name) : () => false;
    const dimLink = hl.size > 0 ? l => !(hl.has(nodes[l.source].name) && hl.has(nodes[l.target].name)) : () => false;
    graphChart.setOption({
      legend: { data: CATS.map(c => c.name), top: 0, textStyle: { fontSize: 11 }, itemWidth: 14, itemHeight: 10 },
      tooltip: { show: true, formatter: p => p.dataType === "node" ? `${p.name}` : "" },
      series: [{
        type: "graph", layout: "force", roam: true, draggable: true,
        categories: CATS,
        force: { repulsion: 150, edgeLength: [50, 130], gravity: 0.06, friction: 0.6 },
        label: { show: showLabels, position: "right", fontSize: 9, color: "#5b6b7c" },
        labelLayout: { hideOverlap: true },
        lineStyle: { width: 1, curveness: 0.1 },
        emphasis: { itemStyle: { borderColor: "#0f2440", borderWidth: 2 } },
        data: nodes.map(n => ({
          id: n.name, name: n.name, category: n.catIdx, symbol: n.symbol, symbolSize: n.symbolSize,
          value: n.extra ? (n.extra.risk || n.extra.n || 0) : 0,
          itemStyle: { color: n.color, opacity: dim(n) ? 0.10 : 1 },
          label: { show: showLabels && !dim(n), fontSize: 9 }
        })),
        links: links.map(l => ({
          source: l.source, target: l.target,
          lineStyle: { opacity: dimLink(l) ? 0.06 : 0.5, color: "#9fb0c4" }
        }))
      }]
    }, true);
    hint.textContent = `${nodes.length} 节点 · ${links.length} 条共享边 · ${result.kpi.gangCount} 个团伙`;
    if (hl.size === 0) $("#graph-side").innerHTML =
      `<h4>选中节点</h4><div style="color:#6b7a8c;font-size:12px">点击账户或共享资源查看详情：账户高亮其所在团伙，资源高亮其共用账户。</div>`;
  }

  function sidebarFor(n) {
    const eng = window.AuditEngine;
    if (n.catIdx === 0) {
      const v = n.extra;
      const comp = componentOf(n.name);
      const tags = ["R1", "R2", "R3", "R4", "R5"].filter(r => v.hits.includes(r.toLowerCase()))
        .map(r => `<span class="tag hit">${r}</span>`).join("") || `<span class="tag ok">无规则命中</span>`;
      $("#graph-side").innerHTML =
        `<h4>${n.name} <span class="risk">${v.risk}</span></h4>
         <dl class="kv"><dt>注册日期</dt><dd>${eng.fmtDay(v.reg)}</dd><dt>订单数</dt><dd>${v.nOrders}</dd>
         <dt>凌晨7天峰值</dt><dd>${v.best}</dd><dt>注册后7天单量</dt><dd>${v.early}</dd>
         <dt>所属团伙</dt><dd>${comp.length} 个账户</dd></dl>
         <div class="chips">${tags}${comp.length >= 5 ? `<span class="tag ok">疑似团伙</span>` : ""}</div>`;
    } else {
      const mf = ["", "ipAcc", "devAcc", "addrAcc"][n.catIdx];
      const members = [...result.resources[mf].get(n.name)];
      const list = members.slice(0, 10).map(a => `${a}${selSet.has(a) ? " ·风险" + result.perAcc.get(a).risk : ""}`).join("、");
      $("#graph-side").innerHTML =
        `<h4>${n.name} <span class="tag ${n.catIdx === 3 ? "hit" : "ok"}">${CATS[n.catIdx].name}</span></h4>
         <dl class="kv"><dt>共用账户</dt><dd>${members.length} 个</dd></dl>
         <div style="font-size:12px;margin-top:6px;line-height:1.9">${list}</div>`;
    }
  }

  function bindGraphClick() {
    if (graphClickBound || !graphChart) return;
    graphClickBound = true;
    graphChart.on("click", p => {
      if (!p || p.dataType !== "node") return;
      const node = nodeById.get(p.name);
      if (!node) return;
      sidebarFor(node);
      if (node.catIdx === 0) {
        const comp = new Set(componentOf(p.name));
        hl = new Set(comp);
        for (const l of lastGraph.links) {
          const sn = lastGraph.nodes[l.source].name, tn = lastGraph.nodes[l.target].name;
          if (comp.has(sn)) hl.add(tn);
          if (comp.has(tn)) hl.add(sn);
        }
      } else {
        hl = new Set([p.name]);
        const mf = ["", "ipAcc", "devAcc", "addrAcc"][node.catIdx];
        (result.resources[mf].get(p.name) || []).forEach(a => { if (selSet.has(a)) hl.add(a); });
      }
      renderGraph();
    });
    graphChart.getZr().on("click", e => {
      if (!e.target) {
        hl = new Set();
        $("#graph-side").innerHTML = '<h4>选中节点</h4><div style="color:#6b7a8c;font-size:12px">点击账户或共享资源查看详情：账户高亮其所在团伙，资源高亮其共用账户。</div>';
        renderGraph();
      }
    });
  }

  /* ================= 复核台（D4） ================= */
  const REVIEW_KEY = "teamI_reviews_v1", OP_KEY = "teamI_operator";
  let reviews = loadReviews(), reviewFilter = "all";

  function loadReviews() {
    try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveReviews() { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews)); } catch (e) {} }
  function globalOp() { return localStorage.getItem(OP_KEY) || "auditor"; }
  function setGlobalOp(v) { try { localStorage.setItem(OP_KEY, v); } catch (e) {} }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function reviewList() {
    const arr = result.highRisk.map(id => ({ id, v: result.perAcc.get(id) }));
    arr.sort((a, b) => b.v.risk - a.v.risk || a.id.localeCompare(b.id));
    return arr;
  }
  function updateFilterCounts(list) {
    const c = { all: list.length, pending: 0, confirmed: 0, excluded: 0 };
    for (const { id } of list) { const s = (reviews[id] || {}).status || "pending"; c[s]++; }
    for (const k of ["all", "pending", "confirmed", "excluded"]) {
      const el = document.getElementById("fc-" + k);
      if (el) el.textContent = c[k];
    }
  }
  function renderReview() {
    const tb = $("#review-body");
    if (!tb || !result) return;
    const fmt = d => window.AuditEngine.fmtDay(d);
    const list = reviewList();
    updateFilterCounts(list);
    const rows = list.filter(({ id }) =>
      reviewFilter === "all" || ((reviews[id] || {}).status || "pending") === reviewFilter);
    tb.innerHTML = rows.length ? rows.map(({ id, v }) => {
      const r = reviews[id] || { status: "pending", operator: "", note: "", ts: "" };
      const sel = s => `value="${s}"` + (r.status === s ? " selected" : "");
      const tags = ["r1", "r2", "r3", "r4", "r5"].filter(k => v.hits.includes(k))
        .map(k => `<span class="tag hit">${k.toUpperCase()}</span>`).join("") || `<span class="tag ok">-</span>`;
      return `<tr data-id="${id}" class="tr-${r.status}">
        <td class="num">${id}</td><td class="num"><b>${v.risk}</b></td><td>${tags}</td>
        <td class="num">${v.nOrders}</td><td class="num">${fmt(v.reg)}</td>
        <td><select class="status"><option ${sel("pending")}>待处理</option><option ${sel("confirmed")}>确认</option><option ${sel("excluded")}>排除</option></select></td>
        <td><input class="r-op" type="text" value="${escHtml(r.operator || globalOp())}"></td>
        <td><input class="r-note" type="text" value="${escHtml(r.note)}" placeholder="备注，如：正常家庭设备共用"></td>
        <td class="num" style="font-size:11px;color:#6b7a8c">${r.ts || "-"}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" style="text-align:center;color:#6b7a8c">当前筛选下无记录</td></tr>`;
  }
  function setReview(id, patch) {
    const r = reviews[id] || { status: "pending", operator: "", note: "", ts: "" };
    if (patch.status) { r.status = patch.status; if (!r.ts) r.ts = patch.ts || new Date().toLocaleString(); }
    if (patch.operator !== undefined) r.operator = patch.operator;
    if (patch.note !== undefined) r.note = patch.note;
    reviews[id] = r;
    saveReviews();
  }
  function exportCsv() {
    const fmt = d => window.AuditEngine.fmtDay(d);
    const esc = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["account_id", "risk", "hit_rules", "orders", "reg_date", "status", "operator", "note", "reviewed_at"];
    const lines = [head.join(",")];
    for (const { id, v } of reviewList()) {
      const r = reviews[id] || { status: "pending", operator: "", note: "", ts: "" };
      lines.push([id, v.risk, v.hits.join("+"), v.nOrders, fmt(v.reg), r.status, r.operator || globalOp(), r.note, r.ts].map(esc).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit_review_log_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function bindReview() {
    const operator = $("#r-operator");
    operator.value = globalOp();
    operator.addEventListener("change", () => setGlobalOp(operator.value.trim() || "auditor"));
    $("#btn-export").addEventListener("click", exportCsv);
    $("#btn-clear").addEventListener("click", () => {
      if (confirm("确定清空全部复核记录？")) { reviews = {}; saveReviews(); renderReview(); }
    });
    $("#r-filters").addEventListener("click", e => {
      const btn = e.target.closest(".btn-f");
      if (!btn) return;
      reviewFilter = btn.dataset.f;
      document.querySelectorAll(".btn-f").forEach(b => b.classList.toggle("active", b === btn));
      renderReview();
    });
    $("#review-body").addEventListener("change", e => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      setReview(tr.dataset.id, { status: e.target.value, ts: new Date().toLocaleString() });
      renderReview();
    });
    $("#review-body").addEventListener("input", e => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const patch = {};
      if (e.target.classList.contains("r-op")) patch.operator = e.target.value;
      if (e.target.classList.contains("r-note")) patch.note = e.target.value;
      setReview(tr.dataset.id, patch);
    });
  }

  /* ================= 页签与初始化 ================= */
  function bindTabs() {
    const nav = $("#nav");
    nav.addEventListener("click", e => {
      const btn = e.target.closest("button[data-page]");
      if (!btn) return;
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      $("#page-" + btn.dataset.page).classList.add("active");
      nav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.page === "graph") { renderGraph(); bindGraphClick(); }
      if (btn.dataset.page === "review") { renderReview(); }
      if (trendChart) trendChart.resize();
      if (graphChart) graphChart.resize();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildRuleCards();
    bindTabs();
    $("#g-show-labels").addEventListener("change", () => renderGraph());
    bindReview();
    recompute();
    window.addEventListener("resize", () => { if (trendChart) trendChart.resize(); if (graphChart) graphChart.resize(); });
  });
})();