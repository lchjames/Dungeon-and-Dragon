# Basic Skill D100 Check Authority — Alpha

> 狀態：Canonical Alpha Integration Authority  
> 範圍：23 個 Basic Skills 的正式 D100 判定、GM meaningful-check 認可、immutable D1 audit、Great Success 成長資格紀錄。  
> 依據：`D100判定核心_ALPHA.md`、`基礎技能與大成功成長系統_ALPHA.md`、`對抗判定與極端結果_ALPHA.md`、`瀕死死亡與角色鎖定_ALPHA.md`。

---

## 1. Authority boundary

本 slice 只建立一個可持久化、可審計的 Basic Skill D100 判定 authority。

它處理：

- 23 個 canonical Basic Skills；
- Character 當下天然 Skill value snapshot；
- GM 輸入的總修正；
- server D100 或 GM 外部／實體骰輸入；
- canonical D100 Result；
- Success / Failure；
- raw 100 / raw 1 Great marker；
- meaningful reason + GM-only context audit；
- Great Success 的 pending growth-eligibility marker。

它**不處理**：

- 自動把 Skill +1；
- 自動修改 `growth_progress`；
- 自行決定每次 Great Success 提供幾多成長進度；
- 自行決定幾多進度換 +1；
- SP 消耗；
- 對抗雙方一次過結算；
- Combat Action / Move 消耗；
- Ability、Weapon Mastery 或 Element Rank 判定；
- AI 自動裁決 Great Success / Great Failure 的敘事後果。

以上未鎖定的 balance / adapter 規則不得由此 resolver 偷偷補完。

---

## 2. Canonical Basic Skills only

判定只接受 `src/rules.js` 的 `BASIC_SKILLS` 23 個 key。

因此：

```text
Melee
Ranged
Guard
Grapple
```

不能重新透過此 API 變成第二套 Basic Skill。

`throwing` / 投擲與 `dodge` / 閃避仍是正式 Basic Skill。

---

## 3. Canonical D100 formula

Resolver 使用：

```text
Result
= Raw Roll - [100 - (Natural Skill Value + Total Modifier)]
```

判讀：

```text
Result > 0  → Success
Result <= 0 → Failure
```

其中：

- `Natural Skill Value` 來自 D1 `character_skills.natural_value`；
- 天然值必須介乎 `0–98`；
- `Total Modifier` 是 Buff / Debuff / Equipment / Ability / GM / Environment 等當次修正的已合計整數；
- `Effective Skill Value = Natural Skill Value + Total Modifier`；
- 外部修正不會永久改寫 Character Skill natural value。

---

## 4. Raw Great markers and ordinary result remain separate

Canonical raw extreme：

```text
Raw 100 → GREAT_SUCCESS
Raw 1   → GREAT_FAILURE
其他    → NONE
```

`extreme_result` 與 `result_value` 同時保存。

這個 slice 不新增「raw 1 一定覆蓋所有修正」或「raw 100 無條件勝利」等新規則。Result 仍照 canonical formula 保存；Great marker 供後續 GM / AI / opponent adapter 使用。

Great Success 成長資格看 raw 100，而不是要求 `result_value` 一定擊敗另一個未在本 resolver 內存在的對手 Result。

---

## 5. Meaningful-check gate

所有正式 GM POST 必須提供非空白 `meaningfulReason`。

目的係確保 audit 至少表明：

> 點解呢次判定係場景、任務、戰鬥或實際目標中有意義的判定。

Player 沒有 Basic Skill check write route。

因此目前 authority 不接受：

```text
Player 自己重複按掣
→ 自己製造大量 D100
→ 刷 Great Success 成長資格
```

GM 仍負責判斷是否應該要求一次正式 check；系統只將已認可的 check 寫入 authority log。

---

## 6. Roll source

### Server roll

GM 不提供 `rawRoll`：

```text
roll_source = SERVER
```

Worker 使用 canonical secure die helper 生成 `1–100`。

### GM external roll

GM 明確輸入 `rawRoll`：

```text
roll_source = GM_ENTRY
```

適用於實體骰、桌外骰器或 GM 已經完成的可驗證擲骰。

輸入仍必須為 `1–100` 整數。

---

## 7. Great Success growth eligibility — no invented balance

`基礎技能與大成功成長系統_ALPHA.md` 已鎖定：

```text
有效 Basic Skill D100 Great Success
→ 有資格產生使用成長
```

但以下數值仍未鎖定：

- 每次 Great Success 提供幾多 progress；
- 幾多 progress 換 +1；
- 高 Skill 區間是否需要更多 progress。

