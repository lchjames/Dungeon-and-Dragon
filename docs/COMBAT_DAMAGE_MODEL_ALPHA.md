# 戰鬥、傷害來源與固定數值結算 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：命中後傷害結算、防禦值、Damage Profile、Defense Profile、傷害／命中加成分離、臨時物件傷害與 AI 建議。  
> 本文件覆蓋較早版本中的 `1D8 / 1D4 / 1D2` 等傷害骰，以及舊式 `Skill + Source Bonus` 獨立命中公式。命中／對抗一律使用最新 `D100判定核心_ALPHA.md` 與 `對抗判定與極端結果_ALPHA.md`。

---

# 1. 戰鬥分為兩個完全不同的階段

## 第一階段：能否把負面效果施加到目標

使用 D100 對抗：

```text
攻擊 / 負面效果 Result > 防守 / 抵抗 Result
→ 突破成功
→ 才進入效果結算

攻擊 / 負面效果 Result <= 防守 / 抵抗 Result
→ 被抵消／避開／抵抗
→ 不進入該負面效果的後續傷害結算
```

平手時負面效果不成立。

例如：

```text
攻擊 Result +42
閃避 Result +35
→ 命中
→ 進入傷害結算
```

```text
攻擊 Result +42
閃避 Result +42
→ 平手
→ 閃避成功／攻擊未突破
→ 不計傷害
```

---

## 第二階段：命中後實際造成多少效果

**不再擲骰。**

傷害值、防禦值及其加成全部是固定數值。

Canonical：

```text
最終傷害值
= max(0, 有效傷害值 - 有效防禦值)
```

其中：

```text
有效傷害值
= 基礎傷害值
+ 傷害加成
+ 適用的角色 Damage Bonus
+ 其他傷害修正

有效防禦值
= 基礎防禦值
+ 防具加成
+ 防禦 Buff
+ 對應抗性／其他防禦修正
```

全部只做數值加減，不進行第二次 D100、D20、D6 或其他傷害骰。

---

# 2. 命中值與傷害值必須分開

同一件武器／能力可以同時影響命中與傷害，但資料欄位必須分開。

例如：

```text
鋼劍
命中修正：+5
傷害值：18
傷害加成：+2
```

`命中修正 +5` 只加入 D100 `總修正`。

`傷害值 18 / 傷害加成 +2` 只在已命中後進入傷害結算。

禁止：

```text
同一個 Source Bonus
既加 D100 命中
又再無條件加一次傷害
```

除非該物品／能力明確分別定義兩個不同效果。

---

# 3. 固定傷害公式

最簡單情況：

```text
攻擊傷害值 = 30
目標防禦值 = 18

最終傷害 = 30 - 18 = 12
```

命中但未能突破防禦：

```text
攻擊傷害值 = 18
目標防禦值 = 22

最終傷害 = max(0, 18 - 22)
= 0
```

敘事可以是：

```text
攻擊確實打中
但被護甲／防護完全承受
→ HP 不下降
```

因此正式保留：

```text
命中 ≠ 一定造成傷害
```

---

# 4. 所有傷害加成都使用固定加法

例如：

```text
武器基礎傷害       18
武器傷害加成       +2
力量／角色傷害加成 +4
火焰附魔           +5
暫時 Debuff         -3

有效傷害值
= 18 + 2 + 4 + 5 - 3
= 26
```

不需要任何額外 Roll。

正數提高傷害，負數降低傷害。

---

# 5. 所有防禦亦使用固定加法

例如：

```text
基礎防禦值       4
胸甲             +10
護盾 Buff         +5
火焰抗性         +3
破甲 Debuff       -6

有效防禦值
= 4 + 10 + 5 + 3 - 6
= 16
```

若攻擊有效傷害為 26：

```text
最終傷害
= 26 - 16
= 10
```

---

# 6. 傷害類型可以決定哪些防禦值適用

防禦不是一定對所有傷害共用同一個數字。

Damage Profile 可標示：

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

Defense Profile／狀態可定義自己對哪些類型有效。

例如：

```text
鋼甲
一般物理防禦 +12
火焰防禦 +0
```

```text
火焰護盾
火焰防禦 +15
一般物理防禦 +2
```

Resolver 只把與該次 Damage Type 相符的防禦值加入有效防禦。

精確抗性分類仍可於 Alpha 調整，但不改變「固定數值加減」原則。

---

# 7. 弱點、破甲、穿透仍然是數值修正

目前不需要為弱點／穿透建立新骰法。

例如：

```text
目標火焰弱點：火焰防禦 -8
```

或者：

```text
破甲效果：本次有效防禦 -5
```

最後仍然回到：

```text
最終傷害
= max(0, 有效傷害值 - 有效防禦值)
```

特殊的「無視防禦」「免疫」「傷害轉換」可以作 Profile 規則覆蓋，但不是普通加減的預設行為。

---

# 8. Damage Profile 改用固定傷害值

最新概念結構：

```text
Damage Profile
├── id
├── source_type
├── source_reference
├── name
├── hit_modifier
├── damage_value
├── damage_modifier
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

重要變更：

```text
damage_formula
→ 移除／不再作 Alpha Canonical

