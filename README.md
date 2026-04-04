# MOEX Emulator

跨平台的 MOEX 模擬測驗重建版，使用本地 `database/` 題庫與圖片資產，目標是還原原站的流程和排版，同時支援離線作答。

## 技術棧

- Tauri 2
- React 19
- TypeScript
- Rust + rusqlite

## 已實作內容

- 本地 exam catalog
- MOEX 風格登入頁
- 考生資訊確認頁
- 成績顯示設定頁
- 候考倒數頁
- 正式單題作答頁
- 題號跳轉 / 註記 / 上下題 / 取消作答 / 放大縮小
- 瀏覽作答頁
- 兩段式結束作答確認
- 可依設定顯示無成績結果頁或成績摘要 / 作答紀錄 / 題目檢討
- 使用預先整理好的 clean SQLite 作為 runtime 資料源

## 先整理題庫

桌面 app 不會在啟動時整理題庫。當原始資料更新時，先手動跑一次：

```powershell
python scripts/build_clean_db.py
```

或：

```powershell
npm run prepare-db
```

這會讀取 `database/cougarbot_exams.sqlite`，並產生桌面 app 專用的：

- `database/moex_clean.sqlite`

## 開發模式

```powershell
npm install
npm run tauri dev
```

## 前端 build

```powershell
npm run build
```

## Rust build

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --release
```

release executable 位置：

- `src-tauri/target/release/moex_emulator.exe`

注意：

- 這個 `cargo build` 產生的是 Rust 裸執行檔，不是完整的 Tauri app build。
- 若直接執行它，可能會看到 `localhost 拒絕連線`，因為前端資源沒有透過 Tauri build 流程嵌入。
- 要測試可直接啟動的 release 版本，請用下面這個指令。

## 測試用桌面 build

```powershell
npm run build:desktop
```

這會：

1. 先執行一次 `python scripts/build_clean_db.py`
2. 再用 `tauri build --no-bundle` 產出可直接測試的桌面 executable

之後執行：

```powershell
.\src-tauri\target\release\moex_emulator.exe
```

## Windows bundle

```powershell
npm run tauri build
```

目前專案本體可以成功編譯成 release executable，但 MSI bundling 在這台機器上卡在 WiX `light.exe` 階段。這不影響 app 本身的編譯結果，只影響 Windows installer 產物。

## 資料來源

- 原始題庫：`database/cougarbot_exams.sqlite`
- clean 題庫：`database/moex_clean.sqlite`
- 題圖：`database/images/`

原始 SQLite 不會被修改。runtime 只讀 `database/moex_clean.sqlite` 和 `database/images/`。
