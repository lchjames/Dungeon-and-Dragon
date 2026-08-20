# 戰鬥、傷害來源與防禦結算 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：命中後傷害結算、傷害骰、固定防禦值、Damage Result、Damage Profile、Defense Profile、命中／傷害加成分離、AI 效果解讀。  
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

傷害本身仍然使用 Damage Profile 的傷害骰，例如：

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

Damage Result
= 原始傷害 - 有效防禦
```

**不要在這一步把負數截成 0。**

`Damage Result` 本身保留完整差值，因為它同時描述攻擊對防禦的實際穿透程度。

---

# 2. Damage Result 的判讀

```text
Damage Result > 0
→ 攻擊突破防禦
→ 造成等同 Damage Result 的 HP 傷害

Damage Result = 0
→ 剛好被完全擋住
→ HP 不變

Damage Result < 0
→ 防禦完全承受攻擊
→ HP 不變
→ 絕對值表示防禦餘裕
```

例如：

```text
原始傷害 = 11
有效防禦 = 7

Damage Result = 11 - 7 = +4
→ 造成 4 HP 傷害
```

另一例：

```text
原始傷害 = 9
有效防禦 = 12

Damage Result = 9 - 12 = -3
→ 命中，但沒有 HP 傷害
→ 防禦餘裕 3
```

因此正式保留：

```text
命中 ≠ 一定造成有效傷害
```

並且：

```text
-1
→ 勉強擋住

-20
→ 攻擊完全無法撼動防禦
```

這些不是另一套成功階級，而是 Damage Result 的情境資訊。

---

# 3. HP 扣減與 Damage Result 分開

程式層不得直接：

```text
HP = HP - Damage Result
```

因為負數會錯誤變成回血。

Canonical HP 更新：

```text
Damage Result > 0
→ HP = HP - Damage Result

Damage Result <= 0
→ HP 不變
```

所以保留 raw difference 不會造成負傷害回血，同時又保留防禦餘裕資訊供 GM／AI 使用。

---

# 4. 傷害骰不是 D100 判定

傷害骰只負責產生傷害數字。

例如：

```text
長劍傷害：1D8
骰出 8
→ 傷害骰結果 = 8
```

這個 `8` 不代表：

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

亦只代表傷害骰結果為 1，不代表大失敗。

Canonical：

```text
大成功／大失敗
→ 屬於正式 D100 行動判定

普通傷害骰最大值／最小值
→ 沒有全域 Great Success／Great Failure 意義
```

如果某件武器／能力 Profile 明確寫明「傷害骰最大值時觸發 X」，可以作為該 Profile 的專屬效果，但不是全域規則。

---

# 5. D100 大成功／大失敗仍屬另一層

D100 原始 100／1 仍依 `對抗判定與極端結果_ALPHA.md` 處理。

大成功可以令 GM + AI 推演例如：

```text
更理想的命中位置
擊退／破壞周圍物件
額外狀態效果
提高實際效果尺度
其他符合場景的結果
```

但沒有全域：

```text
大成功 = 傷害骰 ×2
```

Damage Result 的正負與大小亦**不是**新的大成功／大失敗系統。

例如：

```text
Damage Result +25
≠ 自動大成功

