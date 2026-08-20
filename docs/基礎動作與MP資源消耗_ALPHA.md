# 基礎物理行動與 MP 資源 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：MP 的用途、MP=0 時的物理行動、Ability Rank 的預設 MP 成本、特殊級別、AI 成本裁決與 MP 回復框架。  
> 本文件覆蓋較早 `Rank 1 = 2 MP ... Rank 9 = 32 MP` 的舊固定成本表、其後短暫採用的 Max MP 百分比成本表，以及需要為每種普通拳腳／揮劍建立額外 Ability 層的設計。

---

# 1. Alpha 先保持簡單

不為普通物理行動建立大量額外技能／Ability。

角色天然可以做合理的普通物理行動，例如：

```text
揮拳
踢擊
用持有的劍普通斬擊
用槍普通刺擊
用錘普通敲擊
推、拉、撞
投擲合理物件
其他身體與裝備本身可以完成的普通動作
```

這些行動不是具名能力，不需要另外建立「普通揮拳」、「普通踢擊」、「普通斬擊」等 Ability。

需要 D100 時，沿用既有判定／對抗框架與最接近的角色、專精、Source/Profile 資料；Alpha 不再為此新增另一套普通攻擊技能樹。

---

# 2. MP 的核心意思：額外輸出／特殊效果資源

MP 不是「角色有沒有能力揮拳或揮劍」的開關。

Alpha 將 MP 理解為角色用來取得超越普通物理輸出的資源，例如：

```text
具名物理招式
元素／魔法能力
額外傷害
特殊範圍
多段攻擊
控制／位移
治療
主動 Buff
附魔
其他 Ability Profile 明確定義的額外優勢
```

因此：

```text
有 MP
→ 可以支付能力成本，取得該 Ability Profile 的額外效果

沒有 MP
→ 仍可做普通物理行動
→ 但不能靠 MP 驅動的 Ability／強化層取得額外輸出
```

---

# 3. MP = 0 的最小物理模式

當：

```text
Current MP = 0
```

角色仍然可以正常：

```text
移動
普通徒手攻擊
普通武器攻擊
投擲
推／拉／撞
一般物件互動
被動閃避／抵抗／防守
```

但其普通攻擊不取得「主動強化層」的額外輸出。

Alpha 可將 MP=0 的普通物理 Damage Output 簡化理解為：

```text
Base Physical Output
= 身體／武器／物品本身的 Damage Profile
+ 角色本身適用的 Damage Bonus
```

不另外加入：

```text
具名 Ability 的額外傷害
Ability 的特殊控制／位移／多段
主動元素附魔的額外輸出
專精所提供的額外 Damage Enhancement
其他明確依賴特殊技巧／能量啟動的傷害強化
```

這裡只限制「額外輸出」，不代表 Current MP 一到 0 就刪除世界上所有既有 Status。

例如已經存在而且仍未到期的防禦狀態、外部效果或劇情 Status，仍按自身 Profile 處理；是否需要維持 MP 由該 Profile 決定。

專精仍可保存角色熟練度、能力取得／使用資格與成長資料；`MP=0` 只是不讓專精額外放大普通攻擊的 Damage Output。

---

# 4. 具名主動能力仍需要 MP

Alpha 目前所有需要主動啟動的具名能力，無論是：

```text
物理
光
暗
火
水
風
土
雷
木
```

預設均使用 MP 作共同資源。

```text
Current MP < Ability MP Cost
→ 不能啟動該能力
```

不容許 MP 變成負數。

普通物理行動則不需要 MP。

---

# 5. Rank 1–9 使用固定 MP Reference

Alpha 使用固定 Rank Reference，並以明顯的量級差距拉開高低階能力：

| Ability Rank | Default MP Cost |
|---:|---:|
| 1 | 1 |
| 2 | 5 |
| 3 | 10 |
| 4 | 20 |
| 5 | 40 |
| 6 | 80 |
| 7 | 160 |
| 8 | 320 |
| 9 | 640 |

這張表是 **Reference，不是所有能力的硬公式**。

同一個已批准的低 Rank Ability 不會因角色 Max MP 增加而自動變貴，因此後期角色可以更輕鬆地重複使用低階能力。

角色 Max MP 現按 Level 1–100 Alpha 共用成長倍率計算：

```text
G(Level)
= 1 + ((Level - 1) / 21.7)²

Base MP
= INT × 3

Max MP
= floor(Base MP × G(Level))
```

因此 Level 1 保留原本 `INT × 3` 的起始基準，而 INT 的差異會隨角色成長繼續保持實際影響。

以 `INT = 12` 為例：

