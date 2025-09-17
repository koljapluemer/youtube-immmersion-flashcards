let poToken = null;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = () => {
  console.log('[Content Script] injected.js loaded');
  script.remove();
};
(document.head || document.documentElement).appendChild(script);

window.addEventListener('FoundPOT', (event) => {
  poToken = event.detail;
  console.log('[Content Script] POT token found:', poToken);
});

function addButtonToVideo() {
  const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');

  if (!videoTitle || videoTitle.parentElement.querySelector('.custom-alert-button')) {
    return;
  }

  const button = document.createElement('button');
  button.textContent = '⚡';
  button.className = 'custom-alert-button';
  button.style.cssText = `
    background: #ff0000;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    margin-right: 8px;
    cursor: pointer;
    font-size: 14px;
    display: inline-block;
  `;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const apiKey = await ensureOpenAIKey();
    if (apiKey) {
      getSubtitles();
    }
  });

  videoTitle.parentElement.insertBefore(button, videoTitle);
}

function observeChanges() {
  const observer = new MutationObserver(() => {
    addButtonToVideo();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function toggleUntilPoTokenSet() {
  const captionsButton = document.querySelector('.ytp-subtitles-button');
  if (!captionsButton) return;

  while (poToken === null) {
    captionsButton.click();
    captionsButton.click();

    const startTime = Date.now();
    while (poToken === null && Date.now() - startTime < 2000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

async function getSubtitles() {
  try {
    console.log('getSubtitles called');
    console.log('Current poToken:', poToken);

    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log('Video ID:', videoId);

    const url = 'https://www.youtube.com/watch?v=' + videoId;
    const html = await fetch(url).then(resp => resp.text());
    const regex = /\{"captionTracks":(\[.*?\]),/g;
    const arr = regex.exec(html);

    if (arr == null) {
      alert('No subtitles found for this video');
      return;
    }

    const captionTracks = JSON.parse(arr[1]);
    console.log('Available tracks:', captionTracks.map(t => `${t.languageCode}: ${t.name?.simpleText || 'Unknown'}`));

    if (!poToken) {
      console.log('No POT token, attempting to get one...');
      await toggleUntilPoTokenSet();
      console.log('POT token after toggle:', poToken);
    }

    const subsUrl = captionTracks[0].baseUrl + '&pot=' + poToken + '&c=WEB';
    console.log('Fetching with POT token:', subsUrl.substring(0, 100) + '...');

  const subsResponse = await fetch(subsUrl);
  const xmlText = await subsResponse.text();

  if (xmlText.length > 0) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xml.getElementsByTagName('text');

    console.log('XML response:', xmlText.substring(0, 500));
    console.log('Number of text nodes:', textNodes.length);

    if (textNodes.length > 0) {
      console.log('First text node:', textNodes[0]);
      console.log('First text attributes:', {
        start: textNodes[0].getAttribute('start'),
        dur: textNodes[0].getAttribute('dur'),
        text: textNodes[0].textContent
      });

      const timedSubtitles = Array.from(textNodes).map(node => ({
        start: parseFloat(node.getAttribute('start') || 0),
        duration: parseFloat(node.getAttribute('dur') || 0),
        text: node.textContent
      }));

      console.log('Timed subtitles (first 5):', timedSubtitles.slice(0, 5));

      createSubtitleUI(timedSubtitles);
    } else {
      alert('No text nodes found in XML');
    }
  } else {
    alert(`Empty response from YouTube API. Status: ${subsResponse.status}`);
  }
  } catch (error) {
    console.error('Error in getSubtitles:', error);
    alert('Error: ' + error.message);
  }
}

let currentSubtitleIndex = 0;
let subtitlesArray = [];
let videoElement = null;
let originalVideoContainer = null;

async function ensureOpenAIKey() {
  // Try to get existing key from chrome storage
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(['openai_api_key'], resolve);
  });

  if (result.openai_api_key) {
    console.log('OpenAI API key found in storage');
    return result.openai_api_key;
  }

  // Prompt user for API key
  const apiKey = prompt('Please enter your OpenAI API key:');

  if (!apiKey || apiKey.trim() === '') {
    alert('OpenAI API key is required to use this feature');
    return null;
  }

  // Validate API key format (starts with sk-)
  if (!apiKey.startsWith('sk-')) {
    alert('Invalid OpenAI API key format. Keys should start with "sk-"');
    return null;
  }

  // Store the key securely in chrome storage
  await new Promise((resolve) => {
    chrome.storage.local.set({ 'openai_api_key': apiKey }, resolve);
  });

  console.log('OpenAI API key saved to storage');
  return apiKey;
}

function createSubtitleUI(timedSubtitles) {
  subtitlesArray = timedSubtitles;
  currentSubtitleIndex = 0;

  // Find video element and its container
  videoElement = document.querySelector('video');
  const videoContainer = document.querySelector('#movie_player');

  if (!videoElement || !videoContainer) {
    alert('Could not find video player');
    return;
  }

  // Store original container
  originalVideoContainer = videoContainer;

  // Create UI container with same dimensions
  const uiContainer = document.createElement('div');
  uiContainer.id = 'subtitle-ui-container';
  uiContainer.style.cssText = `
    width: ${videoContainer.offsetWidth}px;
    height: ${videoContainer.offsetHeight}px;
    background: #000;
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px;
    box-sizing: border-box;
    font-family: Arial, sans-serif;
  `;

  // Create subtitle text display
  const subtitleText = document.createElement('div');
  subtitleText.id = 'subtitle-text';
  subtitleText.style.cssText = `
    font-size: 24px;
    line-height: 1.5;
    text-align: center;
    margin-bottom: 40px;
    max-width: 80%;
  `;

  // Create next button
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next';
  nextButton.style.cssText = `
    font-size: 18px;
    padding: 12px 24px;
    background: #ff0000;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin: 20px;
  `;

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.cssText = `
    font-size: 18px;
    padding: 12px 24px;
    background: #666;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin: 20px;
  `;

  nextButton.addEventListener('click', handleNext);
  closeButton.addEventListener('click', closeSubtitleUI);

  uiContainer.appendChild(subtitleText);
  uiContainer.appendChild(nextButton);
  uiContainer.appendChild(closeButton);

  // Replace video container
  videoContainer.style.display = 'none';
  videoContainer.parentNode.insertBefore(uiContainer, videoContainer.nextSibling);

  // Show first subtitle
  updateSubtitleDisplay();
}

function updateSubtitleDisplay() {
  const subtitleText = document.getElementById('subtitle-text');
  if (currentSubtitleIndex < subtitlesArray.length) {
    const current = subtitlesArray[currentSubtitleIndex];
    subtitleText.textContent = current.text;
    console.log(`Showing subtitle ${currentSubtitleIndex + 1}/${subtitlesArray.length}:`, current);
  }
}

function handleNext() {
  if (currentSubtitleIndex < subtitlesArray.length) {
    const current = subtitlesArray[currentSubtitleIndex];

    // Show video and play segment
    const uiContainer = document.getElementById('subtitle-ui-container');
    uiContainer.style.display = 'none';
    originalVideoContainer.style.display = 'block';

    // Set video time and play
    const startTime = Math.max(0, current.start - 0.5);
    const endTime = current.start + current.duration + 0.5;

    videoElement.currentTime = startTime;
    videoElement.play();

    // Stop at end time
    const stopHandler = () => {
      if (videoElement.currentTime >= endTime) {
        videoElement.pause();
        videoElement.removeEventListener('timeupdate', stopHandler);

        // Move to next subtitle
        currentSubtitleIndex++;

        // Show UI again
        setTimeout(() => {
          originalVideoContainer.style.display = 'none';
          uiContainer.style.display = 'flex';
          updateSubtitleDisplay();
        }, 500);
      }
    };

    videoElement.addEventListener('timeupdate', stopHandler);
  }
}

function closeSubtitleUI() {
  const uiContainer = document.getElementById('subtitle-ui-container');
  if (uiContainer) {
    uiContainer.remove();
  }
  if (originalVideoContainer) {
    originalVideoContainer.style.display = 'block';
  }
}

addButtonToVideo();
observeChanges();