# HP / MP Recovery & Rest — Alpha

> 狀態：**Canonical Alpha Working Rule**  
> 日期：2026-08-20  
> 範圍：HP/MP 主動回復、集中、短休、長休、休息目標、休息中斷、休息期間角色行動限制。  
> **Canonical Override：** 本文件取代 `基礎動作與MP資源消耗_ALPHA.md` 第 10 節中「HP 休息／自然回復另行設計」及任何與本文衝突的舊 Rest 描述。  
> 與 `ALPHA_CORE_INTEGRATION_RULES.md`、`CANONICAL_CHARACTER_STATUS_RULES.md`、`戰鬥回合與行動經濟_ALPHA.md` 一起使用。

---

# 1. 共通原則

Alpha 不提供每回合免費 HP 或 MP 自然回復。

```text
HP
→ 戰鬥內不會免費自然回復

MP
→ 戰鬥內不會免費自然回復
```

HP 在戰鬥內如要恢復，必須來自正式 Healing / Item / Treatment / Ability / Effect。

MP 在戰鬥內可使用正式基礎動作「集中」。

所有普通回復受最終資源上限限制：

```text
0 <= Current HP <= Final Max HP
0 <= Current MP <= Final Max MP
```

任何超過 Max 的 Temporary HP、Temporary MP、Overcharge 等必須由獨立 Profile 正式定義。

---

# 2. 戰鬥內：集中 / Focus

`集中` 只可以在正式 Combat 狀態使用。

```text
集中
→ 消耗角色本回合 1 次主行動
→ 回復 ceil(Final Max MP × 5%)
```

不需要額外建立 Ability，也不預設需要 D100 判定。

同一正常回合不能用同一個主行動同時：

```text
集中
+ 普通攻擊
+ 另一個主動 Ability
```

除非特殊 Profile 明確另有規則，以下角色不能使用集中：

```text
Down / Dying
失去行動能力
無法使用正常主行動
```

戰鬥外不能用「集中」取代休息系統。

---

# 3. Rest 只可在非戰鬥狀態開始／完成

```text
Combat = true
→ 不可開始 Short Rest / Long Rest
→ 不可完成 Rest Recovery
```

如果角色正在休息，而 Combat 在完成前開始：

```text
該次 Rest 立即取消
→ 不取得任何本次 Rest Recovery
→ 之後需要重新開始完整 Rest
```

---

# 4. Rest 每次必須選擇一個資源

一次 Rest **不會同時回復 HP 與 MP**。

開始 Rest 時必須鎖定：

```text
rest_type = SHORT / LONG
rest_resource = HP / MP
```

因此合法選項只有：

```text
Short Rest — HP
Short Rest — MP
Long Rest — HP
Long Rest — MP
```

開始後不能在完成前把同一次 Rest 由 HP 改成 MP，或由 MP 改成 HP。

---

# 5. Short Rest

Short Rest 需要：

```text
2 Rounds
```

開始休息的 Round 已算第 1 Round。

## 5.1 Short Rest — HP

```text
Duration = 2 Rounds
Recovery = ceil(Final Max HP × 10%)
```

例：

```text
Final Max HP = 232
→ recover ceil(23.2)
→ +24 HP
```

## 5.2 Short Rest — MP

```text
Duration = 2 Rounds
Recovery = ceil(Final Max MP × 25%)
```

例：

```text
Final Max MP = 641
→ recover ceil(160.25)
→ +161 MP
```

## 5.3 結算時點

```text
Round 1
→ 宣告／開始 Short Rest
→ 已算第 1 Round

Round 2
→ 完成
→ 一次性結算所選資源回復
```

不會在每個休息 Round 分段派發回復量。

---

# 6. Long Rest

Long Rest 需要：

```text
5 Rounds
```

開始休息的 Round 已算第 1 Round。

## 6.1 Long Rest — HP

```text
Duration = 5 Rounds
Recovery = ceil(Final Max HP × 50%)
```

Long Rest — HP **不會自動把 HP 補滿**。

## 6.2 Long Rest — MP

```text
Duration = 5 Rounds
Recovery = Current MP → Final Max MP
```

即完成後 MP 回滿至 Final Max MP。

## 6.3 結算時點

