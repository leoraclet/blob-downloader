browser.runtime.onInstalled.addListener(initBadge);
browser.runtime.onStartup.addListener(initBadge);

function initBadge() {
  browser.action.setBadgeText({ text: "" });
}

const foundLinks = new Set();

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    if (
      url.includes(".m3u8") &&
      !url.includes("chunks") &&
      !url.includes(".ico") &&
      !url.includes(".wasm") &&
      !url.includes(".js") &&
      !url.includes(".css") &&
      !url.includes(".ts") &&
      !foundLinks.has(url)
    ) {
      foundLinks.add(url);

      browser.action.setBadgeText({ text: "New", tabId: details.tabId });
      browser.action.setBadgeBackgroundColor({
        color: "#0f0",
        tabId: details.tabId,
      });

      // Show a notification when an M3U8 file is detected
      if (url.endsWith(".m3u8")) {
        browser.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "M3U8-URL detected",
          message: `A new .m3u8 Link was detected: ${url}`,
        });
        // Store the URL for later use in the popup
        browser.storage.local.set({ lastM3u8Url: url });
      }
    }
  },
  { urls: ["<all_urls>"] },
  []
);

// Handle notification button clicks
browser.notifications.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
      // Open the extension popup when the "Download" button is clicked
      browser.browserAction.openPopup();
    }
  }
);

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "downloadM3u8") {
    // Logic to handle the download (e.g., call Python script or use browser.downloads API)
    console.log(
      `Downloading M3U8 file: ${request.url} with resolution: ${request.resolution}`
    );

    // Example: Use browser.downloads API to download the file
    browser.downloads.download({
      url: request.url,
      filename: `stream_${request.resolution}.m3u8`,
      saveAs: true,
    });

    sendResponse({ success: true, message: "Download started." });
  }
  return true; // Required for async sendResponse
});
