# 伴讀筆記（原生 PDF 版）

安裝需求為 Windows、Chrome、Node.js 24，以及已用 ChatGPT 帳號登入的 Codex 桌面版或 CLI。下載 GitHub Releases 的安裝 ZIP 後，先完整解壓縮再執行下列步驟。安裝包包含已建置的 Chrome 擴充與本機橋接。

1. 執行這個資料夾的啟動伴讀.cmd。這一版使用本機連接埠 17372，可以和原版同時運作。
2. 在 Chrome 的 chrome://extensions 開啟開發人員模式，載入本專案的 extension 資料夾。若要跟讀從電腦開啟的本機 PDF，進入「伴讀筆記（原生 PDF 版）」的詳細資料，打開「允許存取檔案網址」。
3. 切到 Chrome 已開啟的 PDF，點工具列「伴讀筆記（原生 PDF 版）」圖示，然後按「開始跟讀」。

跟讀只截取所選 PDF 分頁的可見畫面。從工具列辨識到頁碼時，回翻直接沿用原回答。若工具列隱藏或頁碼無法辨識，側欄以畫面比對，同頁改變縮放或位置可能重新整理。參考資料及跟讀快取與原版分開。

從原始碼重建時，執行 npm.cmd ci，再執行 npm.cmd run build。執行 npm.cmd test 可驗證原始碼。
