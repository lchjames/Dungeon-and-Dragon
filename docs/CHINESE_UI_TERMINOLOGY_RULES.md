# 全站中文介面與術語規則

> 狀態：Canonical UI / Terminology Rule
> 範圍：玩家端、GM 端、遊戲內文字、技能／魔法／戰鬥／物品／請求／提示／按鈕／狀態顯示。

---

## 1. 核心規則

整個遊戲系統所有玩家可見與 GM 可見的文字，正式語言一律使用**繁體中文**。

包括但不限於：

- 頁面名稱
- 導航列
- 按鈕
- 欄位名稱
- 狀態名稱
- 技能名稱
- 魔法名稱
- 技能分類
- 戰鬥資訊
- 傷害類型
- 增益／減益
- 物品類型
- 貨幣名稱
- 商店資訊
- 匯率資訊
- 玩家提示
- 錯誤訊息
- 確認視窗
- GM 管理功能
- AI 產生技能後的說明與判定理由
- 申請／審批流程

任何正常遊戲介面都不應直接以英文術語作為主要顯示文字。

---

## 2. 技術內部識別例外

程式碼、API、資料庫欄位、enum、內部 route、JSON key 等技術識別可以保留英文，以維持開發可讀性與一致性。

例如內部可使用：

```text
skill_id
source_bonus
buff_modifier
item_type
WEAPON
ARMOUR
ITEM
PENDING
APPROVED
```

但玩家／GM 介面必須顯示為中文：

```text
技能
來源加值
增益／減益修正
物品類型
武器
防具
物品
待審核
已批准
```

內部英文識別不得直接洩漏成正式 UI 文字。

---

## 3. 核心中文術語

現階段優先使用以下繁體中文正式術語：

```text
Skill                 → 技能
Ability               → 能力／招式（按語境）
Technique             → 技法／招式
Spell                 → 魔法／法術
Passive               → 被動能力
Buff                  → 增益
Debuff                → 減益
Damage                → 傷害
Healing               → 治療
Effect                → 效果
Status Effect         → 狀態效果
Source Bonus          → 來源加值
Final Check           → 最終判定值
Target                → 目標
Single Target         → 單體
Multiple Targets      → 多目標
Area                  → 範圍
Line                  → 直線
Cone                  → 錐形
Range                 → 射程／作用距離
Duration              → 持續時間
Projectile            → 投射物
Control               → 控制
Stun                  → 暈眩
Blind                 → 致盲
Slow                  → 緩速
Bind / Root           → 束縛／定身
Push                  → 推離
Pull                  → 拉近
Knockback             → 擊退
Reposition            → 位移
Cleanse               → 淨化
Regeneration          → 再生
Enchantment           → 附魔
Enchantment Magic     → 附魔魔法
Physical              → 物理
Element               → 元素
No Element            → 無元素
Rank                  → 階級
Magic Rank            → 魔法階級
Martial Rank          → 武技階級
Adventurer Rank       → 冒險者階級
Skill Point           → 技能點
Experience / EXP      → 經驗值／EXP
Level                 → 等級
Inventory             → 物品欄
Weapon                → 武器
Armour                → 防具
Item                  → 物品
Currency              → 貨幣
Exchange Rate         → 匯率
Request               → 申請
Pending               → 待審核
Approved              → 已批准
Rejected              → 已拒絕
Cancelled             → 已取消
```

若後續確立更自然的中文譯名，可更新此表，但全站必須保持一致。

---

## 4. 元素正式名稱

魔法元素在玩家端正式顯示為：

```text
光元素
暗元素
火元素
水元素
風元素
土元素
雷元素
木元素
```

技術內部代碼可分別保留：

```text
LIGHT
DARK
FIRE
WATER
WIND
EARTH
LIGHTNING
WOOD
```

玩家端不應以 `FIRE Magic`、`WOOD Magic` 等中英混合形式作正式顯示。

推薦：

```text
火元素魔法
木元素魔法
光元素魔法
```

---

## 5. 核心判定公式顯示

系統內部可用英文欄位，但玩家端公式應顯示為：

```text
最終判定值 = 技能值 + 來源加值 + 增益／減益修正
```

