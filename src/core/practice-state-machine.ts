import type { TimedSubtitle } from '../types/index.js';
import browser from 'webextension-polyfill';

export enum PracticeMode {
  VIDEO_WATCHING = 'VIDEO_WATCHING',
  FLASHCARD_PRACTICE = 'FLASHCARD_PRACTICE',
  AUTOPLAY = 'AUTOPLAY',
  EVALUATION = 'EVALUATION'
}

export interface PracticeState {
  mode: PracticeMode;
  currentSubtitleIndex: number;
  totalSubtitles: number;
  videoTimestamp: number;
  currentSubtitle?: TimedSubtitle;
  isRewatching?: boolean;
}

export class PracticeStateMachine {
  private state: PracticeState;
  private subtitles: TimedSubtitle[];
  private onStateChange: (state: PracticeState) => void;

  constructor(subtitles: TimedSubtitle[], onStateChange: (state: PracticeState) => void) {
    this.subtitles = subtitles;
    this.onStateChange = onStateChange;
    this.state = {
      mode: PracticeMode.VIDEO_WATCHING,
      currentSubtitleIndex: 0,
      totalSubtitles: subtitles.length,
      videoTimestamp: 0
    };
  }

  getCurrentState(): PracticeState {
    return { ...this.state };
  }

  findCurrentSubtitleFromTimestamp(timestamp: number): number {
    for (let i = 0; i < this.subtitles.length; i++) {
      const subtitle = this.subtitles[i];
      if (timestamp >= subtitle.start && timestamp <= subtitle.start + subtitle.duration) {
        return i;
      }
    }

    // If not within any subtitle, find the closest one
    let closestIndex = 0;
    let closestDistance = Math.abs(timestamp - this.subtitles[0].start);

    for (let i = 1; i < this.subtitles.length; i++) {
      const distance = Math.abs(timestamp - this.subtitles[i].start);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  startPractice(videoTimestamp: number): void {
    const subtitleIndex = this.findCurrentSubtitleFromTimestamp(videoTimestamp);

    this.state = {
      mode: PracticeMode.FLASHCARD_PRACTICE,
      currentSubtitleIndex: subtitleIndex,
      totalSubtitles: this.subtitles.length,
      videoTimestamp,
      currentSubtitle: this.subtitles[subtitleIndex]
    };

    this.onStateChange(this.state);
  }


  moveToAutoplay(): void {
    this.state.mode = PracticeMode.AUTOPLAY;
    this.onStateChange(this.state);
  }

  moveToEvaluation(): void {
    this.state.mode = PracticeMode.EVALUATION;
    this.onStateChange(this.state);
  }

  rewatchCurrentSegment(): void {
    this.state.isRewatching = true;
    this.state.mode = PracticeMode.AUTOPLAY;
    this.onStateChange(this.state);
  }

  async saveEvaluationAndNext(evaluation: string): Promise<void> {
    if (this.state.mode === PracticeMode.EVALUATION && this.state.currentSubtitle) {
      // Save to browser storage
      const videoId = new URLSearchParams(window.location.search).get('v');
      const evaluationData = {
        videoId,
        subtitleIndex: this.state.currentSubtitleIndex,
        timestamp: this.state.videoTimestamp,
        subtitle: this.state.currentSubtitle.text,
        evaluation,
        savedAt: new Date().toISOString()
      };

      const result = await browser.storage.local.get(['practice_evaluations']);
      const existingEvaluations = Array.isArray(result.practice_evaluations) ? result.practice_evaluations : [];
      existingEvaluations.push(evaluationData);
      await browser.storage.local.set({ practice_evaluations: existingEvaluations });

      // Move to next subtitle
      if (this.state.currentSubtitleIndex < this.state.totalSubtitles - 1) {
        this.state.currentSubtitleIndex++;
        this.state.currentSubtitle = this.subtitles[this.state.currentSubtitleIndex];
        this.state.videoTimestamp = this.state.currentSubtitle.start; // Set timestamp to new subtitle
        this.state.mode = PracticeMode.FLASHCARD_PRACTICE;
        this.onStateChange(this.state);
      } else {
        this.endPractice();
      }
    }
  }

  endPractice(): void {
    this.state.mode = PracticeMode.VIDEO_WATCHING;
    this.onStateChange(this.state);
  }
}