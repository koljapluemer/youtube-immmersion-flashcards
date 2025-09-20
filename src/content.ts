import { PracticeController } from './core/practice-controller.js';

class YouTubePracticeApp {
  private practiceController: PracticeController;
  private isInitialized: boolean = false;
  private currentVideoId: string | null = null;

  constructor() {
    this.practiceController = new PracticeController();
    this.setupNavigationListeners();
  }

  async start(): Promise<void> {
    console.log('[YouTube Practice App] Starting...');

    // Set initial video ID
    this.currentVideoId = this.getVideoIdFromUrl();

    if (this.currentVideoId) {
      try {
        await this.practiceController.initialize();
        this.isInitialized = true;
        console.log('[YouTube Practice App] Started successfully for video:', this.currentVideoId);
      } catch (error) {
        console.error('[YouTube Practice App] Failed to start:', error);
      }
    } else {
      console.log('[YouTube Practice App] Not on a video page, skipping initialization');
    }
  }

  getStatus(): { isInitialized: boolean } {
    return {
      isInitialized: this.isInitialized
    };
  }

  private setupNavigationListeners(): void {
    console.log('[YouTube Practice App] Setting up navigation listeners...');

    // Listen for YouTube's navigation events
    document.addEventListener('yt-navigate-finish', () => {
      console.log('[YouTube Practice App] YouTube navigation detected');
      this.handleNavigationChange();
    });

    // Fallback: Listen for URL changes (in case YouTube events don't fire)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        console.log('[YouTube Practice App] URL change detected:', url);
        this.handleNavigationChange();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  private async handleNavigationChange(): Promise<void> {
    // Small delay to let YouTube finish loading
    await new Promise(resolve => setTimeout(resolve, 500));

    const videoId = this.getVideoIdFromUrl();

    // Only re-initialize if we're on a video page and it's a different video
    if (videoId && videoId !== this.currentVideoId) {
      console.log('[YouTube Practice App] New video detected:', videoId);
      this.practiceController.resetForNewVideo();
      this.currentVideoId = videoId;

      // Re-initialize for the new video
      try {
        await this.practiceController.initialize();
        this.isInitialized = true;
        console.log('[YouTube Practice App] Re-initialized for new video');
      } catch (error) {
        console.error('[YouTube Practice App] Failed to re-initialize:', error);
        this.isInitialized = false;

        // Retry initialization after a longer delay
        setTimeout(async () => {
          console.log('[YouTube Practice App] Retrying initialization...');
          try {
            await this.practiceController.initialize();
            this.isInitialized = true;
            console.log('[YouTube Practice App] Retry initialization successful');
          } catch (retryError) {
            console.error('[YouTube Practice App] Retry initialization also failed:', retryError);
          }
        }, 3000);
      }
    } else if (!videoId) {
      // Not on a video page, reset state
      this.currentVideoId = null;
      this.isInitialized = false;
      console.log('[YouTube Practice App] Not on video page, reset state');
    }
  }

  private getVideoIdFromUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
}

// Initialize and start the app
const app = new YouTubePracticeApp();
app.start();

// Expose app globally for debugging
(window as any).youtubePracticeApp = app;
