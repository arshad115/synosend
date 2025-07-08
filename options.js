import { getOrCreateKey, encrypt, decrypt } from './crypto-utils.js';

document.addEventListener("DOMContentLoaded", () => {
  const nasInput = document.getElementById("nasUrl");
  const userInput = document.getElementById("username");
  const passInput = document.getElementById("password");
  const status = document.getElementById("status");
  const testStatus = document.getElementById("testStatus");

  // Load saved values
  const downloadLocationInput = document.getElementById("downloadLocation");
  chrome.storage.local.get(["nasUrl", "username", "encryptedPassword", "passwordIV", "downloadLocation"], async (data) => {
    nasInput.value = data.nasUrl || "";
    userInput.value = data.username || "";
    downloadLocationInput.value = data.downloadLocation || "Downloads";
    if (data.encryptedPassword && data.passwordIV) {
      try {
        passInput.value = await decrypt(data.encryptedPassword, data.passwordIV);
      } catch (e) {
        console.error("Failed to decrypt password", e);
        passInput.value = "";
      }
    }
  });

  // Save settings with encrypted password
  document.getElementById("save").addEventListener("click", async () => {
    try {
      const enc = await encrypt(passInput.value);
      chrome.storage.local.set({
        nasUrl: nasInput.value,
        username: userInput.value,
        encryptedPassword: enc.data,
        passwordIV: enc.iv,
        downloadLocation: downloadLocationInput.value || "Downloads"
      }, () => {
        status.textContent = "✅ Settings saved!";
        status.style.color = "#28a745";
        setTimeout(() => (status.textContent = ""), 2000);
      });
    } catch (err) {
      console.error("Encryption failed", err);
      status.textContent = "❌ Failed to save settings";
      status.style.color = "red";
    }
  });

  // Test connection
  document.getElementById("test").addEventListener("click", async () => {
    const nasUrl = nasInput.value.trim();
    const username = userInput.value.trim();
    const password = passInput.value;

    if (!nasUrl || !username || !password) {
      testStatus.textContent = "❌ Please fill in all fields.";
      testStatus.style.color = "red";
      return;
    }

    testStatus.textContent = "⏳ Testing connection...";
    testStatus.style.color = "#333";

    const params = new URLSearchParams({
      api: "SYNO.API.Auth",
      version: "7",
      method: "login",
      account: username,
      passwd: password,
      session: "DownloadStation",
      format: "sid"
    });

    try {
      const res = await fetch(`${nasUrl}/webapi/auth.cgi?${params}`);
      const json = await res.json();
      if (json.success && json.data?.sid) {
        testStatus.textContent = "✅ Connection successful!";
        testStatus.style.color = "green";
      } else {
        testStatus.textContent = `❌ Failed: code ${json.error?.code || "unknown"}`;
        testStatus.style.color = "red";
      }
    } catch (err) {
      testStatus.textContent = "❌ Could not connect to NAS.";
      testStatus.style.color = "red";
      console.error("Connection test failed", err);
    }
  });
});