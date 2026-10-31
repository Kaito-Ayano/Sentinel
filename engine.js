/* engine.js — Team I demo 计算内核
 * 契约 = 《TeamA_TeamI_规格说明书》v1.1 §3，与 verify_engine_contract.py 镜像逐条一致。
 * 数据接口：../demo_data.js 提供 const ORDER_COLS / const ORDERS（15 列，见 ORDER_COLS）。
 */
(function () {
  "use strict";

  const THRESH = { r1: 5, r2: 3, age: 7, ip: 5, dev: 3, addr: 5, amt: 8, share: 4 };
  const WEIGHTS = { r1: 3, r2: 2, r3: 2, r4: 2, r5: 2 };
  const HIGH_RISK = 4;
  const DAY = 864e5;

  function parseTs(s) { // "YYYY-MM-DD HH:MM"
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
  }
  function parseD(s) { // "YYYY-MM-DD"
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  }
  function fmtDay(d) {
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function mapAdd(m, k, v) {
    let s = m.get(k);
    if (!s) { s = new Set(); m.set(k, s); }
    s.add(v);
  }

  function compute(orders, override) {
    const t = Object.assign({}, THRESH, override || {});

    /* ---- 账户索引 ---- */
    const acc = new Map();
    for (const o of orders) {
      let a = acc.get(o[1]);
      if (!a) {
        a = { id: o[1], reg: parseD(o[2]), orders: [], ips: new Set(), devs: new Set(), addrs: new Set() };
        acc.set(o[1], a);
      }
      a.orders.push({ ts: parseTs(o[3]), day: o[3].slice(0, 10), amt: o[4] });
      a.ips.add(o[8]); a.devs.add(o[9]); a.addrs.add(o[12]);
    }

    /* ---- 资源 -> 账户集合 ---- */
    const ipAcc = new Map(), devAcc = new Map(), addrAcc = new Map();
    for (const a of acc.values()) {
      for (const x of a.ips) mapAdd(ipAcc, x, a.id);
      for (const x of a.devs) mapAdd(devAcc, x, a.id);
      for (const x of a.addrs) mapAdd(addrAcc, x, a.id);
    }
    const cntHot = (m, th) => new Set([...m].filter(([, s]) => s.size >= th).map(([k]) => k));
    const ipHot = cntHot(ipAcc, t.ip);
    const devHot = cntHot(devAcc, t.dev);
    const addrHot = cntHot(addrAcc, t.addr);
    const sharedRes = cntHot(new Map([...ipAcc, ...devAcc, ...addrAcc]), t.share); // R5 前置：被 ≥share 个账户共用

    /* ---- R5 热门金额：同一金额 7 天滑动窗口出现 ≥amt 次 ---- */
    const amtDaily = new Map();
    const amtAcc = new Map();
    for (const o of orders) {
      let m = amtDaily.get(o[4]);
      if (!m) { m = new Map(); amtDaily.set(o[4], m); }
      m.set(o[3].slice(0, 10), (m.get(o[3].slice(0, 10)) || 0) + 1);
      mapAdd(amtAcc, o[4], o[1]);
    }
    const hotAmt = new Set();
    const r5Top = [];
    for (const [amt, m] of amtDaily) {
      const days = [...m.keys()].sort();
      let peak = 0;
      outer:
      for (let i = 0; i < days.length; i++) {
        let s = 0;
        for (let j = i; j < days.length; j++) {
          if (parseD(days[j]) - parseD(days[i]) > 6 * DAY) break;
          s += m.get(days[j]);
          if (s > peak) peak = s;
          if (s >= t.amt) { hotAmt.add(amt); break outer; }
        }
      }
      r5Top.push({ amount: amt, peak: peak, nAcc: amtAcc.get(amt).size });
    }
    r5Top.sort((a, b) => b.peak - a.peak);

    /* ---- 逐账户规则命中 ---- */
    const perAcc = new Map();
    for (const a of acc.values()) {
      const hits = new Set();
      // R1：任意 7 天窗口内 00:00–05:59 订单数峰值
      const nights = a.orders.filter(o => o.ts.getHours() <= 5).map(o => o.ts.getTime()).sort((x, y) => x - y);
      let best = 0;
      for (let i = 0; i < nights.length; i++) {
        let j = i;
        while (j < nights.length && nights[j] - nights[i] <= 7 * DAY) j++;
        if (j - i > best) best = j - i;
      }
      if (best >= t.r1) hits.add("r1");
      // R2：注册后 age 天内下单笔数（早期爆发）
      let early = 0;
      for (const o of a.orders) {
        const d = Math.floor((o.ts - a.reg) / DAY);
        if (d >= 0 && d <= t.age) early++;
      }
      if (early >= t.r2) hits.add("r2");
      // R3：共享 IP/设备；R4：地址聚集；R5：共享资源 + 热门金额
      let r3 = false, shRes = false;
      for (const x of a.ips) { if (ipHot.has(x)) r3 = true; if (sharedRes.has(x)) shRes = true; }
      for (const x of a.devs) { if (devHot.has(x)) r3 = true; if (sharedRes.has(x)) shRes = true; }
      for (const x of a.addrs) { if (addrHot.has(x)) hits.add("r4"); if (sharedRes.has(x)) shRes = true; }
      if (r3) hits.add("r3");
      if (shRes && a.orders.some(o => hotAmt.has(o.amt))) hits.add("r5");

      const risk = [...hits].reduce((s, x) => s + WEIGHTS[x], 0);
      perAcc.set(a.id, { hits: [...hits], risk: risk, best: best, early: early, reg: a.reg, nOrders: a.orders.length });
    }

    /* ---- 团伙识别：共享资源连通分量，分量内 ≥2 账户命中 ≥2 条规则 ---- */
    const parent = Object.create(null);
    for (const id of acc.keys()) parent[id] = id;
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    for (const m of [ipAcc, devAcc, addrAcc]) {
      for (const [, s] of m) {
        const v = [...s];
        for (let i = 1; i < v.length; i++) uni(v[0], v[i]);
      }
    }
    const comps = new Map();
    for (const id of acc.keys()) {
      const r = find(id);
      if (!comps.has(r)) comps.set(r, []);
      comps.get(r).push(id);
    }
    const gangs = [];
    for (const c of comps.values()) {
      if (c.length < 2) continue;
      if (c.filter(id => perAcc.get(id).hits.length >= 2).length >= 2) gangs.push(c);
    }

    /* ---- KPI 与近 30 日趋势 ---- */
    const highRisk = [...perAcc].filter(([, v]) => v.risk >= HIGH_RISK).map(([id]) => id).sort();
    const highSet = new Set(highRisk);
    let anomalyOrders = 0;
    let maxDay = "0000-00-00";
    for (const o of orders) { const d = o[3].slice(0, 10); if (d > maxDay) maxDay = d; }
    const start = parseD(maxDay).getTime() - 29 * DAY;
    const trend = [];
    for (let k = 0; k < 30; k++) trend.push({ date: fmtDay(new Date(start + k * DAY)), count: 0 });
    const trendIdx = new Map(trend.map(x => [x.date, x]));
    for (const o of orders) {
      if (!highSet.has(o[1])) continue;
      anomalyOrders++;
      const slot = trendIdx.get(o[3].slice(0, 10));
      if (slot) slot.count++;
    }

    return {
      params: t,
      perAcc: perAcc,
      highRisk: highRisk,
      gangs: gangs,
      resources: { ipAcc: ipAcc, devAcc: devAcc, addrAcc: addrAcc },
      kpi: {
        totalOrders: orders.length,
        accounts: acc.size,
        anomalyOrders: anomalyOrders,
        anomalyShare: orders.length ? 100 * anomalyOrders / orders.length : 0,
        highRiskCount: highRisk.length,
        gangCount: gangs.length
      },
      trend: trend,
      r5Top: r5Top.slice(0, 10)
    };
  }

  window.AuditEngine = { compute: compute, THRESH: THRESH, WEIGHTS: WEIGHTS, HIGH_RISK: HIGH_RISK, parseTs: parseTs, parseD: parseD, fmtDay: fmtDay };
})();