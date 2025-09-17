class VideoController {
  constructor() {
    this.videoElement = null;
    this.originalVideoContainer = null;
  }

  initialize() {
    this.videoElement = document.querySelector(SELECTORS.VIDEO_ELEMENT);
    this.originalVideoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);

    if (!this.videoElement || !this.originalVideoContainer) {
      throw new Error('Could not find video player');
    }
  }

  getVideoDimensions() {
    return {
      width: this.originalVideoContainer.offsetWidth,
      height: this.originalVideoContainer.offsetHeight
    };
  }

  hideVideo() {
    if (this.originalVideoContainer) {
      this.originalVideoContainer.style.display = 'none';
    }
  }

  showVideo() {
    if (this.originalVideoContainer) {
      this.originalVideoContainer.style.display = 'block';
    }
  }

  async playSegment(startTime, duration) {
    return new Promise((resolve) => {
      if (!this.videoElement) {
        resolve();
        return;
      }

      const adjustedStartTime = Math.max(0, startTime - TIMING.VIDEO_BUFFER_TIME);
      const endTime = startTime + duration + TIMING.VIDEO_BUFFER_TIME;

      this.videoElement.currentTime = adjustedStartTime;
      this.videoElement.play();

      const stopHandler = () => {
        if (this.videoElement.currentTime >= endTime) {
          this.videoElement.pause();
          this.videoElement.removeEventListener('timeupdate', stopHandler);
          resolve();
        }
      };

      this.videoElement.addEventListener('timeupdate', stopHandler);
    });
  }

  pause() {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  getCurrentTime() {
    return this.videoElement ? this.videoElement.currentTime : 0;
  }

  setCurrentTime(time) {
    if (this.videoElement) {
      this.videoElement.currentTime = time;
    }
  }
}