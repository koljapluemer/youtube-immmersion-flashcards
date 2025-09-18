import { PracticeStateMachine, PracticeMode, type PracticeState } from './practice-state-machine.js';
import { SubtitleExtractor } from './subtitle-extractor.js';
import { VideoController } from './video-controller.js';
import { VocabExtractor } from './vocab-extractor.js';
import { FSRSCardManager, type VocabCard } from './fsrs-card-manager.js';
import { ApiKeyManager } from './api-key-manager.js';
import type { VocabItem } from '../types/index.js';

export class PracticeController {
  private stateMachine: PracticeStateMachine | null = null;
  private subtitleExtractor: SubtitleExtractor;
  private videoController: VideoController;
  private vocabExtractor: VocabExtractor;
  private cardManager: FSRSCardManager;
  private originalVideoContainer: HTMLElement | null = null;
  private practiceContainer: HTMLElement | null = null;
  private currentVocabulary: VocabItem[] = [];
  private currentCard: VocabCard | null = null;
  private currentCardStatus: 'NEW' | 'DUE' | null = null;
  private isFlashcardRevealed: boolean = false;
  private lastPickedVocabId: string | null = null;

  constructor() {
    this.subtitleExtractor = new SubtitleExtractor();
    this.videoController = new VideoController();
    this.vocabExtractor = new VocabExtractor();
    this.cardManager = new FSRSCardManager();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize video controller and find containers
      this.videoController.initialize();
      this.originalVideoContainer = document.querySelector('#movie_player');

      if (!this.originalVideoContainer) {
        throw new Error('Could not find video container');
      }

      // Extract subtitles
      const subtitles = await this.subtitleExtractor.extractSubtitles();

      if (!subtitles || subtitles.length === 0) {
        throw new Error('No subtitles found for this video');
      }

      // Initialize state machine
      this.stateMachine = new PracticeStateMachine(subtitles, (state) => this.handleStateChange(state));

      // Start in video watching mode
      this.renderCurrentMode();

    } catch (error) {
      console.error('Failed to initialize practice controller:', error);
      throw error;
    }
  }

  private handleStateChange(state: PracticeState): void {
    console.log('State changed to:', state.mode);
    this.renderCurrentMode();
  }

  private renderCurrentMode(): void {
    if (!this.stateMachine) return;

    const state = this.stateMachine.getCurrentState();

    switch (state.mode) {
      case PracticeMode.VIDEO_WATCHING:
        this.renderVideoWatchingMode();
        break;
      case PracticeMode.FLASHCARD_PRACTICE:
        this.renderFlashcardMode(state);
        break;
      case PracticeMode.AUTOPLAY:
        this.renderAutoplayMode(state);
        break;
      case PracticeMode.EVALUATION:
        this.renderEvaluationMode(state);
        break;
    }
  }

  private renderVideoWatchingMode(): void {
    // Show normal video
    this.showOriginalVideo();

    // Add Start Practice button
    this.addStartPracticeButton();
  }

  private showOriginalVideo(): void {
    if (this.practiceContainer) {
      this.practiceContainer.remove();
      this.practiceContainer = null;
    }
    // Video is always visible now, no need to change display
  }

  private addStartPracticeButton(): void {
    // Remove existing button
    const existingButton = document.querySelector('.youtube-practice-button');
    if (existingButton) {
      existingButton.remove();
    }

    const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
    if (!videoTitle?.parentElement) return;

    const button = document.createElement('button');
    button.className = 'youtube-practice-button';
    button.textContent = 'Start Practice';
    button.style.cssText = this.getYouTubeButtonStyle();

    button.addEventListener('click', () => this.handleStartPractice());

    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.background = '#e5e5e5';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#f1f1f1';
    });

    videoTitle.parentElement.insertBefore(button, videoTitle);
  }

  private async handleStartPractice(): Promise<void> {
    if (!this.stateMachine) return;

    // Update button to loading state
    const button = document.querySelector('.youtube-practice-button') as HTMLButtonElement;
    if (button) {
      button.textContent = 'Loading...';
      button.style.cssText = this.getYouTubeButtonStyle(true);
      button.disabled = true;
    }

    try {
      // Ensure API key
      const apiKey = await ApiKeyManager.ensureOpenAIKey();
      if (!apiKey) {
        this.resetStartPracticeButton();
        return;
      }

      // Get current video time
      const currentTime = this.videoController.getCurrentTime();

      // Start practice mode
      this.stateMachine.startPractice(currentTime);

    } catch (error) {
      console.error('Error starting practice:', error);
      this.resetStartPracticeButton();
      alert('Error starting practice: ' + error.message);
    }
  }

  private resetStartPracticeButton(): void {
    const button = document.querySelector('.youtube-practice-button') as HTMLButtonElement;
    if (button) {
      button.textContent = 'Start Practice';
      button.style.cssText = this.getYouTubeButtonStyle();
      button.disabled = false;
    }
  }

  private async renderFlashcardMode(state: PracticeState): Promise<void> {
    if (!state.currentSubtitle) return;

    // Check if we moved to a new subtitle - reset vocabulary if so
    const currentSubtitleText = state.currentSubtitle.text;
    const isNewSubtitle = this.currentVocabulary.length === 0 ||
                         !this.currentVocabulary.some(v => currentSubtitleText.includes(v.original));

    // Extract vocabulary if not already done or if this is a new subtitle
    if (isNewSubtitle) {
      // Reset state for new subtitle
      this.currentVocabulary = [];
      this.lastPickedVocabId = null;
      try {
        const vocabulary = await this.vocabExtractor.extractVocabulary(state.currentSubtitle.text, 'auto');

        if (vocabulary.length === 0) {
          // Skip to autoplay if no vocabulary
          this.stateMachine!.moveToAutoplay();
          return;
        }

        this.currentVocabulary = vocabulary;
      } catch (error) {
        console.error('Error extracting vocabulary:', error);
        this.stateMachine!.moveToAutoplay();
        return;
      }
    }

    // Get next available card
    const nextCardInfo = await this.cardManager.getNextAvailableCard(this.currentVocabulary, this.lastPickedVocabId);

    if (!nextCardInfo) {
      // No more cards to show, go to autoplay
      this.stateMachine!.moveToAutoplay();
      return;
    }

    // Set current card info
    this.currentCardStatus = nextCardInfo.status;
    this.lastPickedVocabId = nextCardInfo.vocab.original;

    if (nextCardInfo.status === 'NEW') {
      // Create new card for NEW vocabulary
      this.currentCard = await this.cardManager.createAndMarkNewCard(nextCardInfo.vocab);
      this.isFlashcardRevealed = true; // NEW cards show front+back immediately
    } else if (nextCardInfo.status === 'DUE' && nextCardInfo.existingCard) {
      // Use existing card for DUE vocabulary
      this.currentCard = nextCardInfo.existingCard;
      await this.cardManager.markCardAsPicked(nextCardInfo.vocab);
      this.isFlashcardRevealed = false; // DUE cards start with reveal flow
    }

    // Replace video with flashcard UI
    this.replaceVideoWithFlashcard();
    this.addEndPracticeButton();
  }

  private replaceVideoWithFlashcard(): void {
    // Pause the video but keep it visible
    this.videoController.pause();

    if (!this.practiceContainer) {
      this.practiceContainer = document.createElement('div');
      this.practiceContainer.style.cssText = this.getBodyOverlayStyle();

      // Add overlay to body instead of video container
      document.body.appendChild(this.practiceContainer);
    }

    if (!this.currentCard) return;

    // Build content based on card status and reveal state
    const content = this.buildFlashcardContent();
    const buttons = this.buildFlashcardButtons();

    this.practiceContainer.innerHTML = `
      <button class="fullscreen-end-practice-btn" style="${this.getFullscreenEndPracticeButtonStyle()}">End Practice</button>
      <div style="${this.getFlashcardContainerStyle()}">
        <div style="${this.getFlashcardStyle()}">
          <div style="${this.getFlashcardContentStyle()}">
            ${content}
          </div>
          <div style="${this.getFlashcardButtonsStyle()}">
            ${buttons}
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    this.addFlashcardEventListeners();
  }

  private buildFlashcardContent(): string {
    if (!this.currentCard) return '';

    if (!this.isFlashcardRevealed) {
      // Show only front (for DUE cards)
      return `<div style="${this.getForeignTextStyle()}">${this.currentCard.vocab.original}</div>`;
    } else {
      // Show front+back (for NEW cards immediately, DUE cards after reveal)
      return `
        <div style="${this.getForeignTextStyle()}">${this.currentCard.vocab.original}</div>
        <hr style="${this.getDividerStyle()}">
        <div style="${this.getTranslationTextStyle()}">${this.currentCard.vocab.translation}</div>
      `;
    }
  }

  private buildFlashcardButtons(): string {
    if (this.currentCardStatus === 'NEW') {
      // NEW cards: only "I will remember" button
      return `<button class="remember-btn" style="${this.getRememberButtonStyle()}">I will remember</button>`;
    } else if (this.currentCardStatus === 'DUE') {
      if (!this.isFlashcardRevealed) {
        // DUE cards before reveal: "Reveal" button
        return `<button class="flashcard-reveal-btn" style="${this.getRevealButtonStyle()}">Reveal</button>`;
      } else {
        // DUE cards after reveal: ALL FOUR rating buttons
        return `
          <button class="flashcard-rating-btn" data-rating="1" style="${this.getRatingButtonStyle('#ef4444')}">Again</button>
          <button class="flashcard-rating-btn" data-rating="2" style="${this.getRatingButtonStyle('#f97316')}">Hard</button>
          <button class="flashcard-rating-btn" data-rating="3" style="${this.getRatingButtonStyle('#22c55e')}">Good</button>
          <button class="flashcard-rating-btn" data-rating="4" style="${this.getRatingButtonStyle('#3b82f6')}">Easy</button>
        `;
      }
    }
    return '';
  }

  private addFlashcardEventListeners(): void {
    if (!this.practiceContainer) return;

    // Remember button for NEW cards
    const rememberBtn = this.practiceContainer.querySelector('.remember-btn');
    if (rememberBtn) {
      rememberBtn.addEventListener('click', () => this.handleRememberCard());
    }

    // Reveal button for DUE cards
    const revealBtn = this.practiceContainer.querySelector('.flashcard-reveal-btn');
    if (revealBtn) {
      revealBtn.addEventListener('click', () => this.handleRevealFlashcard());
    }

    // Rating buttons for DUE cards after reveal
    const ratingBtns = this.practiceContainer.querySelectorAll('.flashcard-rating-btn');
    ratingBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rating = parseInt((e.target as HTMLElement).dataset.rating!);
        this.handleFlashcardRating(rating);
      });
    });

    // End practice button for fullscreen mode
    const endPracticeBtn = this.practiceContainer.querySelector('.fullscreen-end-practice-btn');
    if (endPracticeBtn) {
      endPracticeBtn.addEventListener('click', () => this.handleEndPractice());
    }
  }

  private handleRevealFlashcard(): void {
    this.isFlashcardRevealed = true;
    // Just re-render the current flashcard, don't get next card
    this.replaceVideoWithFlashcard();
  }

  private async handleRememberCard(): Promise<void> {
    // For NEW cards, just move to next card (card already created and persisted)
    await this.moveToNextCard();
  }

  private async handleFlashcardRating(rating: number): Promise<void> {
    if (!this.currentCard) return;

    try {
      await this.cardManager.reviewCard(this.currentCard.id, rating);
    } catch (error) {
      console.error('Error rating card:', error);
    }

    await this.moveToNextCard();
  }

  private async moveToNextCard(): Promise<void> {
    // Reset card state
    this.currentCard = null;
    this.currentCardStatus = null;
    this.isFlashcardRevealed = false;

    // Try to render next card, or move to autoplay if none left
    await this.renderFlashcardMode(this.stateMachine!.getCurrentState());
  }

  private renderAutoplayMode(state: PracticeState): void {
    if (!state.currentSubtitle) return;

    this.showOriginalVideo();
    this.addEndPracticeButton();

    // Play video segment
    this.videoController.setCurrentTime(state.videoTimestamp);
    this.videoController.playSegment(state.currentSubtitle.start, state.currentSubtitle.duration)
      .then(() => {
        this.stateMachine!.moveToEvaluation();
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private renderEvaluationMode(_state: PracticeState): void {
    this.hideOriginalVideo();
    this.addEndPracticeButton();

    if (!this.practiceContainer) {
      this.practiceContainer = document.createElement('div');
      this.practiceContainer.style.cssText = this.getBodyOverlayStyle();
      document.body.appendChild(this.practiceContainer);
    }

    this.practiceContainer.innerHTML = `
      <button class="fullscreen-end-practice-btn" style="${this.getFullscreenEndPracticeButtonStyle()}">End Practice</button>
      <div style="${this.getEvaluationContainerStyle()}">
        <div style="${this.getEvaluationFormStyle()}">
          <h3 style="${this.getEvaluationTitleStyle()}">What did you understand?</h3>
          <textarea
            class="evaluation-input"
            style="${this.getEvaluationTextareaStyle()}"
            placeholder="Enter your understanding of the subtitle segment..."
          ></textarea>
          <button class="save-next-btn" style="${this.getSaveNextButtonStyle()}">Save and Next</button>
        </div>
      </div>
    `;

    const saveBtn = this.practiceContainer.querySelector('.save-next-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveEvaluation());
    }

    // End practice button for fullscreen mode
    const endPracticeBtn = this.practiceContainer.querySelector('.fullscreen-end-practice-btn');
    if (endPracticeBtn) {
      endPracticeBtn.addEventListener('click', () => this.handleEndPractice());
    }
  }

  private handleSaveEvaluation(): void {
    const textarea = this.practiceContainer?.querySelector('.evaluation-input') as HTMLTextAreaElement;
    const evaluation = textarea?.value || '';

    this.stateMachine!.saveEvaluationAndNext(evaluation);
  }

  private hideOriginalVideo(): void {
    // Just pause the video, no need to hide it
    this.videoController.pause();
  }

  private addEndPracticeButton(): void {
    const existingButton = document.querySelector('.youtube-practice-button');
    if (existingButton) {
      existingButton.remove();
    }

    const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
    if (!videoTitle?.parentElement) return;

    const button = document.createElement('button');
    button.className = 'youtube-practice-button';
    button.textContent = 'End Practice';
    button.style.cssText = this.getYouTubeButtonStyle();

    button.addEventListener('click', () => {
      this.handleEndPractice();
    });

    videoTitle.parentElement.insertBefore(button, videoTitle);
  }

  private handleEndPractice(): void {
    if (!this.stateMachine) return;

    const currentState = this.stateMachine.getCurrentState();

    // In autoplay mode, pause the video first
    if (currentState.mode === PracticeMode.AUTOPLAY) {
      this.videoController.pause();
    }

    // Restore video to original timestamp and end practice
    this.videoController.setCurrentTime(currentState.videoTimestamp);
    this.stateMachine.endPractice();
  }

  // YouTube-consistent styles
  private getYouTubeButtonStyle(loading = false): string {
    return `
      background: ${loading ? '#f1f1f1' : '#f1f1f1'};
      color: ${loading ? '#606060' : '#030303'};
      border: 1px solid #d3d3d3;
      padding: 10px 16px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      margin-right: 8px;
      cursor: ${loading ? 'not-allowed' : 'pointer'};
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
    `;
  }

  private getBodyOverlayStyle(): string {
    return `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;
  }

  private getFlashcardContainerStyle(): string {
    return `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
    `;
  }

  private getFlashcardStyle(): string {
    return `
      background: white;
      border-radius: 8px;
      padding: 32px;
      max-width: 500px;
      width: 80%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
  }

  private getFlashcardContentStyle(): string {
    return `
      margin-bottom: 24px;
      text-align: center;
    `;
  }

  private getForeignTextStyle(): string {
    return `
      font-size: 24px;
      font-weight: 500;
      color: #030303;
      margin-bottom: 16px;
    `;
  }

  private getDividerStyle(): string {
    return `
      border: none;
      border-top: 1px solid #e5e5e5;
      margin: 16px 0;
    `;
  }

  private getTranslationTextStyle(): string {
    return `
      font-size: 18px;
      color: #606060;
      margin-top: 16px;
    `;
  }

  private getFlashcardButtonsStyle(): string {
    return `
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    `;
  }

  private getRevealButtonStyle(): string {
    return `
      background: #065fd4;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
    `;
  }

  private getRatingButtonStyle(color: string): string {
    return `
      background: ${color};
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: opacity 0.1s ease;
    `;
  }

  private getRememberButtonStyle(): string {
    return `
      background: #065fd4;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
    `;
  }

  private getProgressStyle(): string {
    return `
      color: #aaa;
      font-size: 14px;
      margin-top: 16px;
      text-align: center;
    `;
  }

  private getEvaluationContainerStyle(): string {
    return `
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
    `;
  }

  private getEvaluationFormStyle(): string {
    return `
      background: white;
      border-radius: 8px;
      padding: 32px;
      max-width: 500px;
      width: 80%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
  }

  private getEvaluationTitleStyle(): string {
    return `
      font-size: 18px;
      font-weight: 500;
      color: #030303;
      margin-bottom: 16px;
      text-align: center;
      font-family: "Roboto", "Arial", sans-serif;
    `;
  }

  private getEvaluationTextareaStyle(): string {
    return `
      width: 100%;
      min-height: 120px;
      padding: 12px;
      border: 1px solid #d3d3d3;
      border-radius: 4px;
      font-size: 14px;
      font-family: "Roboto", "Arial", sans-serif;
      resize: vertical;
      margin-bottom: 16px;
      box-sizing: border-box;
    `;
  }

  private getSaveNextButtonStyle(): string {
    return `
      background: #065fd4;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
      width: 100%;
    `;
  }

  private getFullscreenEndPracticeButtonStyle(): string {
    return `
      position: absolute;
      top: 20px;
      right: 20px;
      background: #f1f1f1;
      color: #030303;
      border: 1px solid #d3d3d3;
      padding: 10px 16px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
      z-index: 1000;
    `;
  }
}