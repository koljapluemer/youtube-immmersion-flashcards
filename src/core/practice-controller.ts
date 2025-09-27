import { PracticeStateMachine, PracticeMode, type PracticeState } from './practice-state-machine.js';
import { SubtitleExtractor } from './subtitle-extractor.js';
import { VideoController } from './video-controller.js';
import { VocabExtractor } from './vocab-extractor.js';
import { FSRSCardManager } from './fsrs-card-manager.js';
import { ApiKeyManager } from './api-key-manager.js';
import { waitForElement } from '../utils/dom-utils.js';
import { YouTubeHelpers } from '../utils/youtube-helpers.js';
import browser from 'webextension-polyfill';
import type { VocabItem, CaptionTrack } from '../types/index.js';

const SUBTITLE_SELECTION_CANCELLED = 'USER_CANCELLED_SUBTITLE_SELECTION';

export class PracticeController {
  private stateMachine: PracticeStateMachine | null = null;
  private subtitleExtractor: SubtitleExtractor;
  private videoController: VideoController;
  private vocabExtractor: VocabExtractor;
  private cardManager: FSRSCardManager;
  private originalVideoContainer: HTMLElement | null = null;
  private practiceContainer: HTMLElement | null = null;
  private currentVocab: VocabItem | null = null;
  private currentVocabStatus: 'NEW' | 'DUE' | null = null;
  private isFlashcardRevealed: boolean = false;
  private lastPickedVocabOriginal: string | null = null;
  private practiceEnded: boolean = false;
  private preservedEvaluationText: string = '';
  private currentVideoId: string | null = null;
  private currentSegmentIndex: number | null = null;
  private subtitleSelectionOverlay: HTMLDivElement | null = null;

  constructor() {
    this.subtitleExtractor = new SubtitleExtractor();
    this.videoController = new VideoController();
    this.vocabExtractor = new VocabExtractor();
    this.cardManager = new FSRSCardManager();
  }

