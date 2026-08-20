# 治療與過量治療 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：治療落地、目標反應、過量治療、暫時生命值、過量失控、Great Result 與 GM + AI 審批。  
> 本文件與 `非傷害效果結算_ALPHA.md`、`對抗判定與極端結果_ALPHA.md`、`COMBAT_DAMAGE_MODEL_ALPHA.md` 一起使用。

---

# 1. 核心原則

治療成功落在一個目標後，先由目標自身 Profile 決定「治療能量對這個目標代表甚麼」。

可能包括：

```text
正常治療
無效／免疫
轉化為傷害
轉化為其他效果
特殊種族／世界規則
```

因此「治療」不是全世界都必定加 HP。

例：

```text
普通生命體
→ 治療能量正常恢復 HP

不死生物
→ 如果其 Profile 定義治療能量會造成傷害
→ 改交 Damage Resolver 處理
```

Great Failure 誤中錯誤目標後，同樣先讀取該目標 Profile，再決定最終效果。

---

# 2. 治療是否需要對抗

願意接受治療的目標：

```text
通常不需要抵抗對抗
→ 只處理來源方自己的 D100／能力判定
```

拒絕被治療或被強制施加治療能量的目標：

```text
可視為強制效果
→ 來源方 vs 抵抗方 D100 對抗
→ 來源方必須嚴格高於抵抗方才可落地
```

平手時受影響一方優先，因此強制治療不成立。

---

# 3. 治療量先按能力 Profile 得出

本文件不強制鎖死治療一定使用固定值或一定使用某種治療骰。

只要求在進入本 Resolver 前，能力已得出：

```text
Final Healing Output
```

之後才進入 HP／過量治療結算。

如來源方原始 D100 = 100，而且治療成功落地：

```text
Great Success
→ 治療的主要效果值 ×2
```

例如主要效果是治療量：

```text
正常 Healing Output = 12
大成功 = 24
```

倍增後再進入正常 HP 與過量治療流程。

因此治療大成功可以因為「治療得太強」而推進過量治療甚至過量失控。

---

# 4. 正常治療先補目前 HP

定義：

```text
Missing HP
= Max HP - Current HP

Direct Recovery
= min(Final Healing Output, Missing HP)

Overheal Amount
= max(0, Final Healing Output - Missing HP)
```

例：

```text
Current HP = 60
Max HP = 100
Healing Output = 30

Missing HP = 40
Direct Recovery = 30
Overheal = 0

→ Current HP = 90
```

另一例：

```text
Current HP = 90
Max HP = 100
Healing Output = 30

Missing HP = 10
Direct Recovery = 10
Overheal Amount = 20

→ Current HP = 100
→ 另外產生 20 點過量治療
```

---

# 5. 過量治療不自動變成暫時生命值

Canonical Alpha：

```text
Overheal Amount > 0
→ 進入 GM 過量治療審批
```

這個「Check」是 GM 確認／裁決，**不是額外擲一粒骰。**

GM 可選：

```text
A. 不保留過量治療
→ 超出部分消散

B. 將部分過量治療轉成暫時生命值

C. 將全部過量治療轉成暫時生命值

D. 依能力／世界／目標特性，將部分過量轉成其他合理恢復表現
```

AI 可按情境提供 1–3 個建議，但 GM 作最終決定。

---

# 6. 暫時生命值獨立於 Max HP

即使 GM 批准 Overheal，**不要直接改寫角色 Max HP。**

資料應分開：

```text
Current HP
Max HP
Temporary HP
```

例如：

```text
Current HP = 100
Max HP = 100
Temporary HP = 35
```

玩家介面可以顯示：

```text
HP：100 / 100
暫時生命：+35
```

而不是：

```text
HP：135 / 135
```

原因是 Max HP 仍然代表角色真正生命容量；暫時生命只是額外生命緩衝。

---

# 7. 受傷時先消耗暫時生命

Alpha 預設：

```text
受到有效 Damage Result
→ 先扣 Temporary HP
→ 剩餘傷害再扣 Current HP
```

