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

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    getSubtitles();
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
  const videoId = new URLSearchParams(window.location.search).get('v');
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
    await toggleUntilPoTokenSet();
  }

  const subsUrl = captionTracks[0].baseUrl + '&pot=' + poToken + '&c=WEB';
  console.log('Fetching with POT token:', subsUrl.substring(0, 100) + '...');

  const subsResponse = await fetch(subsUrl);
  const xmlText = await subsResponse.text();

  if (xmlText.length > 0) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xml.getElementsByTagName('text');
    const text = Array.from(textNodes).map(node => node.textContent).join(' ');
    alert(text.substring(0, 1000));
  } else {
    alert(`Empty response from YouTube API. Status: ${subsResponse.status}`);
  }
}

addButtonToVideo();
observeChanges();