damage_value
→ 固定整數／數值
```

`hit_modifier` 與 `damage_modifier` 必須分開。

---

# 9. Defense Profile

角色、防具、護盾、能力、Buff 或其他來源可以提供 Defense Profile。

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

一個目標可以同時有多個有效 Defense Profile；Resolver 將當前適用的固定值相加。

例如：

```text
皮甲 +6 物理防禦
石膚 +5 物理防禦
火抗戒指 +8 火焰防禦
```

受到斬擊時：

```text
有效防禦 = 6 + 5 = 11
```

受到火焰時：

```text
有效防禦 = 8
```

如石膚明確亦對火焰有效，才再加入其數值。

---

# 10. 角色 Damage Bonus 的舊骰制需要另行轉換

目前較早角色表仍存在：

```text
-1D6
-1D4
0
+1D4
+1D6
+2D6
+3D6
+4D6
```

這與最新「傷害層完全不擲骰」原則衝突。

因此：

```text
舊 Character Damage Bonus 骰式
→ 視為需要遷移的舊格式
→ 不應直接實作到最新固定傷害 Resolver
```

下一步需要把 STR + SIZ 對應表轉成固定數值 Damage Bonus。

在該表正式確認前，不擅自把 `1D4 / 1D6` 換成平均值或其他固定值。

---

# 11. 一般物件仍可以成為 Damage Source

Item 分類仍保持：

```text
WEAPON
ARMOUR
ITEM
```

`WEAPON` 不代表只有武器可以造成傷害。

任何以下來源都可以有 Damage Profile：

```text
WEAPON
ITEM
能力／招式
魔法
環境物件
徒手／身體
陷阱
臨時物件
```

例如玻璃杯仍然是 ITEM，但被用作攻擊時可以有臨時 Profile：

```text
玻璃杯敲擊
命中修正：-8
傷害值：3
傷害類型：鈍擊
破裂條件：高衝擊時可能破裂
```

如果破裂：

```text
碎玻璃
命中修正：-4
傷害值：5
傷害類型：斬擊／刺擊
```

以上數字只作結構例子，不視為永久平衡值。

---

# 12. 物件狀態轉換

物件仍可以因戰鬥改變狀態：

```text
玻璃杯
↓ 破裂
碎玻璃
```

```text
瓶子
↓ 打碎
破瓶
```

```text
火把
↓ 熄滅
未點燃火把
```

狀態改變可以改變可用 Damage Profile，但不需要改變原物品主分類。

---

# 13. AI 處理未知傷害來源

跨世界 TRPG 無法預先手寫每一件物件的傷害值。

沿用分層 Resolver：

```text
1. 已存在 Damage Profile？
   → 直接使用

2. 已知規則／Tag 足夠？
   → 系統推導固定數值建議

3. 仍有歧義？
   → AI 提供 1–3 個合理建議

4. GM 接受／修改／拒絕

5. 如值得重用
   → 儲存正式 Profile 到 D1
```

AI 建議內容可包括：

```text
命中修正
固定傷害值
傷害類型
是否適用角色 Damage Bonus
破裂／消耗條件
次生效果
簡短理由
```

AI 不得在每次普通攻擊時重新隨機決定傷害。

---

# 14. 大成功／大失敗不自動乘傷害

即使原始骰點為 100：

```text
大成功
≠ 全域固定傷害 ×2
```

即使原始骰點為 1：

```text
大失敗
≠ 全域固定自傷數值
```

極端結果沿用 `對抗判定與極端結果_ALPHA.md`：

- AI 可向 GM 提供 1–3 個情境合理建議；
- GM 作最後決定；
- 如果其中一個建議合理地改變本次傷害值，該改變作為明確的情境修正加入；
- 不建立所有能力共用的固定暴擊倍率。

---

# 15. Alpha 鎖定結論

1. D100 只處理是否成功突破／施加負面效果。
2. 負面效果方必須嚴格高於防守／抵抗 Result；平手由受影響方抵消。
3. 只有成功突破後才進入傷害／效果結算。
4. 傷害值與防禦值都是固定數值，不再擲任何傷害骰。
5. `最終傷害 = max(0, 有效傷害值 - 有效防禦值)`。
6. 傷害與防禦的 Buff／Debuff／裝備／能力全部使用固定加減。
7. 命中修正與傷害修正必須分開保存，不可把同一 Bonus 無條件重複計算。
8. 命中可以造成 0 傷害；`命中 ≠ 一定造成實質傷害`。
9. Damage Profile 使用固定 `damage_value`，不再使用 `damage_formula` 作 Alpha Canonical。
10. Defense Profile 可以按傷害類型提供固定防禦值。
11. 弱點、抗性、破甲等預設以固定數值修正處理。
12. 一般 ITEM 仍可按情境取得臨時／永久 Damage Profile。
13. AI 對未知來源提供 1–3 個固定數值建議，GM 為最終裁決者。
14. 大成功／大失敗不自動套固定傷害倍率。
15. 舊 Character Damage Bonus 的骰式必須另行轉成固定數值，未確認前不得擅自平均化。
16. 所有正式 Damage／Defense Profile 與角色戰鬥資料仍以 D1 為唯一持久來源。