```text
Round 1 → 開始
Round 2 → 持續
Round 3 → 持續
Round 4 → 持續
Round 5 → 完成並一次性結算
```

---

# 7. Rest 是 Individual

Rest 不要求整個 Party 同時休息。

每個 Character 獨立保存自己的：

```text
rest_type
rest_resource
rest_started_round
rest_progress
rest_required_rounds
```

例如：

```text
Character A → Short Rest — MP
Character B → 正常 Action + Move
Character C → Long Rest — HP
Character D → 正常 Action + Move
```

只要仍然是非戰鬥狀態，個別角色可各自推進自己的 Rest Progress。

---

# 8. Rest 可以連續使用

Alpha 不加入：

```text
每場戰鬥後只准休息一次
Rest cooldown
每日休息次數
必須 Safe Area 才可普通 Rest
```

因此完成一次 Rest 後，只要仍符合非戰鬥條件，可以立即開始另一個完整 Rest。

時間／追擊／危險環境等成本日後可由 Campaign、Encounter、World Profile 等系統處理，而不是在基礎 Rest 加硬 cooldown。

---

# 9. Rest 期間角色行動限制

休息中的 **Character** 不可同時執行正常 Character Action 或 Move。

```text
Resting Character
→ 不取得可另作攻擊／Ability／使用物品／移動的主行動
→ 不取得可另作正常角色移動的 Move
```

但 **Player 本人** 不會被 UI 鎖死。

Player 仍可：

```text
聊天 / OOC 溝通
查看角色資料
查看 Inventory / Ability 資訊
操作與該休息角色行動無關的被動／介面功能
參與桌上討論
```

核心判斷是：

```text
Player 可以做事
但不能讓正在 Rest 的 Character 同時做另一個角色行動
```

如果某個互動實際上需要由該 Character 主動執行，就不能與 Rest 同時完成；如要執行，必須放棄／中止該次 Rest。

---

# 10. Normal / Non-Combat Round 與 Rest

非戰鬥狀態如需要追蹤 Rest 或其他 Round-based 效果，每個合法角色正常有：

```text
1 Action + 1 Move
```

Resting Character 該 Round 的角色行動視為由 Rest 佔用／處理。

當所有角色都已處理該 Round：

```text
Round +1
→ Rest Progress 推進
→ 其他 Round-based effects 依正式規則推進
```

非戰鬥 Round 不強制使用 DEX Initiative 排序。

---

# 11. HP = 0 / Down / Dying 與 Rest

```text
Current HP = 0
→ Down / Dying
```

Down / Dying Character 不能靠普通 Short Rest / Long Rest 自行復活。

要取得 Rest HP Recovery 前，角色必須先透過正式來源恢復到：

```text
Current HP > 0
```

例如：

```text
Healing Ability
Treatment
Item
其他批准 Effect
```

之後如場景允許，才可開始普通 Rest。

---

# 12. Alpha 鎖定結論

1. HP/MP 都沒有每回合免費自然回復。
2. 戰鬥內「集中」只回 MP，消耗 1 主行動，回 `ceil(Final Max MP × 5%)`。
3. 集中只限 Combat。
4. Short Rest / Long Rest 只限非戰鬥。
5. 每次 Rest 必須選 HP 或 MP，不能同一次同時回兩者。
6. Short Rest 需要 2 Rounds；開始 Round 計入。
7. Short Rest — HP 回 `ceil(Final Max HP × 10%)`。
8. Short Rest — MP 回 `ceil(Final Max MP × 25%)`。
9. Long Rest 需要 5 Rounds；開始 Round 計入。
10. Long Rest — HP 回 `ceil(Final Max HP × 50%)`。
11. Long Rest — MP 回滿至 Final Max MP。
12. Recovery 只在 Rest 完成時一次性結算。
13. 完成前進入 Combat，該次 Rest 取消且沒有回復。
14. Rest 是 Individual。
15. Rest 可以連續使用，Alpha 不設基礎 cooldown／每日次數。
16. Resting Character 不能同時做正常 Character Action 或 Move；Player 仍可聊天及操作與角色行動無關的功能。
17. HP 0 / Down / Dying 不能靠普通 Rest 自行起身。
18. 所有 Rest state、progress、resource choice 與結算必須保存／結算於 D1 + server resolver，而不是只靠前端計時。
