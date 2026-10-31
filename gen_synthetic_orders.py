# -*- coding: utf-8 -*-
"""Team I demo data v1.1: realistic resource sparsity (spec v1.1 §2)."""
import csv, json, random, datetime as dt

random.seed(42)
OUT = r"demo_specs"

D0 = dt.date(2026, 7, 1)
DAYS = 90
PROMO = [dt.date(2026, 8, 8), dt.date(2026, 8, 18), dt.date(2026, 9, 9), dt.date(2026, 9, 18)]
PROMO_SET = set(PROMO)
CATS = {"数码": (199, 1299), "家居": (59, 399), "服饰": (79, 459), "美妆": (49, 259), "食品": (19, 129)}
SKUS = []
for c in sorted(CATS):
    lo, hi = CATS[c]
    for _ in range(6):
        SKUS.append(("SKU%03d" % (len(SKUS) + 1), c, round(random.uniform(lo, hi))))
CITIES = ["Almaty", "Astana", "Shymkent", "Tashkent", "Bishkek"]
STREETS = ["Abai", "Dostyk", "Panfilov", "Navoi", "Amir Temur", "Sain", "Al-Farabi"]

# ---- resource registries (sparse: mostly 1 account per resource, families share 2-3) ----
addr_list, ip_list, dev_list = [], [], []

def new_res(reg, kind):
    i = len(reg) + 1
    if kind == "addr":
        city = CITIES[i % len(CITIES)]
        r = {"id": "A%04d" % i, "city": city,
             "text": "%s, %s Street %d-%d" % (city, random.choice(STREETS), random.randint(1, 88), random.randint(1, 99)),
             "cap": 3, "used": 1}
    elif kind == "ip":
        r = {"id": "IP-%05d" % i, "cap": 3, "used": 1}
    else:
        r = {"id": "DV-%05d" % i, "cap": 3, "used": 1}
    reg.append(r)
    return r

def pick_res(reg, kind, join_p):
    if reg and random.random() < join_p:
        avail = [r for r in reg if r["used"] < r["cap"]]
        if avail:
            r = random.choice(avail)
            r["used"] += 1
            return r
    return new_res(reg, kind)

def gang_res(reg, kind, size):
    r = new_res(reg, kind)
    r["cap"] = size          # dedicated shared resource for the gang
    r["used"] = 0
    return r

rows = []
oid_n = 0
def next_oid():
    global oid_n
    oid_n += 1
    return "ORD%08d" % oid_n

def rand_time_night():
    h = 0 if random.random() < 0.6 else random.randint(1, 5)
    return h, random.randint(0, 59)

def rand_time_day():
    weights = {9: 3, 10: 4, 11: 4, 12: 5, 13: 4, 14: 4, 15: 4, 16: 4, 17: 4, 18: 5, 19: 6, 20: 8, 21: 9, 22: 8, 23: 5}
    h = random.choices(list(weights), weights=list(weights.values()))[0]
    return h, random.randint(0, 59)

def pick_date():
    while True:
        d = D0 + dt.timedelta(days=random.randint(0, DAYS - 1))
        if d in PROMO_SET:
            if random.random() < 0.30:
                return d
        elif random.random() < 0.72:
            return d

def add_order(acc, reg, when, amount, qty, sku, cat, ip, dev, city, addr_id, addr, promo, status):
    rows.append([next_oid(), acc, reg.isoformat(), when.strftime("%Y-%m-%d %H:%M"), amount, qty,
                 sku, cat, ip, dev, city, addr, addr_id, promo, status])

# ---------- normal population (sparse resources) ----------
acc_n = 0
for _ in range(1400):
    acc_n += 1
    acc = "ACC%05d" % acc_n
    reg = D0 - dt.timedelta(days=random.randint(1, 400))
    if random.random() < 0.20:
        reg = D0 + dt.timedelta(days=random.randint(0, DAYS - 20))
    ad = pick_res(addr_list, "addr", 0.12)
    ip = pick_res(ip_list, "ip", 0.15)
    dv = pick_res(dev_list, "dev", 0.15)
    n = max(1, min(40, int(random.lognormvariate(1.9, 0.9))))
    for _ in range(n):
        d = pick_date()
        if random.random() < 0.04:
            h, m = rand_time_night()
        else:
            h, m = rand_time_day()
        when = dt.datetime.combine(d, dt.time(h, m))
        sku, cat, price = random.choice(SKUS)
        disc = random.uniform(0.80, 0.97)
        amount = round(price * (disc if d in PROMO_SET else 1.0), 0)
        r = random.random()
        status = "delivered" if r > 0.12 else ("cancelled" if r > 0.06 else "returned")
        add_order(acc, reg, when, amount, random.randint(1, 3), sku, cat, ip["id"], dv["id"],
                  ad["city"], ad["id"], ad["text"], 1 if d in PROMO_SET else 0, status)

