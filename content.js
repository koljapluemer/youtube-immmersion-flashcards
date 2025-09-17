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

      const text = timedSubtitles.map(sub => sub.text).join(' ');
      alert(`Found ${timedSubtitles.length} subtitle entries with timestamps\n\n${text.substring(0, 500)}`);
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

addButtonToVideo();
observeChanges();