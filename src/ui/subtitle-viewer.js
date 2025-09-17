class SubtitleViewer {
  constructor() {
    this.currentSubtitleIndex = 0;
    this.subtitlesArray = [];
    this.videoController = new VideoController();
    this.uiContainer = null;
  }

  show(timedSubtitles) {
    this.subtitlesArray = timedSubtitles;
    this.currentSubtitleIndex = 0;

    try {
      this.videoController.initialize();
      this.createUI();
      this.updateSubtitleDisplay();
    } catch (error) {
      alert('Could not initialize subtitle viewer: ' + error.message);
    }
  }

  createUI() {
    const dimensions = this.videoController.getVideoDimensions();

    // Create UI container with same dimensions as video
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = CSS_CLASSES.SUBTITLE_UI_CONTAINER;
    this.uiContainer.style.cssText = STYLES.UI_CONTAINER + `
      width: ${dimensions.width}px;
      height: ${dimensions.height}px;
    `;

    // Create subtitle text display
    const subtitleText = document.createElement('div');
    subtitleText.id = CSS_CLASSES.SUBTITLE_TEXT;
    subtitleText.style.cssText = STYLES.SUBTITLE_TEXT;

    // Create control buttons
    const nextButton = this.createButton('Next', STYLES.CONTROL_BUTTON + STYLES.NEXT_BUTTON, () => this.handleNext());
    const closeButton = this.createButton('Close', STYLES.CONTROL_BUTTON + STYLES.CLOSE_BUTTON, () => this.close());

    this.uiContainer.appendChild(subtitleText);
    this.uiContainer.appendChild(nextButton);
    this.uiContainer.appendChild(closeButton);

    // Replace video container
    this.videoController.hideVideo();
    this.videoController.originalVideoContainer.parentNode.insertBefore(
      this.uiContainer,
      this.videoController.originalVideoContainer.nextSibling
    );
  }

  createButton(text, styles, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = styles;
    button.addEventListener('click', onClick);
    return button;
  }

  updateSubtitleDisplay() {
    const subtitleText = document.getElementById(CSS_CLASSES.SUBTITLE_TEXT);

    if (this.currentSubtitleIndex < this.subtitlesArray.length) {
      const current = this.subtitlesArray[this.currentSubtitleIndex];
      subtitleText.textContent = current.text;
      console.log(`Showing subtitle ${this.currentSubtitleIndex + 1}/${this.subtitlesArray.length}:`, current);
    } else {
      subtitleText.textContent = 'All subtitles completed!';
    }
  }

  async handleNext() {
    if (this.currentSubtitleIndex >= this.subtitlesArray.length) {
      return;
    }

    const current = this.subtitlesArray[this.currentSubtitleIndex];

    // Hide UI and show video
    this.uiContainer.style.display = 'none';
    this.videoController.showVideo();

    // Play video segment
    await this.videoController.playSegment(current.start, current.duration);

    // Move to next subtitle
    this.currentSubtitleIndex++;

    // Show UI again after delay
    setTimeout(() => {
      this.videoController.hideVideo();
      this.uiContainer.style.display = 'flex';
      this.updateSubtitleDisplay();
    }, TIMING.UI_TRANSITION_DELAY);
  }

  close() {
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }
    this.videoController.showVideo();
  }

  isActive() {
    return this.uiContainer !== null && document.contains(this.uiContainer);
  }

  getCurrentSubtitle() {
    if (this.currentSubtitleIndex < this.subtitlesArray.length) {
      return this.subtitlesArray[this.currentSubtitleIndex];
    }
    return null;
  }

  getProgress() {
    return {
      current: this.currentSubtitleIndex,
      total: this.subtitlesArray.length,
      percentage: this.subtitlesArray.length > 0 ? (this.currentSubtitleIndex / this.subtitlesArray.length) * 100 : 0
    };
  }
}