```text
Lv1   → 36 MP
Lv30  → 100 MP
Lv50  → 219 MP
Lv70  → 399 MP
Lv80  → 513 MP
Lv85  → 575 MP
Lv90  → 641 MP
Lv95  → 711 MP
Lv100 → 785 MP
```

現行 Rank 9 Reference 為 `640 MP`。標準 `INT = 12` 角色約在 Level 90 自然跨過一次 Rank 9 的資源門檻；低 INT 角色可能仍需裝備、Buff 或其他正式來源提高 Max / Current MP。

擁有／符合 Rank 9 Ability 的資格，與角色是否有足夠 Current / Max MP 施放，仍是兩個不同問題。

---

# 6. 新增「特殊」級別：由 MP 反推 Power

除 Rank 1–9 外，Ability 可以被標記為：

```text
能力階級：特殊
```

`特殊` **不是 Rank 10**，亦不使用固定的 Default MP Cost。

普通 Rank 1–9 的設計方向是：

```text
Rank
→ 提供大概 Power Budget
→ 再決定合理 MP Cost
```

`特殊` 則反過來：

```text
批准使用的 MP Amount
→ 作為主要 Power Budget 參考
→ AI / GM 再合理化整個 Effect Package
```

因此特殊能力的 Power 包括，而不只限於：

```text
直接傷害
治療
控制強度
控制持續時間
範圍
目標數
射程
多段／投射物
位移
Buff / Debuff
環境／場地效果
其他批准的特殊機械效果
```

例如，一個幾乎沒有傷害、但具有極強範圍控制的特殊能力，仍然可以因其高 MP 成本而取得高 Power Budget；系統不得只用 Damage 數字判斷它是否值得該 MP。

同樣，一個純高傷害的特殊能力亦要把大量 Power Budget 消耗在 Damage 上，因此不能同時免費取得同等級的大範圍、長控制與多目標效果。

## 6.1 Alpha 實作原則

為保持系統容易實作，特殊能力在建立／修改時仍必須產生一個已批准的 Ability Profile：

```text
ability_rank = SPECIAL
mp_cost = 已批准整數
完整 Effect Profile = 已批准結果
```

AI 只在能力建立／修改時，根據 MP Amount 與能力概念提出 Power Package；Player 確認後交 GM 批准。

正式施放時：

```text
讀取已批准 mp_cost
→ 扣 MP
→ 直接按已保存 Effect Profile 結算
```

不需要每次施放都即時叫 AI 重新計算 Power。

如果未來需要「同一招可以自由投入不同 MP、威力隨投入量變動」，再另行設計 Variable-MP Profile；Alpha 不預設所有特殊能力都具有動態投入功能。

---

# 7. MP 成本不等於傷害倍率

不可理解為：

```text
MP Cost 高 X 倍
→ Damage 必須剛好高 X 倍
```

MP Cost 是整個 Ability Power Package 的資源壓力，不是單一 Damage Multiplier。

Ability 的總威力可以分配在：

```text
Damage
Healing
範圍
目標數
多段／投射物
持續時間
控制
Buff / Debuff
位移
可靠性
限制條件
其他效果
```

因此高 MP 能力可能主要強在 Damage，也可能主要強在 Control、Area、Duration 或複合效果。

---

# 8. AI 只在能力建立／修改時決定實際成本與 Power

為避免系統日後難以實作：

```text
每次施放
≠ 即時叫 AI 計 MP / Power
```

Rank 1–9：

```text
建立／修改 Ability
→ AI 參考 Rank Default MP Cost + Ability Power Package
→ 建議實際 MP Cost
→ Player 確認
→ GM 批准／修改
→ 寫入 D1
```

特殊：

```text
建立／修改 Ability
→ 先確定／建議 MP Amount
→ AI 以該 MP Amount 作主要 Power Budget 參考
→ 生成完整 Damage / Control / Area / Duration 等 Effect Package
→ Player 確認
→ GM 批准／修改
→ 寫入 D1
```

之後實際施放一律直接讀取已批准 Profile，不需要 AI。

---

# 9. MP 支付時點

Alpha 預設：

```text
宣告並正式啟動 Ability
→ 檢查 MP 足夠
→ 支付 MP
→ 進入 D100／對抗／效果結算
```

普通失敗、大失敗、被抵抗或未命中，預設不退款。

大成功放大效果時亦不額外收取第二次 MP，除非 Ability Profile 明確另有規則。

---

# 10. MP 回復框架

Alpha 鎖定採用「主動回復 + 休息回復」，不提供每回合免費 MP 自然回復。

## 10.1 戰鬥內：集中

戰鬥中不會因為輪到角色行動就自動回復 MP。

角色可以使用自己的 **主行動** 執行：

```text
集中
→ 佔用本回合主行動
→ 回復 ceil(Max MP × 5%)
```

