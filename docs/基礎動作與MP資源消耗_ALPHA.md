# 基礎物理行動與 MP 資源 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：MP 的用途、MP=0 時的物理行動、Ability Rank 的預設 MP 成本、AI 成本裁決。  
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

# 5. MP 成本使用固定 Rank Reference，不跟 Max MP 比例上升

較早曾嘗試：

```text
Rank Cost = Max MP 的固定百分比
```

此方案取消。

原因：如果同一個 Rank 1 Ability 會因角色 Max MP 增加而自動變貴，就會造成：

```text
角色越強
→ 同一個低階能力反而越昂貴
```

這與長期成長方向相反。

Alpha 改回固定 Rank Reference，但使用比舊 `2 → 32` 更陡的曲線：

| Ability Rank | Default MP Cost |
|---:|---:|
| 1 | 1 |
| 2 | 2 |
| 3 | 4 |
| 4 | 7 |
| 5 | 11 |
| 6 | 17 |
| 7 | 25 |
| 8 | 36 |
| 9 | 50 |

這張表是 **Reference，不是所有能力的硬公式**。

重要結果：

```text
同一個已批准 Rank 1 Ability
→ 角色 Max MP 變高後仍維持原本 MP Cost
→ 低階能力在後期自然變得相對便宜
```

這是預期的角色成長回報，而不是漏洞。

高 Rank Ability 則因固定成本快速上升，自然要求更高 MP Pool；若角色 Current / Max MP 不足，就不能使用該能力，除非 Ability Profile 本身有經 GM 批准的特殊成本規則。

---

# 6. MP 成本不等於傷害倍率

不可理解為：

```text
Rank 9 MP Cost 是 Rank 1 的 50 倍
→ Rank 9 Damage 就必須剛好是 Rank 1 的 50 倍
```

MP Cost 是資源壓力，不是直接 Damage Multiplier。

Ability Rank 的總威力仍可來自：

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

因此高 Rank Ability 的總 Power 差距可以高於或低於單純 MP Cost 倍數，視整個 Ability Package 而定。

例如 Rank 9 可以把大量 Power Budget 放在：

```text
超大範圍
多目標
長持續
強控制
高傷害
複合效果
```

所以不能只用單體傷害倍率去反推 MP Cost。

---

# 7. AI 只在能力建立／修改時決定實際成本

為避免系統日後難以實作：

```text
每次施放
≠ 即時叫 AI 計 MP
```

正確流程：

```text
建立／修改 Ability
→ AI 參考 Rank Default MP Cost + Ability Power Package
→ 建議實際 MP Cost 並簡短解釋
→ Player 確認
→ GM 批准／修改
→ 最終 MP Cost 寫入 D1 Ability Profile

之後實際施放
→ 直接讀取已批准的 MP Cost
→ 不需要 AI
```

AI 可以因能力特性建議比 Default 更高或更低的成本，例如：

```text
同 Rank 但大範圍／多目標／長持續
→ 可建議較高成本

同 Rank 但限制很多／風險很高／用途很窄
→ 可建議較低成本
```

但低 Rank Ability 不會因角色 Max MP 增加而被系統自動加價。

GM 為最終裁決者。

---

# 8. MP 支付時點

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

# 9. Alpha 鎖定結論

1. 不為普通拳、腳、揮劍等建立大量額外 Ability；合理普通物理行動天然可做。
2. MP 是「額外輸出／特殊效果」資源，不是角色能否做普通物理動作的開關。
3. MP=0 時仍可普通徒手／武器攻擊、移動、投擲、推拉等。
4. MP=0 的普通物理輸出以身體／武器 Source Damage Profile + 適用 Damage Bonus 為核心，不取得主動 Ability、附魔或專精的額外 Damage Enhancement。
5. MP=0 不會全域刪除仍合法存在的 Status；各 Status 是否需要 upkeep 由自身 Profile 決定。
6. 具名主動物理／元素能力預設共用 MP。
7. Max MP 百分比成本取消；低 Rank Ability 不會因角色 Max MP 增長而自動變貴。
8. Alpha Default MP Cost Reference 為：`1, 2, 4, 7, 11, 17, 25, 36, 50`（Rank 1–9）。
9. MP Cost 不需要與 Damage 倍率一比一；Rank Power 還包括範圍、控制、治療、多段、持續等總效果。
10. AI 只在 Ability 建立／修改時提出實際 MP Cost；GM 批准後固定保存於 D1，實際每次施放不需要 AI 即時計算。
11. 角色後期 Max MP 增加後，低階能力自然變得相對便宜，視為成長回報。
12. 不為這套簡化額外新增 Stamina、氣力或另一條普通攻擊技能樹。
13. 所有正式 Ability、MP Cost、Profile 與 GM 裁決保存於 D1。
