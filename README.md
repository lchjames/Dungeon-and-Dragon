# Vault（登入 + Excel 角色表）

- 首頁登入（管理員/玩家）
- **玩家**：只會看到被指派的角色；進入角色卡為唯讀
- **管理員**：可新增/編輯/刪除角色，亦可由 Excel 匯入建立角色；用戶管理與指派角色

## 角色資料結構（每個角色）
- 基本：id、name、job、align（LG/NG/...）、age、gender、exp、level
- skills：[{type,name,base,prof}]
- money：{cp,sp,gp}
- items：[{name,desc,qty,atk,def}]
- spellskills：[{name,desc,target,area,range,b1,b2,b3,mp}]

## Excel 匯入（管理員）
需保留工作表名：**人物表(自動計算)**、**持有道具**、**持有技能法術**。程式會自動掃描表頭並映射欄位。

## 部署（GitHub Pages）
- 全部檔案放 repo 根目錄 → Settings → Pages → Deploy from a branch（main / /(root)）
- 進站後用 `admin` 初始化密碼 → 新增玩家 → 在用戶表把角色ID加到玩家的 `allowed` 清單

> 注意：此為前端 localStorage 方案，屬於方便的可見性分離，**不是嚴格保安**。如需真正身份系統與資料庫，建議接入 Supabase/Firebase。

授權：MIT
