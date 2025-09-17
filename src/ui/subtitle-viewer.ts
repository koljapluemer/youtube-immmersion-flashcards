import { VideoController } from '../core/video-controller.js';
import { FlashcardViewer } from './flashcard-viewer.js';
import { ReflectionScreen } from './reflection-screen.js';
import type { TimedSubtitle } from '../types/index.js';

const CSS_CLASSES = {
  SUBTITLE_UI_CONTAINER: 'subtitle-ui-container',
  SUBTITLE_TEXT: 'subtitle-text'
};

const STYLES = {
  UI_CONTAINER: `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `,
  SUBTITLE_TEXT: `
    color: white;
    font-size: 24px;
    text-align: center;
    margin: 20px;
    max-width: 80%;
    line-height: 1.5;
  `,
  CONTROL_BUTTON: `
    margin: 10px;
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.2s;
  `,
  NEXT_BUTTON: `
    background: #4CAF50;
    color: white;
  `,
  CLOSE_BUTTON: `
    background: #f44336;
    color: white;
  `
};


export class SubtitleViewer {
  private currentSubtitleIndex: number;
  private subtitlesArray: TimedSubtitle[];
  private videoController: VideoController;
  private flashcardViewer: FlashcardViewer;
  private reflectionScreen: ReflectionScreen;
  private uiContainer: HTMLElement | null;

  constructor() {
    this.currentSubtitleIndex = 0;
    this.subtitlesArray = [];
    this.videoController = new VideoController();
    this.flashcardViewer = new FlashcardViewer();
    this.reflectionScreen = new ReflectionScreen();
    this.uiContainer = null;
  }

  show(timedSubtitles: TimedSubtitle[]): void {
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

  createUI(): void {
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
    const nextButton = this.createButton('Study Vocabulary', STYLES.CONTROL_BUTTON + STYLES.NEXT_BUTTON, () => this.handleNext());
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

  createButton(text: string, styles: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = styles;
    button.addEventListener('click', onClick);
    return button;
  }

  updateSubtitleDisplay(): void {
    const subtitleText = document.getElementById(CSS_CLASSES.SUBTITLE_TEXT);

    if (this.currentSubtitleIndex < this.subtitlesArray.length) {
      const current = this.subtitlesArray[this.currentSubtitleIndex];
      subtitleText.textContent = current.text;
      console.log(`Showing subtitle ${this.currentSubtitleIndex + 1}/${this.subtitlesArray.length}:`, current);
    } else {
      subtitleText.textContent = 'All subtitles completed!';
    }
  }

  async handleNext(): Promise<void> {
    if (this.currentSubtitleIndex >= this.subtitlesArray.length) {
      return;
    }

    const current = this.subtitlesArray[this.currentSubtitleIndex];

    // Hide subtitle viewer
    if (this.uiContainer) {
      this.uiContainer.style.display = 'none';
    }

    // Show flashcards for current subtitle
    await this.flashcardViewer.showFlashcards(current, () => {
      this.continueAfterFlashcards(current);
    });
  }

  private async continueAfterFlashcards(current: TimedSubtitle): Promise<void> {
    // Show video and play segment
    this.videoController.showVideo();
    await this.videoController.playSegment(current.start, current.duration);

    // Show reflection screen
    const progress = {
      current: this.currentSubtitleIndex + 1,
      total: this.subtitlesArray.length
    };

    this.reflectionScreen.show(
      current,
      progress,
      () => this.continueToNextSubtitle(), // Continue to next subtitle
      () => this.close() // Finish session
    );
  }

  private continueToNextSubtitle(): void {
    // Move to next subtitle
    this.currentSubtitleIndex++;

    // Show subtitle viewer again
    this.videoController.hideVideo();
    if (this.uiContainer) {
      this.uiContainer.style.display = 'flex';
    }
    this.updateSubtitleDisplay();
  }

  close(): void {
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }
    if (this.flashcardViewer.isActive()) {
      this.flashcardViewer.close();
    }
    if (this.reflectionScreen.isActive()) {
      this.reflectionScreen.close();
    }
    this.videoController.showVideo();
  }

  isActive(): boolean {
    return this.uiContainer !== null && document.contains(this.uiContainer);
  }

  getCurrentSubtitle(): TimedSubtitle | null {
    if (this.currentSubtitleIndex < this.subtitlesArray.length) {
      return this.subtitlesArray[this.currentSubtitleIndex];
    }
    return null;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.currentSubtitleIndex,
      total: this.subtitlesArray.length,
      percentage: this.subtitlesArray.length > 0 ? (this.currentSubtitleIndex / this.subtitlesArray.length) * 100 : 0
    };
  }
}