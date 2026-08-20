# 瀕死、死亡與角色鎖定 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：HP 歸零、倒地／瀕死、體質決定瀕死回合、瀕死期間受傷、死亡確認、死亡角色鎖定與摸屍。  
> 本文件與 `COMBAT_DAMAGE_MODEL_ALPHA.md`、`治療與過量治療_ALPHA.md`、`CANONICAL_CHARACTER_STATUS_RULES.md` 一起使用。

---

# 1. HP 歸零即進入「倒地 + 瀕死」

Alpha Canonical：

```text
Current HP <= 0
→ Current HP 鎖為 0
→ 狀態 = 倒地 + 瀕死
```

Alpha 暫時不使用負 HP。

因此：

```text
HP 4
受到 9 點有效傷害
→ HP = 0
→ 進入倒地／瀕死
```

不在 Alpha 另外加入「負 HP 多低會立即死亡」或 Massive Damage 規則。

---

# 2. 瀕死可維持回合數由 CON／體質決定

Alpha Working Formula：

```text
瀕死回合數 = ceil(CON / 5)
```

正常角色 CON 範例：

| CON | 瀕死回合數 |
|---:|---:|
| 3–5 | 1 |
| 6–10 | 2 |
| 11–15 | 3 |
| 16–20 | 4 |

如未來存在超出一般範圍的 CON，仍沿用同一公式，除非特殊 Profile 明確覆蓋。

---

# 3. 瀕死倒數如何計算

角色進入瀕死時：

```text
dying_rounds_remaining = ceil(CON / 5)
```

瀕死角色在自己的正常回合不進行一般行動。

每次到該角色自己的回合結束時：

```text
dying_rounds_remaining -= 1
```

若扣至：

```text
dying_rounds_remaining = 0
```

而角色仍然是：

```text
Current HP = 0
狀態 = 瀕死
```

則立即確認死亡。

這樣每一點「瀕死回合」都代表隊友實際擁有一次完整救援窗口。

---

# 4. 瀕死期間被成功治療

只要在死亡確認前，治療真正落地並令：

```text
Current HP > 0
```

則：

```text
→ 解除瀕死
→ dying_rounds_remaining 清除
→ 角色恢復為存活狀態
```

治療仍先按 `治療與過量治療_ALPHA.md` 與目標 Profile 處理。

因此：

```text
治療免疫
治療轉傷害
治療 Great Failure 誤中其他目標
```

等情況都可能令救援沒有真正把瀕死角色救回。

角色脫離瀕死後，不會自動因為回血而站起來；實際姿勢、位置與是否仍倒地按場景狀態處理。

---

# 5. 瀕死期間再次承受有效傷害 = 直接死亡

Alpha Canonical：

```text
狀態 = 瀕死
且
再次承受任何有效傷害
→ 立即死亡
```

這裡的「有效傷害」指傷害真正通過既有結算並對角色形成傷害結果。

不包括：

```text
Miss
Damage Result <= 0
完全被護甲／抗性／護盾擋住的攻擊
沒有真正造成傷害的敘事接觸
```

包括：

```text
普通攻擊傷害
持續傷害
燃燒／中毒等 Damage Effect
環境傷害
其他真正造成有效傷害的來源
```

一旦符合，不再重置瀕死倒數，也不再額外作死亡豁免骰。

---

# 6. 死亡確認條件

Alpha 只有兩個主要死亡入口：

```text
A. 瀕死倒數歸零，仍未被治療至 HP > 0

B. 瀕死期間再次承受任何有效傷害
```

符合其中之一：

```text
→ Character Life State = DEAD
→ 死亡立即成立
```

死亡不是額外 D100 判定。

---

# 7. 死亡成立瞬間，角色進入永久鎖定狀態

死亡確認的同一個交易／Resolver 內，立即設定：

```text
character_state = DEAD
character_locked = true
```

從這一刻開始，角色一般資料全部唯讀。

包括但不限於：

```text
角色基本資料
EXP / Level
屬性
技能
能力
元素修習
武器專精
HP / MP / SAN 等一般狀態
Buff / Debuff
筆記／一般玩家編輯欄位
角色成長資料
```