Damage Result -25
≠ 自動大失敗
```

它只表示命中後攻防之間的實際差距。

---

# 6. AI 可以解讀 Damage Result

Damage Result 應保留給 AI／GM 作情境推演依據。

AI 可收到：

```text
Damage Result
原始傷害
有效防禦
傷害類型
Damage Profile
實際承受防禦的來源
目標狀態
裝備／護甲狀態
命中位置（如有）
周圍環境
前置 D100 結果
```

AI 可提供 **1–3 個合理效果／敘事建議**。

例如：

```text
Damage Result = -1
斬擊 vs 金屬胸甲
```

AI 可以建議：

```text
1. 刀鋒勉強被胸甲卡住，只留下明顯刮痕。
2. 衝擊令目標身體一震，但護甲成功承受主要力量。
3. 武器沿護甲表面滑開，沒有真正切入。
```

例如：

```text
Damage Result = -20
火焰 vs 高階火焰結界
```

AI 可以建議：

```text
1. 火焰接觸結界後迅速被吞沒，幾乎沒有撼動防護。
2. 防護表面只出現短暫波紋，顯示雙方強度差距明顯。
3. 攻擊被完全隔絕，甚至可令角色察覺目標對火焰具高度抗性。
```

例如：

```text
Damage Result = +18
重錘 vs 輕型護甲
```

AI 可以建議：

```text
1. 攻擊明顯壓過護甲，造成沉重衝擊。
2. 護甲局部凹陷／破損，若物件耐久規則適用可進一步處理。
3. 強烈衝擊可能合理地造成失衡／位移，交由 GM 決定是否形成額外效果。
```

重要：

- AI 建議不自動改變 HP 數值；
- AI 不得因 Damage Result 很大就自行創造免費 Debuff；
- 新增擊退、破甲、裝備破損、狀態等機械效果，必須符合 Profile／場景／既有規則並由 GM 接受；
- GM 可以接受、修改、拒絕全部建議。

---

# 7. AI 不需要介入每一次普通攻擊

已知普通攻擊仍應快速 deterministic 結算：

```text
命中
→ 擲傷害骰
→ 計固定防禦
→ 得出 Damage Result
→ 扣 HP（如 > 0）
```

AI 可以在以下情況介入：

```text
GM 主動要求效果建議
Damage Result 特別值得敘事化
涉及特殊材質／護甲／環境
可能產生裝備破壞或次生效果
D100 本身為大成功／大失敗
出現新／模糊 Damage Source
```

是否設定自動觸發門檻留待 Alpha 調整；目前不要求每次攻擊都呼叫 AI。

---

# 8. 基本傷害例子

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
Damage Result
= 11 - 7
= +4

→ HP -4
```

---

# 9. 命中修正與傷害加成必須分開

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

# 10. Character Damage Bonus 保留骰制

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

負 Damage Bonus 直接扣減原始傷害；即使令 Damage Result 更低，也只代表防禦／減傷餘裕更大，不會形成回血。

---

# 11. 防禦值固定，不擲骰

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

# 12. 傷害類型決定哪些防禦適用

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

# 13. 穿透、破甲、弱點仍然是固定修正

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

普通結算仍然回到：

```text
Damage Result = 原始傷害 - 有效防禦
```

---

# 14. Damage Profile

概念結構：

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

# 15. Defense Profile

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

# 16. 普通物件仍可成為 Damage Source

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

# 17. AI 處理未知傷害來源

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

AI 不應在每次已知普通攻擊中重新決定 Damage Profile。

---

# 18. Alpha 鎖定結論

1. 負面效果先經 D100 對抗；負面效果方必須嚴格高於防守／抵抗方。
2. 平手時負面效果不成立。
3. 成功命中後才進入傷害結算。
4. 傷害使用 Damage Profile 定義的傷害骰。
5. 傷害骰不是 D100 判定；最大／最小骰面沒有全域大成功／大失敗效果。
6. 防禦值是固定數值，不擲防禦骰。
7. `Damage Result = 原始傷害 - 有效防禦`，保留正／零／負 raw difference。
8. `Damage Result > 0` 時扣等量 HP；`<= 0` 時 HP 不變，禁止負傷害變成回血。
9. 負 Damage Result 的絕對值代表防禦餘裕；正值代表實際穿透並同時是 HP 傷害。
10. AI 可利用 Damage Result、傷害類型、防禦來源與環境提供 1–3 個效果／敘事建議。
11. AI 不得自行改寫 HP 結算，亦不得僅因 Damage Result 大就免費創造 Debuff／破甲／擊退；額外機械效果需 GM 接受並符合規則／Profile。
12. D100 大成功／大失敗仍由 GM + AI 情境推演處理，不與 Damage Result 混為同一套極端結果規則。
13. Character Damage Bonus 保留 `±1D4 / ±1D6 / +2D6 ...` 骰制。
14. 命中修正、傷害骰、固定傷害加成必須分開保存。
15. 傷害類型決定哪些固定防禦／抗性適用。
16. 普通 ITEM 仍可按情境獲得 Damage Profile。
17. 未知 Damage Source 可由 AI 提供 1–3 個建議，GM 為最終裁決者。
18. 所有正式 Profile 與角色狀態保存於 D1。
