const SELECTORS = {
  VIDEO_TITLE: 'h1.ytd-watch-metadata yt-formatted-string'
};

const CSS_CLASSES = {
  CUSTOM_BUTTON: 'youtube-subtitle-button'
};

const STYLES = {
  BUTTON: `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 16px;
    margin-right: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `
};

export class ButtonInjector {
  private onButtonClick: (() => Promise<void>) | null;
  private observer: MutationObserver | null;

  constructor(onButtonClick: () => Promise<void>) {
    this.onButtonClick = onButtonClick;
    this.observer = null;
  }

  start(): void {
    this.addButtonToVideo();
    this.observeChanges();
  }

  addButtonToVideo(): void {
    const videoTitle = document.querySelector(SELECTORS.VIDEO_TITLE);

    if (!videoTitle || videoTitle.parentElement.querySelector(`.${CSS_CLASSES.CUSTOM_BUTTON}`)) {
      return;
    }

    const button = this.createButton();
    videoTitle.parentElement.insertBefore(button, videoTitle);
  }

  createButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = '⚡';
    button.className = CSS_CLASSES.CUSTOM_BUTTON;
    button.style.cssText = STYLES.BUTTON;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.onButtonClick) {
        await this.onButtonClick();
      }
    });

    return button;
  }

  observeChanges(): void {
    this.observer = new MutationObserver(() => {
      this.addButtonToVideo();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  removeButton(): void {
    const button = document.querySelector(`.${CSS_CLASSES.CUSTOM_BUTTON}`);
    if (button) {
      button.remove();
    }
  }
}