而不是：

```text
Final Check = Skill + Source Bonus + Buff/Debuff
```

---

## 6. 自創技能／魔法流程中文化

玩家建立自創能力時，介面應使用中文，例如：

```text
能力名稱
作用範圍
單體
多目標
範圍
直線
錐形

[生成能力數值]
```

AI 生成後：

```text
建議階級
消耗魔力
傷害
治療
作用距離
作用範圍
持續時間
狀態效果
限制
平衡判定理由

[確認並提交 GM]
[重新生成]
[取消]
```

GM 端：

```text
[批准]
[修改後批准]
[拒絕]
```

---

## 7. 文件與開發規則

從此文件生效後：

1. 新增的玩家／GM 介面規格一律先以繁體中文術語撰寫。
2. 舊文件中的英文 UI mockup 視為概念參考，不代表最終顯示文字。
3. 實作前應將玩家可見字串統一抽取／集中管理，避免同一概念出現多個譯名。
4. AI 所產生的玩家可見技能說明、效果說明與平衡理由，預設使用繁體中文。
5. 英文僅用於內部技術標識、程式碼與必要的標準縮寫（例如 HP、MP、EXP）。
6. 如 UI 同時保留縮寫，中文名稱應為主要語意，例如：`生命值（HP）`、`魔力（MP）`、`經驗值（EXP）`。

---

## 8. 多語言玩家輸入與中文標準化

玩家的自由文字輸入**不受介面正式語言限制**。

玩家可用繁體中文、簡體中文、英文，或混合語言輸入自創技能／魔法名稱與其他允許的自由文字內容。例如：

```text
Firestorm
Chain Fireball
Thunder Prison
炎爆連彈
Holy Shelter
```

AI 可使用玩家原始輸入進行語意理解、參考比對與平衡判定，但在產生玩家確認結果之前，必須把所有正式遊戲內容標準化為**繁體中文**。

標準流程：

```text
玩家自由語言輸入
      ↓
AI 理解原意
      ↓
參考技能／比例表／階級規則進行判定
      ↓
轉換為繁體中文正式名稱與效果描述
      ↓
玩家確認中文結果
      ↓
提交 GM
      ↓
GM 審批中文結果
      ↓
以繁體中文正式內容寫入 D1
```

例如玩家輸入：

```text
Name: Chain Fireball
Range: Multiple Targets
```

AI 最終應回傳類似：

```text
能力名稱：連環火球
作用方式：多目標
建議階級：第三階
消耗魔力：8
傷害：每枚 1D4 火元素傷害
投射物數量：3
狀態效果：有機率造成燃燒
平衡判定理由：……
```

玩家確認與 GM 審批所見的均為中文版本。

### 8.1 D1 正式內容語言

所有成為正式遊戲資料的自然語言欄位均以繁體中文儲存，包括：

- 技能／能力／魔法名稱；
- 描述；
- 效果文字；
- 限制；
- 平衡判定理由；
- 狀態效果顯示名稱；
- Reference／Scale Table 的正式名稱與說明；
- GM 審批後的最終內容。

結構化技術欄位仍可使用英文代碼，例如：

```text
element_code = FIRE
target_pattern = MULTI_TARGET
status_code = BURN
```

但與這些代碼對應的正式名稱、描述與玩家可見內容必須是繁體中文。

### 8.2 Reference / Scale Table

Reference Magic Table、物理招式 Reference Table、傷害／治療／控制 Scale Table 等正式平衡資料，**內容本身亦以繁體中文為標準版本**。

AI 可以理解英文玩家輸入，再與中文 Reference 資料進行語意配對；不需要要求玩家先自行翻譯成中文。

因此：

```text
玩家輸入語言 = 可彈性
AI 理解語言 = 可多語言
正式遊戲輸出 = 繁體中文
D1 自然語言資料 = 繁體中文
```

---

## 9. 優先級

本文件為全站玩家／GM 可見文字及正式自然語言資料的 Canonical Override。

若其他規格文件中的英文 UI 標籤、按鈕、頁面名稱、術語、Reference 名稱或 AI 輸出語言與本文件衝突，應以本文件為準，直到相關舊文件被正式整合更新。