例如：

```text
Current HP = 100
Temporary HP = 20
受到 12 Damage

→ Temporary HP = 8
→ Current HP = 100
```

若受到 30 Damage：

```text
Temporary HP 20 → 0
剩餘 10
Current HP 100 → 90
```

特殊 Damage Profile 如明確寫有「無視暫時生命」等規則，可以覆蓋此預設。

---

# 8. 暫時生命不等於可以被普通治療補滿

普通治療仍只優先恢復：

```text
Current HP → Max HP
```

Temporary HP 不視為普通缺失 HP。

只有新的 Overheal Amount 經 GM 批准後，才可增加 Temporary HP。

這避免治療能力把一層已存在的暫時生命當成另一條可以無限補滿的正常 HP 條。

---

# 9. 過量治療的正面敘事效果

在尚未進入過量失控前，GM 可以將 Approved Overheal 解讀成生命力／恢復能力暫時過剩。

AI 可提供 1–3 個合理描述，例如：

```text
傷口收口速度明顯加快
疲勞感迅速消退
呼吸／循環／肌肉狀態恢復得異常快
身體充滿過剩生命能量
短時間內呈現比正常狀態更旺盛的恢復反應
```

這些預設是敘事表現。

若要變成真正機械 Buff，例如：

```text
再生
狀態抗性提高
恢復速度提高
額外行動加成
```

必須由 GM 明確批准並建立相應 Status／Effect；不能因為有 Temporary HP 就自動免費取得。

---

# 10. 200% 有效生命量作過量失控線

Alpha Working Threshold：

```text
Overheal Load
= (Max HP + Temporary HP) / Max HP
```

當：

```text
Max HP + Temporary HP < 2 × Max HP
```

即：

```text
Overheal Load < 200%
```

屬於一般「可穩定過量治療」區域；是否保留 Temporary HP 仍需 GM 批准。

當：

```text
Max HP + Temporary HP >= 2 × Max HP
```

即角色有效生命容量達到或超過正常 Max HP 的 200%：

```text
→ 進入過量治療失控／Overheal Overload
```

例如：

```text
Max HP = 100
Temporary HP = 100

有效生命容量 = 200
→ 達到 200%
→ 開始進入失控風險
```

這個 200% 是 Alpha 可調參數，不代表永久平衡值。

---

# 11. 過量失控不使用固定懲罰表

達到 200% 不等於自動：

```text
扣多少傷害
固定暈眩
固定爆炸
固定死亡
```

而是觸發 GM + AI 情境推演。

AI 根據：

```text
治療來源
目標種族／身體結構
過量生命來源
Temporary HP 數量
是否為魔法／生物／科技治療
既有狀態
世界規則
環境
```

提供 1–3 個合理失控建議。

可能方向例如：

```text
組織／血肉過度增生
再生速度失控
腫脹或身體比例異常
過剩生命能量令身體難以控制
疼痛／壓力／活動受限
額外器官／組織短暫生成
植物／木屬生命治療造成枝芽、根系或組織擴張
魔力治療造成生命能量飽和或外溢
```

這些只是方向，不是固定表。

GM 可：

```text
接受
修改
拒絕並自行裁決
```

---

# 12. 超過 200% 後仍可存在，但需顯式裁決

200% 是「開始出現代價／失控」的線，而不是硬性 Temporary HP 上限。

因此理論上可以：

```text
Max HP = 100
Temporary HP = 140
→ 有效生命容量 240%
```

但：

```text
達到／超過 200%
→ 不再視為單純安全的額外生命
→ GM 必須明確確認是否保留這些 Temporary HP
→ 同時處理至少一個合理的失控／代價方向，或明確裁決為例外
```

AI 可提供 1–3 個失控建議。

這令極端治療可以存在，但不會無成本地把角色堆成數倍 Max HP。

---

# 13. Great Success 與過量失控可以同時成立

例如：

