# SynoSend

A Chrome Extension that lets you **right-click any link** (like `.mp4`, `.zip`, etc.) and instantly send it to your **Synology Download Station** — no DSM login required.

## 🚀 Features

- ✅ Right-click to send any downloadable link to your NAS
- 🔐 Secure login with session reuse (DSM 7+ compatible)
- 💾 Popup UI to set NAS URL, username, and app password
- 🔄 Auto-reconnect if session expires
- 🟢 Status icon: Green = OK, Red = Failed

## 📸 Screenshots

> _Coming soon — UI and example right-click flow_

## 🛠 Installation

1. Clone or download:
    ```bash
    git clone https://github.com/arshad115/synosend.git
    ```

2. In Chrome:
   - Open `chrome://extensions`
   - Enable **Developer Mode**
   - Click **Load unpacked**
   - Select the `synosend` folder

3. Click the SynoSend icon and configure:
   - **NAS URL** (e.g., `https://diskstation.local:5001`)
   - **DSM Username**
   - **[App Password](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/user_admin_apppassword)** (recommended)

## 🧠 How It Works

- Uses Synology's modern Web API:
  - `SYNO.API.Auth` v7 for login
  - `SYNO.DownloadStation.Task` v3 for download queue
- Session (`sid`) is cached for 25 minutes in `chrome.storage.local`
- Downloaded links are sent silently via background service worker

## 🔐 Security

- Passwords are only stored locally in your browser
- Use DSM **App Passwords** instead of your main login
- No tabs, content scripts, or tracking

## 💡 Future Ideas

- Notifications on success/failure
- Support for `.torrent` uploads
- Magnet link handling
- Context menu for selected text

## 📄 License

MIT © Arshad Mehmood
