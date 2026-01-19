document.addEventListener("DOMContentLoaded", async () => {
  const statusDiv = document.getElementById("status");
  const resolutionsDiv = document.getElementById("resolutions");
  const downloadButton = document.getElementById("download");

  // Retrieve the last detected M3U8 URL from storage
  const { lastM3u8Url } = await browser.storage.local.get("lastM3u8Url");
  if (!lastM3u8Url) {
    statusDiv.textContent = "No M3U8 file detected.";
    return;
  }

  statusDiv.textContent = `Detected M3U8: ${lastM3u8Url}`;

  // Fetch the M3U8 file and parse it to get available resolutions
  try {
    const response = await fetch(lastM3u8Url);
    const m3u8Content = await response.text();
    const lines = m3u8Content.split("\n");

    // Extract resolution information from the M3U8 file
    const resolutionLines = lines.filter((line) => line.includes("RESOLUTION"));

    if (resolutionLines.length === 0) {
      resolutionsDiv.innerHTML = "<p>No resolutions found.</p>";
      return;
    }

    // Display resolutions as radio buttons
    resolutionLines.forEach((line, index) => {
      const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      if (resolutionMatch) {
        const resolution = resolutionMatch[1];
        resolutionsDiv.innerHTML += `
          <input type="radio" id="resolution${index}" name="resolution" value="${resolution}">
          <label for="resolution${index}">${resolution}</label><br>
        `;
      }
    });
  } catch (error) {
    statusDiv.textContent = `Error fetching M3U8 file: ${error.message}`;
  }

  // Handle download button click
  downloadButton.addEventListener("click", async () => {
    const selectedResolution = document.querySelector(
      'input[name="resolution"]:checked'
    );
    if (!selectedResolution) {
      alert("Please select a resolution.");
      return;
    }

    // Send a message to the background script to initiate the download
    const response = await browser.runtime.sendMessage({
      action: "downloadM3u8",
      url: lastM3u8Url,
      resolution: selectedResolution.value,
    });

    if (response.success) {
      statusDiv.textContent = `Download started for resolution: ${selectedResolution.value}`;
    } else {
      statusDiv.textContent = `Error: ${response.message}`;
    }
  });
});