`集中` 是正式基礎動作，不需要額外建立 Ability，也不預設需要 D100 判定。

因此同一回合正常情況下不能同時用主行動 `集中`，又再用主行動攻擊或施放另一個主動 Ability。

除非特殊 Profile 明確另有規則，倒地瀕死、失去行動能力或其他無法正常使用主行動的角色不能執行 `集中`。

## 10.2 戰鬥外：短休與長休

`短休` 與 `長休` **只可以在非戰鬥狀態進行**。一旦角色仍處於正式戰鬥狀態，就不能開始或完成休息回復。

休息以「回合」作 Alpha 時間單位追蹤，即使當時不在戰鬥；**開始休息的那一回合已計入總回合數**。

### 短休

```text
短休所需時間 = 2 回合
短休 MP 回復 = ceil(Max MP × 25%)
```

計時例：

```text
第 1 回合：宣告／開始短休 ← 已算第 1 回合
第 2 回合：完成短休 → 回復 25% Max MP
```

### 長休

```text
長休所需時間 = 5 回合
長休 MP 回復 = 100% Max MP
```

計時例：

```text
第 1 回合：宣告／開始長休 ← 已算第 1 回合
第 2 回合：持續休息
第 3 回合：持續休息
第 4 回合：持續休息
第 5 回合：完成長休 → Current MP 回復至 Max MP
```

休息回復在完成所需回合後一次結算，不按每個休息回合逐段發放。

如果在完成之前重新進入戰鬥，該次休息尚未完成，因此不取得該次短休／長休的 MP 回復；之後需要重新開始一次新的完整休息。

短休與長休的這套規則目前只定義 **MP 回復**；HP 的休息／自然回復另行設計，不自動沿用上述百分比。

## 10.3 共通限制

所有普通 MP 回復均受以下限制：

```text
Current MP <= Max MP
```

普通集中／短休／長休不得令 Current MP 超過 Max MP。任何突破 Max MP 的 Temporary MP、Overcharge 或特殊效果必須由獨立 Profile 明確批准。

---

# 11. Alpha 鎖定結論

1. 不為普通拳、腳、揮劍等建立大量額外 Ability；合理普通物理行動天然可做。
2. MP 是「額外輸出／特殊效果」資源，不是角色能否做普通物理動作的開關。
3. MP=0 時仍可普通徒手／武器攻擊、移動、投擲、推拉等。
4. MP=0 的普通物理輸出以身體／武器 Source Damage Profile + 適用 Damage Bonus 為核心，不取得主動 Ability、附魔或專精的額外 Damage Enhancement。
5. MP=0 不會全域刪除仍合法存在的 Status；各 Status 是否需要 upkeep 由自身 Profile 決定。
6. 具名主動物理／元素能力預設共用 MP。
7. Rank 1–9 Default MP Cost Reference 為：`1, 5, 10, 20, 40, 80, 160, 320, 640`。
8. 新增非數字能力級別 `特殊 / SPECIAL`；它不是 Rank 10。
9. Rank 1–9 主要由 Rank 提供 Power Budget；特殊能力主要由已批准 MP Amount 反推／合理化 Power Budget。
10. Power 同時包括 Damage、Healing、Control、Area、Target Count、Duration、Movement、Buff/Debuff 等，不只看傷害。
11. 特殊能力建立後仍保存固定 `mp_cost + Effect Profile`；施放時不需要 AI 即時計算。
12. 動態可變 MP 投入不是 Alpha 預設，未來如需要再另行擴充。
13. Current Alpha Max MP 使用 `floor(INT × 3 × [1 + ((Level - 1) / 21.7)²])`；標準 INT 12 角色約在 Level 90 跨過 Rank 9 的 `640 MP` Reference。
14. 戰鬥內沒有免費的每回合 MP 自然回復；角色可花主行動使用 `集中`，回復 `ceil(Max MP × 5%)`。
15. `短休` 與 `長休` 只可在非戰鬥狀態進行。
16. `短休` 需要 2 回合並回復 `ceil(Max MP × 25%)`；開始休息的回合計入 2 回合內。
17. `長休` 需要 5 回合並把 Current MP 回復至 Max MP；開始休息的回合計入 5 回合內。
18. 休息在完成前若重新進入戰鬥，該次休息不結算 MP 回復，之後需要重新開始。
19. 普通 MP 回復不得超過 Max MP；任何超額 MP 必須由獨立正式 Profile 定義。
20. HP 的休息／自然回復規則另行設計，不自動沿用 MP 百分比。
21. 不為這套簡化額外新增 Stamina、氣力或另一條普通攻擊技能樹。
22. 所有正式 Ability、MP Cost、Profile 與 GM 裁決保存於 D1。
