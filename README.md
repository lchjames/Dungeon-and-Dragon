# Vault（登入 + Excel 角色表 + 手機優化 + 修正）
- 修正：避免 `Cannot access 'btnAdd' before initialization`
- 首頁登入（管理員/玩家）；玩家只見被指派角色，唯讀
- 管理員：新增/編輯/刪除角色；從 Excel 匯入；用戶管理與指派
- 手機優化：單欄卡片、全屏對話框、表格卡片化、可滑動導航；表格自動加 data-label
- Excel 匯入：顯示已選檔、載入中動畫、成功/失敗提示

## 部署
GitHub Pages → Deploy from a branch（main / /(root)）

## 初次使用
進站輸入 `admin` + 你要設定的新密碼 → 新增玩家 → 角色頁新增/匯入 → 在用戶頁把角色ID加入該玩家的 allowed 清單。

MIT
