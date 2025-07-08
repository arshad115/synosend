const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getOrCreateKey() {
  const result = await chrome.storage.local.get("encryptionKey");
  if (result.encryptionKey) {
    const rawKey = Uint8Array.from(atob(result.encryptionKey), c => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  const key = crypto.getRandomValues(new Uint8Array(32));
  await chrome.storage.local.set({ encryptionKey: btoa(String.fromCharCode(...key)) });
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getOrCreateKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(text)
  );
  return {
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

async function decrypt(data, ivBase64) {
  const key = await getOrCreateKey();
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const encryptedData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );
  return decoder.decode(decrypted);
}

export { getOrCreateKey, encrypt, decrypt };
