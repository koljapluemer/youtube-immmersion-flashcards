class ButtonInjector {
  constructor(onButtonClick) {
    this.onButtonClick = onButtonClick;
    this.observer = null;
  }

  start() {
    this.addButtonToVideo();
    this.observeChanges();
  }

  addButtonToVideo() {
    const videoTitle = document.querySelector(SELECTORS.VIDEO_TITLE);

    if (!videoTitle || videoTitle.parentElement.querySelector(`.${CSS_CLASSES.CUSTOM_BUTTON}`)) {
      return;
    }

    const button = this.createButton();
    videoTitle.parentElement.insertBefore(button, videoTitle);
  }

  createButton() {
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

  observeChanges() {
    this.observer = new MutationObserver(() => {
      this.addButtonToVideo();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  removeButton() {
    const button = document.querySelector(`.${CSS_CLASSES.CUSTOM_BUTTON}`);
    if (button) {
      button.remove();
    }
  }
}