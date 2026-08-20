# 戰鬥、傷害來源與防禦結算 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：命中後傷害結算、傷害骰、固定防禦值、Damage Profile、Defense Profile、命中／傷害加成分離、臨時物件傷害與 AI 建議。  
> 命中／對抗一律使用最新 `D100判定核心_ALPHA.md` 與 `對抗判定與極端結果_ALPHA.md`。

---

# 1. 戰鬥分成兩個不同階段

## 第一階段：D100 對抗

任何要向另一方施加負面後果的行動，例如：

```text
傷害
減益
控制
擊退
束縛
魅惑
中毒
其他不利效果
```

先使用 D100 對抗。

```text
負面效果方 Result > 防守／抵抗方 Result
→ 突破成功
→ 才進入該效果的後續結算

負面效果方 Result <= 防守／抵抗方 Result
→ 被避開／抵消／抵抗
→ 該負面效果不成立
```

平手時受影響一方優先，因此攻擊 Result 與閃避 Result 相同時視為沒有命中。

---

## 第二階段：傷害結算

攻擊成功命中之後，**不再做第二次 D100 命中判定**。

但傷害本身仍然可以使用傷害骰，例如：

```text
1D4
1D6
1D8
2D6
3D10
```

防禦值則是固定數值，不擲防禦骰。

Canonical：

```text
原始傷害
= 傷害骰結果
+ 固定傷害加成／減益
+ 適用的角色 Damage Bonus
+ 其他明確傷害來源

有效防禦
= 固定基礎防禦
+ 防具防禦
+ 防禦 Buff
+ 對應抗性
+ 其他固定防禦修正

最終傷害
= max(0, 原始傷害 - 有效防禦)
```

因此正式保留：

```text
命中 ≠ 一定造成有效傷害
```

---

# 2. 傷害骰不是 D100 判定

傷害骰只負責產生數值。

例如：

```text
長劍傷害：1D8
骰出 8
→ 傷害骰結果 = 8
```

這個 `8` 只是傷害數字。

它**不代表：**

```text
大成功
暴擊
效果放大
自動觸發特殊故事結果
```

同樣：

```text
1D8 骰出 1
```

亦只代表傷害骰結果為 1，**不代表大失敗**。

Canonical：

```text
大成功／大失敗
→ 只屬於正式 D100 行動判定的極端結果語義

普通傷害骰最大值／最小值
→ 沒有全域 Great Success／Great Failure 意義
```

如果某件武器、能力或物品明確寫有：

```text
傷害骰擲出最大值時觸發 X
```

可以作為該 Profile 的專屬規則，但不是全域傷害規則。

---

# 3. D100 大成功仍可改變實際故事效果

D100 原始 100 仍然是大成功。

例如一次攻擊取得大成功時，GM + AI 可以依 `對抗判定與極端結果_ALPHA.md` 提供 1–3 個合理建議，例如：

```text
更理想的命中位置
擊退／破壞周圍物件
額外狀態效果
提高實際效果尺度
其他符合場景的結果
```

但不使用全域規則：

```text
大成功 = 傷害骰 ×2
```

除非該次 GM 裁決、能力 Profile 或特殊規則明確決定如此處理。

傷害骰本身仍然正常擲骰。

---

# 4. 基本傷害例子

角色使用長劍：

```text
Damage Profile：1D8
角色 Damage Bonus：+1D4
固定傷害 Buff：+2
```

攻擊已經通過 D100 對抗。

傷害骰：

```text
1D8 → 6
1D4 → 3
```

因此：

```text
原始傷害
= 6 + 3 + 2
= 11
```

目標固定防禦：

```text
護甲 +5
石膚 Buff +2

有效防禦 = 7
```

最後：

```text
最終傷害
= max(0, 11 - 7)
= 4
```

目標失去 4 HP。

---

# 5. 命中但無效

例如：

```text
攻擊已成功壓過閃避
→ 命中

傷害骰與加成合計 = 9
目標有效防禦 = 12
```

則：

```text
最終傷害
= max(0, 9 - 12)
= 0
```

敘事可以是：

```text
武器確實打中目標
但被護甲／護盾／抗性完全承受
→ 沒有造成 HP 傷害
```

這與「閃避成功所以完全沒有命中」是兩種不同結果。

---

# 6. 命中修正與傷害加成必須分開

同一件武器／能力可以同時影響命中與傷害，但資料欄位必須分開。

例如：

```text
鋼劍
命中修正：+5
傷害：1D8
固定傷害加成：+2
```

其中：

```text
命中修正 +5
→ 只加入 D100 判定的總修正

1D8 + 2
→ 只在命中後進入傷害結算
```

不要用一個模糊的 `Source Bonus` 同時無條件加兩次。

如果來源同時提供兩種效果，應明確保存為不同欄位。

---

# 7. Character Damage Bonus 保留骰制

角色 Damage Bonus 保留既有形式：

```text
STR + SIZ 2–12  → -1D6
STR + SIZ 13–16 → -1D4
STR + SIZ 17–24 → 0
STR + SIZ 25–32 → +1D4
STR + SIZ 33–40 → +1D6
STR + SIZ 41–56 → +2D6
STR + SIZ 57–72 → +3D6
STR + SIZ 73–88 → +4D6
```