所以本 slice 的唯一合法行為是：

```text
Raw 100
→ character_skill_growth_eligibility_log
→ growth_status = PENDING_BALANCE
```

並 snapshot：

- `growth_progress_before`
- `skill_value_before`

同時：

```text
growth_progress_after = NULL
skill_value_after = NULL
```

Resolver **不得**執行：

```text
UPDATE character_skills SET growth_progress = ...
UPDATE character_skills SET natural_value = natural_value + 1
```

即使 Skill 已經 98，Great Success 仍可留下「曾符合 Great Success eligibility」的歷史 marker；但未來 growth settlement 亦不得突破 98 natural cap。

---

## 8. D1 audit authority

Migration：

```text
schema/0036_basic_skill_d100_check_authority.sql
```

### `character_skill_check_log`

保存：

- Character / Skill stable IDs；
- Skill key / label snapshot；
- Natural / Modifier / Effective snapshot；
- Raw Roll / Result；
- Success flag；
- Great marker；
- Roll source；
- Meaningful reason；
- GM-only context JSON；
- actor User ID；
- timestamp。

### `character_skill_growth_eligibility_log`

只為 Great Success 建立一對一 eligibility row，保存：

- source Skill Check；
- Character / Skill；
- `PENDING_BALANCE`；
- progress / Skill before snapshot；
-尚未決定的 after values 為 `NULL`。

兩張表均有 no-update / no-delete trigger，正常 authority path 視為 immutable audit。

---

## 9. API

### GM list / resolve

```text
GET  /api/gm/characters/:characterId/basic-skill-checks
POST /api/gm/characters/:characterId/basic-skill-checks
```

POST example：

```json
{
  "skillKey": "investigation",
  "totalModifier": 10,
  "meaningfulReason": "Search the locked study for the missing ledger.",
  "context": {
    "sceneRunId": "scene_run_..."
  }
}
```

留空 `rawRoll` 代表 server roll。

GM external roll：

```json
{
  "skillKey": "investigation",
  "totalModifier": 10,
  "rawRoll": 100,
  "meaningfulReason": "Physical table roll for the same study search."
}
```

### Player history

```text
GET /api/player/characters/:characterId/basic-skill-checks
```

只可讀取自己 Character。

Player projection不回傳：

- GM `context_json`
- `actor_user_id`
- 其他只供GM provenance使用的隱藏資料。

Player 對同一路徑使用 POST / PATCH / DELETE 均不構成合法寫入 authority。

---

## 10. Character death lock

Canonical death rule要求死亡 Character 的 Skill / growth data 唯讀。

所以正式 POST 會檢查 `character_life_states.character_locked`：

```text
character_locked = true
→ CHARACTER_LOCKED_DEAD
```

本 slice **不新增**「Character status 必須等於 active」的額外規則；只使用已有 canonical death lock。

---

## 11. Action economy boundary

此 endpoint 是 GM adjudication / audit authority，唔係一個新的 Player Action button。

它本身不扣：

```text
Combat Action
Move
MP
HP
```

如果未來某個 Exploration / Combat action adapter 需要 D100 check，該 adapter 必須按自己的 canonical action-cost / ordering 規則調用或引用 D100 authority，不能因本 endpoint 存在而免費繞過 Action economy。

---

## 12. UI

GM Character頁提供：

- 23 Basic Skill selector；
- Total Modifier；
- optional Raw D100；
- required Meaningful Reason；
- optional Context JSON；
- recent immutable check audit；
- `PENDING_BALANCE` Great Success marker。

UI 亦明確說明 Great Success 暫時不會增加 progress 或 Skill value。

---

## 13. Production verification boundary

Production descriptor：

```text
scripts/production-alpha-basic-skill-d100-check-e2e.mjs
```

目前只做 **plan-only safety description**。

它不登入、不寫 production D1、亦不聲稱 credentialed live mutation 已通過。

正式 release 仍要求：

```text
branch CI
→ PR CI
→ squash main
→ main full node-checks
→ Cloudflare deploy
→ production route smoke
```

---

## 14. Next authority boundary

此 slice 完成後仍然未鎖定：

1. Great Success growth progress 實際數值；
2. progress → +1 的換算門檻；
3. 高 Skill 成長曲線；
4. SP post-creation expenditure curve；
5. 對抗雙方一次提交／一次結算的通用 D100 adapter；
6. 將特定 Exploration / Combat actions 綁定到 D100 + Action economy 的 adapters。

以上必須等相應 canonical balance / integration 規則確定後再實作。