# ---------- gangs (heavy sharing, new accounts, night bursts) ----------
GANG_SIZES = [38, 30, 26, 22, 18, 15, 12, 10]
truth = []
gid = 0
for size in GANG_SIZES:
    gid += 1
    promo_day = PROMO[gid % len(PROMO)]
    g_ips = [gang_res(ip_list, "ip", size)["id"] for _ in range(random.randint(2, 3))]
    g_devs = [gang_res(dev_list, "dev", size)["id"] for _ in range(random.randint(2, 4))]
    g_addrs = [gang_res(addr_list, "addr", size) for _ in range(random.randint(2, 3))]
    for _ in range(size):
        acc_n += 1
        acc = "ACC%05d" % acc_n
        reg = promo_day - dt.timedelta(days=random.randint(2, 9))
        if reg < D0:
            reg = D0
        ip = random.choice(g_ips)
        dev = random.choice(g_devs)
        ad = random.choice(g_addrs)
        for _ in range(random.randint(6, 15)):
            if random.random() < 0.60:
                d = promo_day + dt.timedelta(days=random.choice([-3, -2, -1, 0, 0, 1, 2, 3]))
            else:
                d = promo_day + dt.timedelta(days=random.randint(-6, 6))
            if d < D0 or d > D0 + dt.timedelta(days=DAYS - 1):
                d = promo_day
            if random.random() < 0.85:
                h, m = rand_time_night()
            else:
                h, m = rand_time_day()
            when = dt.datetime.combine(d, dt.time(h, m))
            amount = float(random.choice([99, 199, 299]))
            sku, cat, _ = random.choice(SKUS[:18])
            r = random.random()
            status = "delivered" if r > 0.45 else ("cancelled" if r > 0.20 else "returned")
            add_order(acc, reg, when, amount, random.randint(1, 2), sku, cat, ip, dev,
                      ad["city"], ad["id"], ad["text"], 1 if d in PROMO_SET else 0, status)
            truth.append([gid, acc, ip, dev, ad["id"]])

rows.sort(key=lambda r: r[3])

with open(OUT + r"\synthetic_orders_demo.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh)
    w.writerow(["order_id", "account_id", "account_reg_date", "order_time", "amount", "qty",
                "sku_id", "category", "ip", "device", "city", "address", "addr_id", "promo_day", "ship_status"])
    w.writerows(rows)
with open(OUT + r"\gang_truth.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh)
    w.writerow(["gang_id", "account_id", "ip", "device", "addr_id"])
    w.writerows(sorted(set(map(tuple, truth))))

cols = ["order_id", "account_id", "account_reg_date", "order_time", "amount", "qty", "sku_id",
        "category", "ip", "device", "city", "address", "addr_id", "promo_day", "ship_status"]
with open(OUT + r"\demo_data.js", "w", encoding="utf-8") as fh:
    fh.write("// 合成演示数据（非真实数据）| Deloitte Digital Camp Team I demo | data v1.1\n")
    fh.write("// generated by gen_synthetic_orders.py (seed=42)\n")
    fh.write("const ORDER_COLS=" + json.dumps(cols, ensure_ascii=False) + ";\n")
    fh.write("const ORDERS=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n")

from collections import Counter
acc_cnt = Counter(r[1] for r in rows)
gang_accs = set(t[1] for t in truth)
fam_addr = sum(1 for a in addr_list if a["used"] >= 2)
fam_ip = sum(1 for r in ip_list if r["used"] >= 2)
print("orders=%d accounts=%d gang_accounts=%d gang_orders=%d" % (
    len(rows), len(acc_cnt), len(gang_accs), sum(1 for r in rows if r[1] in gang_accs)))
print("resources: addr=%d(family-shared=%d) ip=%d(%d) dev=%d(%d)" % (
    len(addr_list), fam_addr, len(ip_list), fam_ip, len(dev_list), sum(1 for r in dev_list if r["used"] >= 2)))