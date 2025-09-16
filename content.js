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
    alert('Button clicked on YouTube video!');
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

addButtonToVideo();
observeChanges();