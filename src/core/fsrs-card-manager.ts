import type { Card, ReviewLog, FSRS, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { VocabItem } from '../types/index.js';
import { VocabCacheManager } from './vocab-cache-manager.js';

export class FSRSCardManager {
  private scheduler: FSRS = fsrs();
  public cacheManager = new VocabCacheManager(); // Public for PracticeController access

  /**
   * Create FSRS card for vocabulary item (embeds in VocabItem)
   */
  async createCard(vocab: VocabItem): Promise<VocabItem> {
    // Create new FSRS card using correct function
    const fsrsCard = createEmptyCard(new Date());
    
    const updatedVocab: VocabItem = {
      ...vocab,
      fsrsCard,
      created: vocab.created || new Date().toISOString(),
      lastPicked: new Date().toISOString()
    };

    // Update global vocabulary cache
    await this.cacheManager.updateGlobalVocabEntry(updatedVocab);
    
    return updatedVocab;
  }

  /**
   * Review vocabulary card and update FSRS data
   */
  async reviewCard(vocab: VocabItem, grade: Grade): Promise<{ vocab: VocabItem; log: ReviewLog }> {
    if (!vocab.fsrsCard) {
      throw new Error(`No FSRS card data found for vocabulary: ${vocab.original}`);
    }

    const reviewDate = new Date();
    const schedulingInfo = this.scheduler.repeat(vocab.fsrsCard, reviewDate);
    const selectedResult = schedulingInfo[grade];

    const updatedVocab: VocabItem = {
      ...vocab,
      fsrsCard: selectedResult.card,
      lastPicked: reviewDate.toISOString()
    };

    // Special handling for "Wrong" (Again) button - set due immediately
    if (grade === Rating.Again && updatedVocab.fsrsCard) {
      updatedVocab.fsrsCard.due = new Date();
    }

    // Update global vocabulary cache
    await this.cacheManager.updateGlobalVocabEntry(updatedVocab);

    return { vocab: updatedVocab, log: selectedResult.log };
  }

  /**
   * Get card status for vocabulary item (queries global cache for fresh data)
   */
  async getCardStatus(vocab: VocabItem): Promise<'NEW' | 'DUE' | 'NOT_DUE'> {
    // Query global cache for most up-to-date FSRS data
    const globalVocab = await this.cacheManager.getGlobalVocabEntry(vocab.original);
    
    if (!globalVocab?.fsrsCard) {
      return 'NEW';
    }

    const currentDate = new Date();
    const dueDate = globalVocab.fsrsCard.due;
    return currentDate >= dueDate ? 'DUE' : 'NOT_DUE';
  }

  /**
   * Get next available vocabulary for practice from segment storage (NEW or DUE)
   */
  async getNextAvailableVocabForSegment(videoId: string, segmentIndex: number, lastPickedOriginal?: string): Promise<VocabItem | null> {
    // Get all vocabulary for this segment from storage
    const segmentVocabulary = await this.cacheManager.getSegmentVocabulary(videoId, segmentIndex);
    
    if (!segmentVocabulary || segmentVocabulary.length === 0) {
      return null;
    }

    // Filter out last picked vocabulary (consecutive prevention)
    const eligibleVocab = segmentVocabulary.filter(vocab =>
      !lastPickedOriginal || vocab.original !== lastPickedOriginal
    );

    // Get fresh vocabulary with current FSRS data from global cache
    const availableVocab: VocabItem[] = [];
    for (const vocab of eligibleVocab) {
      const freshVocab = await this.cacheManager.getGlobalVocabEntry(vocab.original);
      const vocabularyToCheck = freshVocab || vocab; // Use fresh data if available
      
      const status = await this.getCardStatus(vocabularyToCheck);
      if (status === 'NEW' || status === 'DUE') {
        availableVocab.push(vocabularyToCheck);
      }
    }

    // Random selection from available vocabulary
    if (availableVocab.length === 0) {
      return null;
    }

    const shuffledVocab = this.shuffleArray(availableVocab);
    return shuffledVocab[0];
  }

  /**
   * Get fresh vocabulary with FSRS data from global cache
   */
  async getFreshVocabWithFSRSData(original: string): Promise<VocabItem | null> {
    return await this.cacheManager.getGlobalVocabEntry(original);
  }

  /**
   * Check if segment has any available vocabulary for practice
   */
  async hasAvailableVocabInSegment(videoId: string, segmentIndex: number): Promise<boolean> {
    const nextVocab = await this.getNextAvailableVocabForSegment(videoId, segmentIndex);
    return nextVocab !== null;
  }

  /**
   * Mark vocabulary as picked (updates global cache)
   */
  async markVocabAsPicked(vocab: VocabItem): Promise<VocabItem> {
    const updatedVocab: VocabItem = {
      ...vocab,
      lastPicked: new Date().toISOString()
    };

    // Update global vocabulary cache
    await this.cacheManager.updateGlobalVocabEntry(updatedVocab);
    
    return updatedVocab;
  }


  /**
   * Fisher-Yates shuffle for unbiased randomization
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; // Don't mutate original array
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }


  /**
   * Convenience methods for rating
   */
  static get Rating(): { Again: number; Hard: number; Good: number; Easy: number } {
    return {
      Again: Rating.Again,    // 1 - Wrong
      Hard: Rating.Hard,      // 2 - Hard
      Good: Rating.Good,      // 3 - Correct
      Easy: Rating.Easy       // 4 - Easy
    };
  }
}