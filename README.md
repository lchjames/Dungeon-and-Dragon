# Vault（Excel 同步版）

把角色頁結構盡量貼近你的 Excel：
- 角色：探索者姓名／職業／陣營／年齡／性別／EXP
- 技能列表：技能類型、技能名稱、初始值（％）、職業加成（＋）、合計（％）
- 金錢：銅幣、銀幣、金幣
- 持有道具：物品名稱、說明、數量、攻擊力、防禦力
- 持有技能法術：技能名稱、說明、目標、效應範圍、效應距離、加成1～3、消耗法力

## Excel 直接匯入
前端網站可使用 SheetJS 在瀏覽器讀取 `.xlsx`：

```html
<script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
<script>
// 讀檔後，解析指定工作表到上述 JSON schema，再呼叫 hydrate()
</script>
```

由於此壓縮包在本地測試環境無法連網，所以預設關閉。上線後可打開並映射欄位。

## JSON 匯出/匯入
支援一鍵匯出/匯入 JSON，方便備份與遷移。

## 授權
MIT