```text
Max HP = 100
Current HP = 100
正常治療量 = 60
來源方骰出 100
```

如果主要效果值為治療量：

```text
Great Success
→ Healing Output = 120
```

因為角色已滿血：

```text
Overheal Amount = 120
```

若 GM 全部批准為 Temporary HP：

```text
Temporary HP = 120
有效生命容量 = 220%
```

結果：

```text
機械上：治療大成功
→ 治療效果確實被放大

故事上：過量生命超過 200%
→ 立即觸發過量失控推演
```

所以：

```text
Great Success ≠ 必然安全
```

與整體 Great Result 設計一致。

---

# 14. Great Failure 治療仍使用 TARGET_DEVIATION

來源方原始 D100 = 1：

```text
→ 治療沒有按原本目標／方式落地
→ AI + GM 提供 1–3 個合理偏離結果
```

可能：

```text
誤中自己
誤中另一個隊友
誤中敵人
落在錯誤區域／物件
能量失控散失
其他符合 Profile 的偏離
```

一旦偏離目標確定：

```text
→ 重新讀取實際目標的 Target Profile
→ 決定是治療、無效、傷害或其他轉換
```

例如治療誤中不死敵人，而該不死 Profile 定義治療能量轉傷害：

```text
→ 交 Damage Resolver 處理
```

Great Failure 仍然是「沒有照原意控制治療」，即使意外結果最後對施術者有利。

---

# 15. 治療轉傷害時不進入 Overheal

若目標 Profile 把治療能量轉成傷害：

```text
→ 不走正常 HP Recovery / Overheal 流程
→ 依該 Profile 建立／使用對應 Damage Profile
→ 交 Damage Resolver 結算
```

轉換後是否受防禦／抗性影響，由該 Target／Damage Profile 決定；不預設無視防禦。

---

# 16. Temporary HP 持續時間

Temporary HP 必須有結束條件，但 Alpha 不需要建立複雜衰減公式。

預設：

```text
持續到被傷害消耗完
或
當前場景結束
```

若治療能力／世界規則／GM 裁決有更明確持續時間，使用該指定值。

不使用每回合固定自然衰減作全域預設。

---

# 17. Alpha 鎖定結論

1. 治療落地後先讀取目標 Profile；治療可正常恢復、無效、轉傷害或轉成其他效果。
2. 願意接受治療的目標通常不需要對抗；強制治療可使用來源 vs 抵抗 D100。
3. 治療量的具體生成方式由 Healing / Ability Profile 決定；本 Resolver 使用最終 Healing Output。
4. 正常治療先補 Current HP 至 Max HP。
5. 超出 Max HP 的部分成為 Overheal Amount。
6. Overheal 不自動變 Temporary HP；必須經 GM 審批。此 Check 是裁決，不是額外骰。
7. Temporary HP 與 Max HP 分開保存，不改寫真正 Max HP。
8. Damage 預設先消耗 Temporary HP，再扣 Current HP。
9. 普通治療不會直接補回已消耗的 Temporary HP；只有新的 Overheal 經 GM 批准後才可增加。
10. 安全／可穩定 Overheal 區域暫定為總有效生命低於 200% Max HP。
11. `Max HP + Temporary HP >= 200% Max HP` 時觸發 Overheal Overload。
12. 過量失控由 AI 提供 1–3 個合理建議，GM 最終裁決；不使用固定懲罰表。
13. 200% 是開始出現失控代價的 Alpha 線，不是硬性 Temporary HP 上限。
14. Great Success 治療可把主要治療效果 ×2，並可能因此直接推入 Overheal Overload。
15. Great Failure 治療使用 TARGET_DEVIATION；誤中後按實際目標 Profile 重新解讀效果。
16. 治療若被目標 Profile 轉化為傷害，改走 Damage Resolver，不進入 Overheal。
17. Temporary HP 預設持續至被消耗完或場景結束；特殊來源可覆蓋。
18. 所有正式 HP、Temporary HP、Profile 與 GM 裁決結果保存於 D1。
