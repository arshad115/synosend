import { getOrCreateKey, decrypt } from './crypto-utils.js';

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "sendToSynology",
      title: "Send to Synology Download Station",
      contexts: ["link", "image", "video", "audio"],
      targetUrlPatterns: ["*://*/*"]
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mediaTypes = ["video", "audio"];
  const useScriptInjection = mediaTypes.includes(info.mediaType);

  let url = info.linkUrl || info.srcUrl;

  // Fallback: use script injection to find <video> or <audio> src
  if (useScriptInjection && !url && tab?.id) {
    try {
    // Extra: Fetch Download Station info and log the result
    try {
      const infoParams = new URLSearchParams({
        api: "SYNO.DownloadStation2.Info",
        version: "1",
        method: "getinfo",
        _sid: sid
      });
      const infoRes = await fetch(`${nasUrl}/webapi/entry.cgi`, {
        method: "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: infoParams.toString()
      });
      const infoJson = await infoRes.json();
      console.log("📋 SYNO.DownloadStation2.Info response:", infoJson);
    } catch (infoErr) {
      console.warn("Failed to fetch Download Station info:", infoErr);
    }
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const media = document.querySelector("video, audio");
          return media?.currentSrc || null;
        }
      });
      url = result;
    } catch (e) {
      console.error("Script injection failed:", e);
    }
  }

  if (!url) {
    console.warn("❌ No valid URL found in context.");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/synosend_icon_48.png",
      title: "SynoSend",
      message: "No valid link or media URL found to send."
    });
    return;
  }

  console.log("📤 Sending to Synology:", url);

  const { nasUrl, username, encryptedPassword, passwordIV } = await chrome.storage.local.get([
    "nasUrl", "username", "encryptedPassword", "passwordIV"
  ]);

  if (!nasUrl || !username || !encryptedPassword || !passwordIV) {
    console.error("Missing NAS credentials.");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/synosend_icon_48.png",
      title: "SynoSend",
      message: "NAS settings are missing. Please open the options page."
    });
    return;
  }

  try {
    const password = await decrypt(encryptedPassword, passwordIV);

    // Step 1: Query API info for DownloadStation2.Task only
    const apiInfoParams = new URLSearchParams({
      api: "SYNO.API.Info",
      version: "1",
      method: "query",
      query: "SYNO.API.Auth,SYNO.DownloadStation2.Task"
    });
    const apiInfoRes = await fetch(`${nasUrl}/webapi/query.cgi?${apiInfoParams}`);
    const apiInfoJson = await apiInfoRes.json();
    if (!apiInfoJson.success) {
      throw new Error("Failed to get Synology API info");
    }
    const authInfo = apiInfoJson.data["SYNO.API.Auth"];
    const taskInfo = apiInfoJson.data["SYNO.DownloadStation2.Task"];
    if (!authInfo || !taskInfo) {
      throw new Error("Missing Synology API info for Auth or DownloadStation2.Task");
    }

    // Step 2: Login using dynamic path/version
    const authParams = new URLSearchParams({
      api: "SYNO.API.Auth",
      version: String(authInfo.maxVersion || authInfo.minVersion || 7),
      method: "login",
      account: username,
      passwd: password,
      session: "DownloadStation",
      format: "sid"
    });
    const loginRes = await fetch(`${nasUrl}/webapi/${authInfo.path}?${authParams}`);
    const loginJson = await loginRes.json();
    console.log("🔑 Synology login response:", loginJson);
    const sid = loginJson?.data?.sid;
    if (!sid) {
      console.error("Login failed:", loginJson);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/synosend_icon_48.png",
        title: "SynoSend",
        message: "Login to Synology NAS failed."
      });
      return;
    }

    // Fetch Download Station info and log the result before sending the link
    try {
      // Use the correct path and max version from API info, but force path to info.cgi for DownloadStation.Info
      const infoParams = new URLSearchParams({
        api: "SYNO.DownloadStation.Info",
        version: String(taskInfo.maxVersion || taskInfo.minVersion || 1),
        method: "getinfo",
        _sid: sid
      });
      const infoPath = taskInfo.path === "DownloadStation/info.cgi" ? taskInfo.path : "DownloadStation/info.cgi";
      const infoRes = await fetch(`${nasUrl}/webapi/${infoPath}?${infoParams}`);
      const infoJson = await infoRes.json();
      console.log("📋 SYNO.DownloadStation.Info response:", infoJson);
    } catch (infoErr) {
      console.warn("Failed to fetch Download Station info:", infoErr);
    }

    // Step 3: Use only user-set download location or fallback
    let destination;
    const { downloadLocation } = await chrome.storage.local.get(["downloadLocation"]);
    if (downloadLocation && downloadLocation.trim()) {
      destination = downloadLocation.trim();
      if (destination.length > 1 && destination.endsWith("/")) {
        destination = destination.replace(/\/+$/, "");
      }
      console.log("📁 Using user-set destination path:", destination);
    } else {
      destination = "Downloads";
      console.log("📁 Using fallback destination path: Downloads");
    }
    const taskParamsObj = {
      api: "SYNO.DownloadStation2.Task",
      version: String(taskInfo.maxVersion || taskInfo.minVersion || 2),
      method: "create",
      url: [JSON.stringify(url)],
      _sid: sid,
      type: "url",
      destination: JSON.stringify(destination) || "",
      create_list: "false",
      meta: {
        apiGroup: "DownloadStation2",
        apiSubgroup: "DownloadStation2.Task",
      }
    };
    // Convert object to x-www-form-urlencoded string
    const taskParams = Object.entries(taskParamsObj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    // Do NOT encode sid in the URL
    const taskUrl = `${nasUrl}/webapi/${taskInfo.path}`;
    // Log the request before sending
    console.log("📤 Sending download task to Synology:", {
      url: taskUrl,
      params: taskParamsObj
    });
    let taskJson, responseText;
    try {
      const taskRes = await fetch(taskUrl, {
        method: "POST",
        body: taskParams,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      responseText = await taskRes.text();
      taskJson = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse Synology response as JSON:", responseText);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/synosend_icon_48.png",
        title: "SynoSend",
        message: `❌ Task failed: Invalid response from Synology.`
      });
      return;
    }

    console.log("📬 Synology response:", taskJson);
    if (taskJson.success) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/synosend_icon_48.png",
        title: "SynoSend",
        message: "✅ Task sent successfully!"
      });
    } else {
      const errorCode = taskJson?.error?.code || "unknown";
      const errorMsg = taskJson?.error?.message || JSON.stringify(taskJson?.error) || "No error message.";
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/synosend_icon_48.png",
        title: "SynoSend",
        message: `❌ Task failed: code ${errorCode}\n${errorMsg}`
      });
      console.error("Synology error details:", taskJson?.error);
    }

  } catch (e) {
    console.error("Error during sending task:", e);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/synosend_icon_48.png",
      title: "SynoSend",
      message: "An unexpected error occurred. Check logs."
    });
  }
});