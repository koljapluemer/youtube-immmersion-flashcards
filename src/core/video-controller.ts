const SELECTORS = {
  VIDEO_ELEMENT: 'video',
  VIDEO_CONTAINER: '#movie_player'
};

const TIMING = {
  VIDEO_BUFFER_TIME: 0.5
};

export class VideoController {
  private videoElement: HTMLVideoElement | null;
  private originalVideoContainer: HTMLElement | null;

  constructor() {
    this.videoElement = null;
    this.originalVideoContainer = null;
  }

  initialize(): void {
    this.videoElement = document.querySelector(SELECTORS.VIDEO_ELEMENT);
    this.originalVideoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);

    if (!this.videoElement || !this.originalVideoContainer) {
      throw new Error('Could not find video player');
    }
  }

  getVideoDimensions(): { width: number; height: number } {
    return {
      width: this.originalVideoContainer.offsetWidth,
      height: this.originalVideoContainer.offsetHeight
    };
  }

  hideVideo(): void {
    if (this.originalVideoContainer) {
      this.originalVideoContainer.style.display = 'none';
    }
  }

  showVideo(): void {
    if (this.originalVideoContainer) {
      this.originalVideoContainer.style.display = 'block';
    }
  }

  async playSegment(startTime: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.videoElement) {
        resolve();
        return;
      }

      const adjustedStartTime = Math.max(0, startTime - TIMING.VIDEO_BUFFER_TIME);
      const endTime = startTime + duration + TIMING.VIDEO_BUFFER_TIME;

      this.videoElement.currentTime = adjustedStartTime;
      this.videoElement.play();

      const stopHandler = (): void => {
        if (this.videoElement.currentTime >= endTime) {
          this.videoElement.pause();
          this.videoElement.removeEventListener('timeupdate', stopHandler);
          resolve();
        }
      };

      this.videoElement.addEventListener('timeupdate', stopHandler);
    });
  }

  pause(): void {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  getCurrentTime(): number {
    return this.videoElement ? this.videoElement.currentTime : 0;
  }

  setCurrentTime(time: number): void {
    if (this.videoElement) {
      this.videoElement.currentTime = time;
    }
  }
}