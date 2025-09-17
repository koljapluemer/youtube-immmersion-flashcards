import { SubtitleExtractor } from './core/subtitle-extractor.js';
import { SubtitleViewer } from './ui/subtitle-viewer.js';
import { ButtonInjector } from './ui/button-injector.js';
import { ApiKeyManager } from './core/api-key-manager.js';
import type { TimedSubtitle } from './types/index.js';

class YouTubeSubtitleApp {
  private subtitleExtractor: SubtitleExtractor;
  private subtitleViewer: SubtitleViewer;
  private buttonInjector: ButtonInjector | null;

  constructor() {
    this.subtitleExtractor = new SubtitleExtractor();
    this.subtitleViewer = new SubtitleViewer();
    this.buttonInjector = null;
  }

  async start(): Promise<void> {
    console.log('[YouTube Subtitle App] Starting...');

    // Initialize button injector with click handler
    this.buttonInjector = new ButtonInjector(async () => {
      await this.handleButtonClick();
    });

    this.buttonInjector.start();
    console.log('[YouTube Subtitle App] Started successfully');
  }

  async handleButtonClick(): Promise<void> {
    try {
      // Ensure we have an OpenAI API key
      const apiKey = await ApiKeyManager.ensureOpenAIKey();
      if (!apiKey) {
        console.log('No API key provided, cancelling');
        return;
      }

      console.log('API key validated, extracting subtitles...');

      // Extract subtitles
      const subtitles = await this.subtitleExtractor.extractSubtitles();

      if (!subtitles || subtitles.length === 0) {
        alert('No subtitles found or extracted');
        return;
      }

      console.log(`Extracted ${subtitles.length} subtitle segments`);

      // Show subtitle viewer
      this.subtitleViewer.show(subtitles);

    } catch (error) {
      console.error('Error in handleButtonClick:', error);
      alert('Error: ' + error.message);
    }
  }

  stop(): void {
    if (this.buttonInjector) {
      this.buttonInjector.stop();
    }

    if (this.subtitleViewer.isActive()) {
      this.subtitleViewer.close();
    }

    console.log('[YouTube Subtitle App] Stopped');
  }

  getStatus(): { isRunning: boolean; subtitleViewerActive: boolean; progress: { current: number; total: number } } {
    return {
      isRunning: this.buttonInjector !== null,
      subtitleViewerActive: this.subtitleViewer.isActive(),
      progress: this.subtitleViewer.getProgress()
    };
  }
}

// Initialize and start the app
const app = new YouTubeSubtitleApp();
app.start();

// Expose app globally for debugging
window.youtubeSubtitleApp = app;