若 Damage Profile 標記：

```text
applies_character_damage_bonus = true
```

便在命中後一併擲角色 Damage Bonus。

Damage Bonus 的骰點同樣只是傷害數字，不具有大成功／大失敗語義。

負 Damage Bonus 按該 Profile／Resolver 規則扣減原始傷害，最終傷害仍不可低於 0。

---

# 8. 防禦值固定，不擲骰

防禦是固定數值加總。

例如：

```text
基礎防禦       2
胸甲           +7
護盾 Buff      +4
破甲 Debuff    -3

有效防禦
= 2 + 7 + 4 - 3
= 10
```

不需要另外擲：

```text
1D20 防禦
1D8 護甲
D100 防禦
```

閃避／抵抗是否成功已經在第一階段的 D100 對抗中處理。

---

# 9. 傷害類型決定哪些防禦適用

Damage Profile 可以有傷害類型，例如：

```text
物理
斬擊
刺擊
鈍擊
火
水
風
土
雷
木
光
暗
其他特殊類型
```

Defense Profile 可以指定自己對哪些類型提供固定防禦。

例如：

```text
鋼甲
物理／斬擊／刺擊防禦 +8
火焰防禦 +0
```

```text
火焰護盾
火焰防禦 +12
一般物理防禦 +2
```

Resolver 只加入當次傷害類型適用的防禦值。

---

# 10. 穿透、破甲、弱點仍然是固定修正

例如：

```text
破甲 -5 防禦
```

或者：

```text
火焰弱點：火焰防禦 -8
```

這些修正不需要額外 Roll。

特殊規則可以明確定義：

```text
無視 X 點防禦
忽略某類護甲
免疫某傷害類型
傷害轉換
```

但普通結算仍然回到：

```text
最終傷害 = max(0, 原始傷害 - 有效防禦)
```

---

# 11. Damage Profile

最新概念結構：

```text
Damage Profile
├── id
├── source_type
├── source_reference
├── name
├── hit_modifier
├── damage_formula
├── flat_damage_modifier
├── damage_type
├── applies_character_damage_bonus
├── range
├── area / target
├── resource_cost
├── break / consume behaviour
├── conditions / secondary effects
├── provenance
└── metadata
```

其中：

```text
hit_modifier
→ D100 命中修正

damage_formula
→ 傷害骰，例如 1D8、2D6

flat_damage_modifier
→ 命中後固定傷害加減
```

三者不可混成一個欄位。

---

# 12. Defense Profile

概念：

```text
Defense Profile
├── id
├── source_type
├── source_reference
├── name
├── defense_value
├── applies_to_damage_types
├── conditions
├── duration / status relation
└── metadata
```

`defense_value` 是固定值。

一個角色可以同時有多個有效 Defense Profile；當次只加總適用者。

---

# 13. 普通物件仍可成為 Damage Source

Item 分類保持：

```text
WEAPON
ARMOUR
ITEM
```

普通 ITEM 在合理情境仍可取得臨時／可重用 Damage Profile。

例如：

```text
玻璃杯敲擊
命中修正：-8
傷害：1D2
傷害類型：鈍擊
破裂條件：高衝擊時可能破裂
```

破裂後：

```text
碎玻璃
命中修正：-4
傷害：1D4
傷害類型：斬擊／刺擊
```

以上只作結構例子，不視為永久平衡數字。

---

# 14. AI 處理未知傷害來源

未知／臨時攻擊來源使用：

```text
1. 已有 Damage Profile？
   → 直接使用

2. 已知規則／Tag 足夠？
   → 系統推導建議

3. 仍有歧義？
   → AI 提供 1–3 個合理建議

4. GM 接受／修改／拒絕

5. 如值得重用
   → 儲存正式 Profile 到 D1
```

AI 建議可包括：

```text
命中修正
傷害骰公式
固定傷害修正
傷害類型
是否適用角色 Damage Bonus
破裂／消耗條件
次生效果
簡短理由
```

AI 不應在每次已知普通攻擊中重新決定傷害 Profile。

---

# 15. Alpha 鎖定結論

1. 負面效果先經 D100 對抗；負面效果方必須嚴格高於防守／抵抗方。
2. 平手時負面效果不成立。
3. 成功命中後才進入傷害結算。
4. 傷害使用 Damage Profile 定義的傷害骰。
5. 傷害骰不是 D100 判定；最大／最小骰面沒有全域大成功／大失敗效果。
6. D100 大成功／大失敗仍由 GM + AI 情境推演處理，不自動等於傷害倍增／自傷。
7. 防禦值是固定數值，不擲防禦骰。
8. 最終傷害為 `max(0, 原始傷害 - 有效防禦)`。
9. Character Damage Bonus 保留 `±1D4 / ±1D6 / +2D6 ...` 骰制。
10. 命中修正、傷害骰、固定傷害加成必須分開保存。
11. 命中不等於一定造成 HP 傷害；防禦可能把最終傷害降至 0。
12. 傷害類型決定哪些固定防禦／抗性適用。
13. 普通 ITEM 仍可按情境獲得 Damage Profile。
14. 未知 Damage Source 可由 AI 提供 1–3 個建議，GM 為最終裁決者。
15. 所有正式 Profile 與角色狀態保存於 D1。
