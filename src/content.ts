import { PracticeController } from './core/practice-controller.js';

class YouTubePracticeApp {
  private practiceController: PracticeController;
  private isInitialized: boolean = false;

  constructor() {
    this.practiceController = new PracticeController();
  }

  async start(): Promise<void> {
    console.log('[YouTube Practice App] Starting...');

    try {
      await this.practiceController.initialize();
      this.isInitialized = true;
      console.log('[YouTube Practice App] Started successfully');
    } catch (error) {
      console.error('[YouTube Practice App] Failed to start:', error);
    }
  }

  getStatus(): { isInitialized: boolean } {
    return {
      isInitialized: this.isInitialized
    };
  }
}

// Initialize and start the app
const app = new YouTubePracticeApp();
app.start();

// Expose app globally for debugging
(window as any).youtubePracticeApp = app;