Player 端不得再提交這些修改。

GM 端亦不應以普通角色編輯流程繞過死亡鎖；如未來有復活機制，必須使用專門的 Revival／Unlock 流程。

---

# 8. 死亡後只有「物品與金錢」仍可發生轉移

死亡角色不是完全從世界消失；屍體仍可能被搜掠。

因此死亡鎖唯一保留的普通資產出口是：

```text
Inventory
Currency / Money
```

但這不代表死亡角色的 Player 自己仍可自由操作。

Canonical：

```text
死亡角色擁有者
→ Inventory / Money 亦為唯讀

GM／系統核准的摸屍交易
→ 可以從死亡角色扣除物品／金錢
→ 轉移到另一角色／指定世界容器
```

所以「可動」的真正意思是：

```text
屍體資產仍可被合法轉移
≠ 死者本人仍可整理／送走資產
```

---

# 9. 摸屍必須是 D1 交易，不是直接改兩張表面數值

所有摸屍／Loot 動作應經伺服器處理，並以 D1 為唯一持久資料來源。

概念：

```text
Loot Transaction
├── dead_character_id
├── looter_character_id / destination
├── item_id / currency_id
├── amount
├── gm_authorized
├── timestamp
└── audit metadata
```

一次成功摸屍：

```text
死亡角色資產 -X
接收角色／容器資產 +X
```

應在同一個資料庫交易中完成，避免複製物品／金錢。

所有轉移保留 Audit History。

---

# 10. Player / GM 顯示

## Player 端

死亡角色可以繼續被查看，但應明確顯示：

```text
狀態：死亡
```

其角色頁一般編輯功能全部停用。

玩家不應看到可直接更改死亡角色 Inventory／Money 的編輯控制。

## GM 端

GM 可以看到：

```text
死亡狀態
死亡時間／事件（如有）
死亡角色 Inventory
死亡角色 Currency
摸屍／轉移控制
Audit History
```

GM 可批准合法的屍體資產轉移。

---

# 11. 暫時生命與瀕死

現行 Alpha 的 Hidden Temporary HP 先承受傷害。

因此正常情況：

```text
Temporary HP > 0
→ 傷害先消耗 Temporary HP
→ 未打到 Current HP 0
→ 不進入瀕死
```

一旦角色已經正式進入：

```text
Current HP = 0
狀態 = 瀕死
```

後續任何真正造成有效傷害的事件仍按第 5 節直接死亡。

---

# 12. Alpha 暫不加入的規則

目前不加入：

```text
死亡豁免骰
負 HP
Massive Damage 即死線
瀕死時每回合自動扣血
瀕死成功／失敗標記三次制
死亡後自動復活
復活代價
屍體腐化／復活時間窗
靈魂狀態
CON 對復活成功率
```

如後續需要，集中加入 `FUTURE_UPDATE_BACKLOG.md`，不得偷偷改變目前 Alpha 死亡流程。

---

# 13. Alpha 鎖定結論

1. `Current HP <= 0` 時 HP 鎖為 0，角色立即進入「倒地 + 瀕死」。
2. Alpha 不使用負 HP 或 Massive Damage 即死線。
3. `瀕死回合數 = ceil(CON / 5)`。
4. 每到瀕死角色自己的回合結束，瀕死剩餘回合 -1。
5. 倒數歸零而 HP 仍為 0時，立即死亡。
6. 死亡前只要成功治療至 `HP > 0`，便解除瀕死並清除倒數。
7. 瀕死期間再次承受任何有效傷害，立即死亡，不再作額外死亡判定。
8. 死亡成立瞬間角色切換為 `DEAD + locked`。
9. 死亡角色除 Inventory／Currency 的摸屍資產轉移外，其餘資料全部鎖定。
10. 死亡角色擁有者本人不能再修改 Inventory／Money；只有 GM／系統核准的 Loot Transaction 可轉移資產。
11. 摸屍必須在 D1 以原子交易處理並留下 Audit History。
12. 復活及其他進階死亡規則留待後續設計。
