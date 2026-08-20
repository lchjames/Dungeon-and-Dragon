# 治療與過量治療 — Alpha

> 狀態：Canonical Alpha Working Rule  
> 範圍：治療落地、目標反應、過量治療、GM-only 暫時生命、Great Result。  
> 本文件與 `非傷害效果結算_ALPHA.md`、`對抗判定與極端結果_ALPHA.md`、`COMBAT_DAMAGE_MODEL_ALPHA.md` 一起使用。  
> **Canonical Override：** 較早版本中的 200% Overheal Overload、CON／體質負面效果與複雜過量失控規則不屬於目前 Alpha；已移至 `FUTURE_UPDATE_BACKLOG.md`。

---

# 1. 治療先讀取目標 Profile

治療成功落在目標後，先由目標自身 Profile 決定治療能量的實際意義。

可能包括：

```text
正常治療
無效／免疫
轉化為傷害
轉化為其他效果
特殊種族／世界規則
```

例如：

```text
普通生命體
→ 正常恢復 HP

不死生物
→ 如 Profile 定義治療能量會造成傷害
→ 改交 Damage Resolver 處理
```

Great Failure 誤中錯誤目標後，同樣先讀取實際目標 Profile，再決定最終效果。

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

平手時受影響一方有微小優勢，因此強制治療不成立。

---

# 3. 治療量由 Ability / Healing Profile 提供

本 Resolver 不鎖死治療一定使用固定值或治療骰，只要求進入本流程前已得到：

```text
Final Healing Output
```

如來源方原始 D100 = 100，而且治療成功落地：

```text
Great Success
→ 治療的主要效果值 ×2
```

例如：

```text
正常 Healing Output = 12
→ Great Success = 24
```

倍增後才進入 HP／Overheal 流程。

---

# 4. 正常治療先補 Current HP

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
Current HP = 90
Max HP = 100
Healing Output = 30

Direct Recovery = 10
Overheal Amount = 20

→ Current HP = 100
→ Overheal = 20
```

---

# 5. Alpha Overheal：GM-only 50% Random Check

只要：

```text
Overheal Amount > 0
```

GM 端自動／手動觸發一個簡單：

```text
50% Success
50% Failure
```

這是 **GM-only 隱藏判定**，玩家不應看到該次判定結果或機率結果細節。

## Success

```text
Temporary HP Gain
= floor(Overheal Amount / 2)
```

即只有過量治療的一半轉為暫時生命。

例：

```text
Overheal = 20
50% Check = Success

→ Temporary HP +10
```

若 Overheal 為奇數，Alpha 以整數 HP 向下取整：

```text
Overheal = 9
→ Temporary HP +4
```

## Failure

```text
Overheal Amount 全部消散
→ Temporary HP +0
```

沒有額外懲罰、反噬或第二次判定。

---

# 6. Temporary HP 是玩家隱藏值

Canonical Alpha：

```text
Temporary HP
→ D1 正式保存
→ GM 可見實際值
→ Player 不可見實際值
```

Player UI 只顯示正常：

```text
Current HP / Max HP
```

不得顯示：

```text
暫時生命：+10
有效 HP：110 / 100
隱藏護盾：10
```

GM UI 可顯示：

```text
Current HP
Max HP
Hidden Temporary HP
Overheal Check Result
來源／取得時間
```

Temporary HP 不改寫角色 Max HP。

---

# 7. 受傷時先消耗隱藏 Temporary HP

Alpha 預設：

```text
受到有效 Damage Result
→ 先扣 Temporary HP
→ 剩餘傷害再扣 Current HP
```

例：

```text
玩家畫面：HP 100 / 100
GM 隱藏 Temporary HP = 10
受到 7 Damage

