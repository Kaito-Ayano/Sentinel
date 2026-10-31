# Data dictionary / 数据字典 — synthetic orders v1.1

> Synthetic demonstration dataset · 合成演示数据集 · seed = 42 · **no real data / 不含真实数据**

## File: `synthetic_orders_demo.csv` (14,891 rows)

| Column | Type | Description (EN) | 说明 |
|---|---|---|---|
| order_id | string | Order identifier, `ORD` + 8 digits | 订单号 |
| account_id | string | Buyer account, `ACC` + 5 digits (1,571 accounts) | 账户号 |
| account_reg_date | date | Account registration date | 账户注册日期 |
| order_time | datetime | Order timestamp, minute precision, 2026-07-01 → 2026-09-28 (90 days) | 下单时间 |
| amount | number | Order amount (CNY) | 金额 |
| qty | int | Quantity 1–3 | 数量 |
| sku_id / category | string | 30 SKUs across 5 categories | 商品/类目 |
| ip | string | Client IP, `IP-xxxxx` | 下单 IP |
| device | string | Device fingerprint, `DV-xxxxx` | 设备指纹 |
| city | string | Almaty / Astana / Shymkent / Tashkent / Bishkek | 城市 |
| address / addr_id | string | Delivery address (one per account; 12–15% family-shared by 2–3 accounts) | 收货地址 |
| promo_day | 0/1 | Big-promo day flag (8/8, 8/18, 9/9, 9/18) | 大促日 |
| ship_status | string | delivered / cancelled / returned | 物流状态 |

## Generation logic / 生成逻辑

**Normal population / 正常人群** — 1,400 accounts, ~13,000 orders. Lognormal order counts; ordering hours weighted 9:00–23:00 (peak 20–22), ~4% night orders; ×2.5 volume on promo days; ~6% cancel/return; resources (address, IP, device) one per account, 12–15% family-shared within 2–3 accounts.

**Planted fraud rings / 植入团伙** — 8 rings, 171 accounts, ~1,800 orders. Registered 2–9 days before a promo day; each ring shares 2–3 IPs, 2–4 devices, 2–3 delivery addresses; ~85% of orders between 00:00–05:59; amounts fixed at 99 / 199 / 299 CNY; orders concentrated on promo days ±3; cancel+return ≈ 45%.

**Ground truth / 真值表** — `gang_truth.csv` maps every gang account to its shared IP / device / address. It exists only to validate rule precision (high-risk set ∩ ground truth = 171/172) and is **not loaded by the demo pages**.

## Reproduce / 复现

```bash
python gen_synthetic_orders.py   # requires only the Python standard library
```

Outputs: `synthetic_orders_demo.csv`, `gang_truth.csv`, `demo_data.js` (compact payload loaded by the demo pages).

## Disclaimer / 免责声明

This dataset is synthetic and for demonstration only. It does not represent any real marketplace, seller, or buyer, and must not be used to train production models or make real-world decisions. / 本数据集为合成演示数据，不代表任何真实平台、卖家或买家，不得用于生产建模或现实决策。