  public resetForNewVideo(): void {
    // Clear any lingering UI or state tied to the previous video
    this.resetAllState();
    this.stateMachine = null;
    this.practiceEnded = false;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize video controller and find containers
      this.videoController.initialize();
      this.originalVideoContainer = document.querySelector('#movie_player');

      if (!this.originalVideoContainer) {
        throw new Error('Could not find video container');
      }

      // Always show button first, regardless of subtitle availability
      await this.renderCurrentMode();

      console.log('[Practice Controller] Initialization completed, button should now be visible');

    } catch (error) {
      console.error('Failed to initialize practice controller:', error);
      throw error;
    }
  }

  private async handleStateChange(state: PracticeState): Promise<void> {
    console.log('State changed to:', state.mode);
    await this.renderCurrentMode();
  }

  private async renderCurrentMode(): Promise<void> {
    if (!this.stateMachine) {
      // No state machine yet - show button for video watching mode
      await this.renderVideoWatchingMode();
      return;
    }

    const state = this.stateMachine.getCurrentState();

    switch (state.mode) {
      case PracticeMode.VIDEO_WATCHING:
        await this.renderVideoWatchingMode();
        break;
      case PracticeMode.FLASHCARD_PRACTICE:
        await this.renderFlashcardMode(state);
        break;
      case PracticeMode.AUTOPLAY:
        this.renderAutoplayMode(state);
        break;
      case PracticeMode.EVALUATION:
        this.renderEvaluationMode(state);
        break;
    }
  }

  private async renderVideoWatchingMode(): Promise<void> {
    // Show normal video
    this.showOriginalVideo();

    // Add Start Practice button
    await this.addStartPracticeButton();
  }

  private showOriginalVideo(): void {
    if (this.practiceContainer) {
      this.practiceContainer.remove();
      this.practiceContainer = null;
    }
    // Video is always visible now, no need to change display
  }

  private async addStartPracticeButton(): Promise<void> {
    try {
      // Early return if button already exists in correct location
      const existingButton = document.querySelector('.youtube-practice-button');
      if (existingButton) {
        const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
        if (videoTitle?.parentElement?.contains(existingButton)) {
          return; // Button already properly placed
        }
        existingButton.remove();
      }

      console.log('[Practice Controller] Waiting for video title element...');

      // Wait for video title element to be available
      const videoTitle = await waitForElement('h1.ytd-watch-metadata yt-formatted-string', {
        timeout: 10000 // 10 seconds timeout
      });

      if (!videoTitle.parentElement) {
        throw new Error('Video title element has no parent');
      }

      console.log('[Practice Controller] Video title found, adding button...');

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
      console.log('[Practice Controller] Start Practice button added successfully');

    } catch (error) {
      console.error('[Practice Controller] Failed to add Start Practice button:', error);
    }
  }

  private async handleStartPractice(): Promise<void> {
    // Reset cancellation flag for new practice session
    this.practiceEnded = false;

    // Update button to loading state
    const button = document.querySelector('.youtube-practice-button') as HTMLButtonElement;
    if (button) {
      button.textContent = 'Loading...';
      button.style.cssText = this.getYouTubeButtonStyle(true);
      button.disabled = true;
    }

    try {
      // Ensure API key first
      const apiKey = await ApiKeyManager.ensureOpenAIKey();
      if (!apiKey) {
        this.resetStartPracticeButton();
        return;
      }

      // Load subtitles on-demand if not already loaded
      if (!this.stateMachine) {
        console.log('[Practice Controller] Loading subtitles...');

        const videoId = YouTubeHelpers.getVideoId();
        if (!videoId) {
          throw new Error('Could not determine current video ID');
        }

        const { captionTracks, defaultAudioLanguage } = await this.subtitleExtractor.getCaptionMetadata(videoId);
        const selectedTrack = await this.chooseSubtitleTrack(videoId, captionTracks, defaultAudioLanguage);
        const subtitles = await this.subtitleExtractor.fetchSubtitlesForTrack(selectedTrack);

        if (!subtitles || subtitles.length === 0) {
          throw new Error('No subtitles found for this video. Please make sure the video has subtitles enabled.');
        }

        // Initialize state machine with loaded subtitles
        this.stateMachine = new PracticeStateMachine(subtitles, (state) => this.handleStateChange(state));
        console.log('[Practice Controller] Subtitles loaded successfully');
      }

      // Get current video time
      const currentTime = this.videoController.getCurrentTime();

      // Start practice mode
      this.stateMachine.startPractice(currentTime);

    } catch (error) {
      this.removeSubtitleSelectionOverlay();

      if ((error as Error).message === SUBTITLE_SELECTION_CANCELLED) {
        console.log('[Practice Controller] Subtitle selection cancelled by user');
        this.resetStartPracticeButton();
        return;
      }

      console.error('Error starting practice:', error);
      this.resetStartPracticeButton();

      // Show user-friendly error message
      const errorMessage = (error as Error).message || 'Unknown error occurred';
      alert(`Unable to start practice:\n\n${errorMessage}\n\nPlease ensure:\n- The video has subtitles available\n- You have a stable internet connection\n- The video is fully loaded`);
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

  private async chooseSubtitleTrack(
    videoId: string,
    captionTracks: CaptionTrack[],
    defaultAudioLanguage: string | null
  ): Promise<CaptionTrack> {
    const storedKey = await this.getStoredSubtitlePreference(videoId);

    if (storedKey) {
      const storedTrack = captionTracks.find((track) => this.getSubtitleTrackKey(track) === storedKey);
      if (storedTrack) {
        console.log('[Practice Controller] Using stored subtitle preference:', storedKey);
        return storedTrack;
      }

      await this.clearSubtitlePreference(videoId);
    }

    if (captionTracks.length === 1) {
      console.log('[Practice Controller] Only one subtitle track available');
      const soleTrack = captionTracks[0];
      await this.saveSubtitlePreference(videoId, this.getSubtitleTrackKey(soleTrack));
      return soleTrack;
    }

    const autoSelected = this.subtitleExtractor.selectBestCaptionTrack(captionTracks, defaultAudioLanguage);
    return await this.promptForSubtitleTrack(videoId, captionTracks, autoSelected);
  }

  private promptForSubtitleTrack(
    videoId: string,
    captionTracks: CaptionTrack[],
    preselectedTrack: CaptionTrack
  ): Promise<CaptionTrack> {
    return new Promise((resolve, reject) => {
      this.removeSubtitleSelectionOverlay();

      const overlay = document.createElement('div');
      overlay.style.cssText = this.getSubtitleOverlayStyle();

      const dialog = document.createElement('div');
      dialog.style.cssText = this.getSubtitleDialogStyle();
      overlay.appendChild(dialog);

      const title = document.createElement('h3');
      title.textContent = 'Select subtitles';
      title.style.cssText = 'margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #030303;';
      dialog.appendChild(title);

      const description = document.createElement('p');
      description.textContent = 'Choose which subtitle track you want to practice with.';
      description.style.cssText = 'margin: 0 0 16px; color: #606060; font-size: 14px; line-height: 1.5;';
      dialog.appendChild(description);

      const optionsContainer = document.createElement('div');
      optionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; margin-bottom: 16px;';
      dialog.appendChild(optionsContainer);

      const preselectedKey = this.getSubtitleTrackKey(preselectedTrack);

      captionTracks.forEach((track, index) => {
        const optionKey = this.getSubtitleTrackKey(track);
        const optionId = `subtitle-option-${index}`;

        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid #d9d9d9; border-radius: 8px; cursor: pointer; background: #fff;';
        label.setAttribute('for', optionId);

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'subtitle-track';
        input.value = optionKey;
        input.id = optionId;
        input.checked = optionKey === preselectedKey;
        input.style.cssText = 'margin-top: 4px;';

        const info = document.createElement('div');
        info.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

        const mainLabel = document.createElement('span');
        mainLabel.textContent = this.getSubtitleTrackLabel(track);
        mainLabel.style.cssText = 'font-size: 14px; font-weight: 500; color: #030303;';

        const secondaryLabel = document.createElement('span');
        secondaryLabel.textContent = this.getSubtitleTrackDetails(track);
        secondaryLabel.style.cssText = 'font-size: 12px; color: #606060;';

        info.appendChild(mainLabel);
        if (secondaryLabel.textContent) {
          info.appendChild(secondaryLabel);
        }

        label.appendChild(input);
        label.appendChild(info);
        optionsContainer.appendChild(label);
      });

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';
      dialog.appendChild(buttonRow);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = this.getSubtitleDialogButtonStyle(false);
      buttonRow.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Use subtitles';
      confirmBtn.style.cssText = this.getSubtitleDialogButtonStyle(true);
      buttonRow.appendChild(confirmBtn);

      const cleanup = (): void => {
        this.removeSubtitleSelectionOverlay();
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        reject(new Error(SUBTITLE_SELECTION_CANCELLED));
      });

      confirmBtn.addEventListener('click', async () => {
        const selected = dialog.querySelector('input[name="subtitle-track"]:checked') as HTMLInputElement | null;
        if (!selected) {
          alert('Please select a subtitle track to continue.');
          return;
        }

        const chosen = captionTracks.find((track) => this.getSubtitleTrackKey(track) === selected.value) || captionTracks[0];

        try {
          await this.saveSubtitlePreference(videoId, this.getSubtitleTrackKey(chosen));
        } catch (storageError) {
          console.error('[Practice Controller] Failed to save subtitle preference:', storageError);
        }

        cleanup();
        resolve(chosen);
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup();
          reject(new Error(SUBTITLE_SELECTION_CANCELLED));
        }
      });

      document.body.appendChild(overlay);
      this.subtitleSelectionOverlay = overlay;
    });
  }

  private getSubtitleTrackLabel(track: CaptionTrack): string {
    const name = track.name?.simpleText?.trim();
    if (name && name.length > 0) {
      return name;
    }

    return track.languageCode || 'Unknown language';
  }

  private getSubtitleTrackDetails(track: CaptionTrack): string {
    const parts: string[] = [];

    if (track.languageCode) {
      parts.push(track.languageCode);
    }

    if (track.kind === 'asr') {
      parts.push('Auto-generated');
    }

    if (track.vssId) {
      parts.push(`ID: ${track.vssId}`);
    }

    return parts.join(' • ');
  }

  private getSubtitleTrackKey(track: CaptionTrack): string {
    return track.vssId || track.languageCode || 'default';
  }

  private async getStoredSubtitlePreference(videoId: string): Promise<string | null> {
    const key = this.getSubtitlePreferenceKey(videoId);
    const result = await browser.storage.local.get([key]);
    return typeof result[key] === 'string' ? (result[key] as string) : null;
  }

  private async saveSubtitlePreference(videoId: string, trackKey: string): Promise<void> {
    const key = this.getSubtitlePreferenceKey(videoId);
    await browser.storage.local.set({ [key]: trackKey });
  }

  private async clearSubtitlePreference(videoId: string): Promise<void> {
    const key = this.getSubtitlePreferenceKey(videoId);
    await browser.storage.local.remove([key]);
  }

  private getSubtitlePreferenceKey(videoId: string): string {
    return `subtitle_pref_${videoId}`;
  }

  private removeSubtitleSelectionOverlay(): void {
    if (this.subtitleSelectionOverlay) {
      this.subtitleSelectionOverlay.remove();
      this.subtitleSelectionOverlay = null;
    }
  }

  private getSubtitleOverlayStyle(): string {
    return `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
      padding: 16px;
    `;
  }

  private getSubtitleDialogStyle(): string {
    return `
      background: #ffffff;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
      width: min(420px, 90vw);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    `;
  }

  private getSubtitleDialogButtonStyle(isPrimary: boolean): string {
    if (isPrimary) {
      return `
        background: #065fd4;
        color: #ffffff;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      `;
    }

    return `
      background: transparent;
      color: #065fd4;
      border: none;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
  }

  private async renderFlashcardMode(state: PracticeState): Promise<void> {
    if (this.practiceEnded) return; // Prevent UI creation after practice ended
    if (!state.currentSubtitle) return;

    // Get video ID for segment operations
    const videoId = YouTubeHelpers.getVideoId();
    if (!videoId) {
      console.error('Could not get video ID');
      this.stateMachine!.moveToAutoplay();
      return;
    }

    // Check if we moved to a new segment
    const isNewSegment = this.currentVideoId !== videoId || this.currentSegmentIndex !== state.currentSubtitleIndex;

    if (isNewSegment) {
      // Reset state for new segment
      this.currentVideoId = videoId;
      this.currentSegmentIndex = state.currentSubtitleIndex;
      this.lastPickedVocabOriginal = null;
      
      try {
        // Ensure vocabulary exists for this segment (extract if needed)
        await this.ensureSegmentVocabularyExists(videoId, state.currentSubtitleIndex, state.currentSubtitle.text);
        
        // Check if segment has any vocabulary at all
        const hasVocab = await this.cardManager.hasAvailableVocabInSegment(videoId, state.currentSubtitleIndex);
        if (!hasVocab) {
          this.showNothingToPracticeScreen();
          return;
        }
      } catch (error) {
        console.error('Error ensuring segment vocabulary:', error as Error);
        this.stateMachine!.moveToAutoplay();
        return;
      }
    }

    // Get next available vocabulary from storage
    const nextVocab = await this.cardManager.getNextAvailableVocabForSegment(
      videoId, 
      state.currentSubtitleIndex, 
      this.lastPickedVocabOriginal || undefined
    );

    if (!nextVocab) {
      // No more vocabulary to show, show "nothing to practice" screen
      this.showNothingToPracticeScreen();
      return;
    }

    // Set current vocabulary info
    const cardStatus = await this.cardManager.getCardStatus(nextVocab);
    this.currentVocabStatus = cardStatus === 'NOT_DUE' ? null : cardStatus;
    this.lastPickedVocabOriginal = nextVocab.original;

    if (this.currentVocabStatus === 'NEW') {
      // Create new FSRS card for NEW vocabulary
      this.currentVocab = await this.cardManager.createCard(nextVocab);
      this.isFlashcardRevealed = true; // NEW cards show front+back immediately
    } else if (this.currentVocabStatus === 'DUE') {
      // Get fresh vocabulary with FSRS data from global cache for DUE cards
      const freshVocab = await this.cardManager.getFreshVocabWithFSRSData(nextVocab.original);
      if (!freshVocab) {
        console.error(`Could not find fresh vocab data for DUE card: ${nextVocab.original}`);
        await this.moveToNextCard();
        return;
      }
      this.currentVocab = await this.cardManager.markVocabAsPicked(freshVocab);
      this.isFlashcardRevealed = false; // DUE cards start with reveal flow
    }

    // Replace video with flashcard UI
    this.replaceVideoWithFlashcard();
    this.addEndPracticeButton();
  }

  /**
   * Ensure vocabulary exists for segment (extract if needed)
   */
  private async ensureSegmentVocabularyExists(videoId: string, segmentIndex: number, subtitleText: string): Promise<void> {
    // Check if vocabulary already exists for this segment
    const existingVocab = await this.cardManager.cacheManager.getSegmentVocabulary(videoId, segmentIndex);
    
    if (!existingVocab || existingVocab.length === 0) {
      // Extract vocabulary using existing extraction logic
      await this.vocabExtractor.extractVocabulary(subtitleText, 'auto', videoId, segmentIndex);
    }
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

    if (!this.currentVocab) return;

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
    if (!this.currentVocab) return '';

    if (!this.isFlashcardRevealed) {
      // Show only front (for DUE cards)
      return `<div style="${this.getForeignTextStyle()}">${this.currentVocab.original}</div>`;
    } else {
      // Show front+back (for NEW cards immediately, DUE cards after reveal)
      const translations = this.currentVocab.translations.join(', ');
      return `
        <div style="${this.getForeignTextStyle()}">${this.currentVocab.original}</div>
        <hr style="${this.getDividerStyle()}">
        <div style="${this.getTranslationTextStyle()}">${translations}</div>
      `;
    }
  }

  private buildFlashcardButtons(): string {
    if (this.currentVocabStatus === 'NEW') {
      // NEW cards: only "I will remember" button
      return `<button class="remember-btn" style="${this.getRememberButtonStyle()}">I will remember</button>`;
    } else if (this.currentVocabStatus === 'DUE') {
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
    if (this.practiceEnded) return; // Prevent action after practice ended

    // For NEW cards, just move to next card (card already created and persisted)
    await this.moveToNextCard();
  }

  private async handleFlashcardRating(rating: number): Promise<void> {
    if (this.practiceEnded) return; // Prevent action after practice ended
    if (!this.currentVocab) return;

    try {
      await this.cardManager.reviewCard(this.currentVocab, rating);
    } catch (error) {
      console.error('Error rating card:', error);
    }

    await this.moveToNextCard();
  }

  private async moveToNextCard(): Promise<void> {
    if (this.practiceEnded) return; // Prevent action after practice ended

    // Reset vocabulary state
    this.currentVocab = null;
    this.currentVocabStatus = null;
    this.isFlashcardRevealed = false;

    // Try to render next card, or show "nothing to practice" if none left
    await this.renderFlashcardMode(this.stateMachine!.getCurrentState());
  }

  private showNothingToPracticeScreen(): void {
    // Pause the video but keep it visible
    this.videoController.pause();

    if (!this.practiceContainer) {
      this.practiceContainer = document.createElement('div');
      this.practiceContainer.style.cssText = this.getBodyOverlayStyle();
      document.body.appendChild(this.practiceContainer);
    }

    this.practiceContainer.innerHTML = `
      <button class="fullscreen-end-practice-btn" style="${this.getFullscreenEndPracticeButtonStyle()}">End Practice</button>
      <div style="${this.getFlashcardContainerStyle()}">
        <div style="${this.getFlashcardStyle()}">
          <div style="${this.getFlashcardContentStyle()}">
            <div style="${this.getForeignTextStyle()}">Nothing more to practice</div>
            <div style="${this.getTranslationTextStyle()}">You've completed all available vocabulary for this segment!</div>
          </div>
          <div style="${this.getFlashcardButtonsStyle()}">
            <button class="watch-segment-btn" style="${this.getRevealButtonStyle()}">Watch Segment</button>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    const watchSegmentBtn = this.practiceContainer.querySelector('.watch-segment-btn');
    if (watchSegmentBtn) {
      watchSegmentBtn.addEventListener('click', () => {
        if (this.practiceEnded) return;
        this.stateMachine!.moveToAutoplay();
      });
    }

    // End practice button for fullscreen mode
    const endPracticeBtn = this.practiceContainer.querySelector('.fullscreen-end-practice-btn');
    if (endPracticeBtn) {
      endPracticeBtn.addEventListener('click', () => this.handleEndPractice());
    }
  }

  private renderAutoplayMode(state: PracticeState): void {
    if (!state.currentSubtitle) return;

    this.showOriginalVideo();
    this.addEndPracticeButton();

    // Play video segment
    this.videoController.setCurrentTime(state.videoTimestamp);
    this.videoController.playSegment(state.currentSubtitle.start, state.currentSubtitle.duration)
      .then(() => {
        // Check if we were rewatching
        if (state.isRewatching) {
          // Clear rewatch flag and return to evaluation
          state.isRewatching = false;
        }
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
          <div style="${this.getEvaluationButtonsStyle()}">
            <button class="rewatch-segment-btn" style="${this.getRewatchSegmentButtonStyle()}">Rewatch Segment</button>
            <button class="save-next-btn" style="${this.getSaveNextButtonStyle()}">Save and Next</button>
          </div>
        </div>
      </div>
    `;

    // Restore preserved evaluation text if available
    const textarea = this.practiceContainer.querySelector('.evaluation-input') as HTMLTextAreaElement;
    if (textarea && this.preservedEvaluationText) {
      textarea.value = this.preservedEvaluationText;
      this.preservedEvaluationText = ''; // Clear after restoring
    }

    const saveBtn = this.practiceContainer.querySelector('.save-next-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveEvaluation());
    }

    const rewatchBtn = this.practiceContainer.querySelector('.rewatch-segment-btn');
    if (rewatchBtn) {
      rewatchBtn.addEventListener('click', () => this.handleRewatchSegment());
    }

    // End practice button for fullscreen mode
    const endPracticeBtn = this.practiceContainer.querySelector('.fullscreen-end-practice-btn');
    if (endPracticeBtn) {
      endPracticeBtn.addEventListener('click', () => this.handleEndPractice());
    }
  }

  private async handleSaveEvaluation(): Promise<void> {
    if (this.practiceEnded) return; // Prevent action after practice ended

    const saveBtn = this.practiceContainer?.querySelector('.save-next-btn') as HTMLButtonElement;
    const textarea = this.practiceContainer?.querySelector('.evaluation-input') as HTMLTextAreaElement;
    const evaluation = textarea?.value || '';

    // Show loading state
    if (saveBtn) {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Loading...';
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.6';
      saveBtn.style.cursor = 'not-allowed';

      try {
        await this.stateMachine!.saveEvaluationAndNext(evaluation);
      } catch (error) {
        console.error('Error saving evaluation:', error);
        // Restore button state on error
        if (saveBtn && originalText) {
          saveBtn.textContent = originalText;
          saveBtn.disabled = false;
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
        }
      }
    } else {
      // Fallback if button not found
      await this.stateMachine!.saveEvaluationAndNext(evaluation);
    }
  }

  private handleRewatchSegment(): void {
    if (this.practiceEnded) return; // Prevent action after practice ended

    // Save current evaluation text before rewatching
    const textarea = this.practiceContainer?.querySelector('.evaluation-input') as HTMLTextAreaElement;
    this.preservedEvaluationText = textarea?.value || '';

    // Trigger rewatch in state machine
    this.stateMachine!.rewatchCurrentSegment();
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

  private async handleEndPractice(): Promise<void> {
    if (!this.stateMachine) return;

    const currentState = this.stateMachine.getCurrentState();

    // Restore video to original timestamp (do this before cleanup)
    this.videoController.setCurrentTime(currentState.videoTimestamp);

    // Comprehensive cleanup - this prevents race conditions and UI persistence
    this.resetAllState();

    // Re-render video watching mode to ensure clean state
    await this.renderVideoWatchingMode();
  }

  private resetAllState(): void {
    // Set cancellation flag
    this.practiceEnded = true;

    // Reset all instance variables to initial state
    this.currentVocab = null;
    this.currentVocabStatus = null;
    this.isFlashcardRevealed = false;
    this.lastPickedVocabOriginal = null;
    this.currentVideoId = null;
    this.currentSegmentIndex = null;

    // Immediate DOM cleanup - don't wait for state machine
    if (this.practiceContainer) {
      this.practiceContainer.remove();
      this.practiceContainer = null;
    }

    // Remove any practice buttons
    const existingButton = document.querySelector('.youtube-practice-button');
    if (existingButton) {
      existingButton.remove();
    }

    // Stop video operations and clean up event listeners
    this.videoController.stopAndCleanup();

    // Reset state machine to initial state
    if (this.stateMachine) {
      this.stateMachine.endPractice();
      // Note: We could set stateMachine = null here if we want to force re-initialization
    }
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
      flex: 1;
    `;
  }

  private getEvaluationButtonsStyle(): string {
    return `
      display: flex;
      gap: 12px;
      width: 100%;
    `;
  }

  private getRewatchSegmentButtonStyle(): string {
    return `
      background: #606060;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      transition: background-color 0.1s ease;
      flex: 1;
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