→ Temporary HP 10 → 3
→ Current HP 仍為 100
```

玩家不會因此看到 Temporary HP 的精確剩餘量。

GM 可以按故事需要描述為：

```text
身體恢復力異常旺盛
傷勢似乎比預期更輕
過剩生命力吸收了部分衝擊
```

但不應直接洩露隱藏數字。

若受到 15 Damage：

```text
Temporary HP 10 → 0
剩餘 Damage = 5
Current HP 100 → 95
```

特殊 Damage Profile 如明確定義無視 Temporary HP，可覆蓋此預設。

---

# 8. 普通治療不能直接補 Temporary HP

普通治療只恢復：

```text
Current HP → Max HP
```

Temporary HP 不屬於 Missing HP。

只有新的 Overheal Amount 再通過 GM-only 50% Check，才可能增加新的 Temporary HP。

若角色本身已有 Temporary HP，而新的 Overheal Check 成功：

```text
新取得 Temporary HP
→ 加到現有 Temporary HP
```

Alpha 暫不加入額外疊加上限、衰減率或過量副作用。

---

# 9. Temporary HP 持續時間

Alpha 保持簡單：

```text
持續至：
1. 被傷害消耗完；或
2. 當前場景結束
```

如能力 Profile／GM 裁決有更明確持續時間，則使用該指定值。

不使用每回合自然衰減作全域預設。

---

# 10. Overheal 的敘事表現不等於免費 Buff

GM 可以利用存在 Hidden Temporary HP 來合理化角色短時間生命力旺盛，例如：

```text
傷口收口得比平常快
疲勞感恢復得較快
身體看起來有異常旺盛的生命力
小傷似乎很快恢復
```

這些在 Alpha 預設只是**故事描述**。

不自動增加：

```text
再生數值
CON Bonus
狀態抗性
行動次數
移動速度
傷害加成
```

如果未來要把過量治療變成真正機械 Buff／Debuff，另行設計。

---

# 11. Great Failure 治療使用 TARGET_DEVIATION

來源方原始 D100 = 1：

```text
→ 治療沒有按原本目標／方式落地
→ AI + GM 提供 1–3 個合理偏離結果
```

例如：

```text
誤中自己
誤中另一個隊友
誤中敵人
落在錯誤區域／物件
能量失控散失
```

確定實際目標後：

```text
→ 重新讀取該 Target Profile
```

因此治療大失敗誤中不死敵人，而該 Profile 定義治療能量造成傷害時：

```text
→ 改走 Damage Resolver
```

Great Failure 仍然成立，因為角色沒有按原意控制治療；意外結果不需要強制對玩家不利。

---

# 12. 治療轉傷害時不進入 Overheal

若目標 Profile 把治療能量轉成傷害：

```text
→ 不走 HP Recovery / Overheal
→ 使用對應 Damage Profile
→ 交 Damage Resolver
```

是否受防禦／抗性影響，由該 Target／Damage Profile 決定。

---

# 13. Alpha 不處理的 Overheal 進階項目

以下已正式延後至中央 Future Update Backlog：

```text
200% Max HP 或其他 Overheal Load 失控線
過度增生／身體失控／生命能量過載
以 CON／體質決定承受 Overheal 的能力
不同種族／身體結構的 Overheal 副作用
Temporary HP 過高時的正式 Debuff
Overheal 對自然恢復速度的機械加成
更細緻的 Temporary HP 衰減／上限／疊加規則
```

Alpha 不因上述項目尚未完成而新增額外判定。

---

# 14. Alpha 鎖定結論

1. 治療落地後先讀取目標 Profile；可正常恢復、無效、轉傷害或轉成其他效果。
2. 願意接受治療通常不需要對抗；強制治療可使用 D100 對抗。
3. Great Success 治療可把主要治療效果 ×2。
4. 正常治療先補 Current HP 至 Max HP。
5. 超出 Max HP 的部分成為 Overheal Amount。
6. `Overheal Amount > 0` 時，由 GM 端進行隱藏 50% Random Check。
7. Check 成功：`floor(Overheal Amount / 2)` 轉為 Temporary HP；失敗：Overheal 全部消散。
8. Temporary HP 是 GM-only 隱藏數值；Player 不顯示實際值。
9. Temporary HP 與 Max HP 分開保存，不改寫 Max HP。
10. Damage 預設先消耗 Temporary HP，再扣 Current HP。
11. 普通 Healing 不直接補 Temporary HP；新的 Overheal 必須重新通過 50% Check。
12. Temporary HP 預設持續至被消耗完或場景結束。
13. Hidden Temporary HP 可用作敘事上的旺盛恢復力，但不自動提供機械 Buff。
14. Great Failure 治療使用 TARGET_DEVIATION；誤中後按實際目標 Profile 重新解讀。
15. 治療轉傷害時改走 Damage Resolver，不進入 Overheal。
16. 200% 失控、CON／體質 Overheal 承受力與正式副作用全部延後，不屬於目前 Alpha。
17. 所有正式 HP、Hidden Temporary HP、Profile 與 GM 判定結果保存於 D1。
