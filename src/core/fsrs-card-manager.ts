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
    console.log(`[FSRS] Reviewing card "${vocab.original}" with grade: ${grade}`);
    
    if (!vocab.fsrsCard) {
      throw new Error(`No FSRS card data found for vocabulary: ${vocab.original}`);
    }

    console.log(`[FSRS] BEFORE review - Card data:`, JSON.stringify(vocab.fsrsCard, null, 2));

    const reviewDate = new Date();
    const schedulingInfo = this.scheduler.repeat(vocab.fsrsCard, reviewDate);
    const selectedResult = schedulingInfo[grade];

    console.log(`[FSRS] AFTER FSRS scheduling - Card data:`, JSON.stringify(selectedResult.card, null, 2));

    const updatedVocab: VocabItem = {
      ...vocab,
      fsrsCard: selectedResult.card,
      lastPicked: reviewDate.toISOString()
    };

    // Special handling for "Wrong" (Again) button - set due immediately
    if (grade === Rating.Again && updatedVocab.fsrsCard) {
      console.log(`[FSRS] Grade is Again - setting due to now`);
      updatedVocab.fsrsCard.due = new Date();
    }

    console.log(`[FSRS] Final updated vocab:`, JSON.stringify(updatedVocab, null, 2));

    // Update global vocabulary cache
    console.log(`[FSRS] Updating global cache for: "${vocab.original}"`);
    await this.cacheManager.updateGlobalVocabEntry(updatedVocab);

    // Verify the update worked
    const verifyVocab = await this.cacheManager.getGlobalVocabEntry(vocab.original);
    console.log(`[FSRS] Verification - vocab from cache after update:`, JSON.stringify(verifyVocab, null, 2));

    return { vocab: updatedVocab, log: selectedResult.log };
  }

  /**
   * Get card status for vocabulary item (queries global cache for fresh data)
   */
  async getCardStatus(vocab: VocabItem): Promise<'NEW' | 'DUE' | 'NOT_DUE'> {
    console.log(`[FSRS] Checking card status for: "${vocab.original}"`);
    
    // Query global cache for most up-to-date FSRS data
    const globalVocab = await this.cacheManager.getGlobalVocabEntry(vocab.original);
    
    if (!globalVocab?.fsrsCard) {
      console.log(`[FSRS] Card is NEW - no FSRS data found for: "${vocab.original}"`);
      return 'NEW';
    }

    const currentDate = new Date();
    const dueDate = globalVocab.fsrsCard.due;
    const status = currentDate >= dueDate ? 'DUE' : 'NOT_DUE';
    
    console.log(`[FSRS] Card "${vocab.original}" status: ${status}`);
    console.log(`[FSRS] Current time: ${currentDate.toISOString()}`);
    console.log(`[FSRS] Due time: ${dueDate.toISOString()}`);
    console.log(`[FSRS] Time diff: ${currentDate.getTime() - dueDate.getTime()}ms`);
    console.log(`[FSRS] FSRS card data:`, JSON.stringify(globalVocab.fsrsCard, null, 2));
    
    return status;
  }

  /**
   * Get next available vocabulary for practice from segment storage (NEW or DUE)
   */
  async getNextAvailableVocabForSegment(videoId: string, segmentIndex: number, lastPickedOriginal?: string): Promise<VocabItem | null> {
    console.log(`[FSRS] Getting next vocab for segment ${videoId}:${segmentIndex}, lastPicked: ${lastPickedOriginal}`);
    
    // Get all vocabulary for this segment from storage
    const segmentVocabulary = await this.cacheManager.getSegmentVocabulary(videoId, segmentIndex);
    
    if (!segmentVocabulary || segmentVocabulary.length === 0) {
      console.log(`[FSRS] No vocabulary found for segment`);
      return null;
    }

    console.log(`[FSRS] Segment has ${segmentVocabulary.length} vocabulary items:`, segmentVocabulary.map(v => v.original));

    // Filter out last picked vocabulary (consecutive prevention)
    const eligibleVocab = segmentVocabulary.filter(vocab =>
      !lastPickedOriginal || vocab.original !== lastPickedOriginal
    );

    console.log(`[FSRS] After filtering last picked (${lastPickedOriginal}), ${eligibleVocab.length} eligible:`, eligibleVocab.map(v => v.original));

    // Get fresh vocabulary with current FSRS data from global cache
    const availableVocab: VocabItem[] = [];
    for (const vocab of eligibleVocab) {
      console.log(`[FSRS] Checking eligibility for: "${vocab.original}"`);
      
      const freshVocab = await this.cacheManager.getGlobalVocabEntry(vocab.original);
      const vocabularyToCheck = freshVocab || vocab; // Use fresh data if available
      
      const status = await this.getCardStatus(vocabularyToCheck);
      console.log(`[FSRS] Status for "${vocab.original}": ${status}`);
      
      if (status === 'NEW' || status === 'DUE') {
        console.log(`[FSRS] Adding "${vocab.original}" to available pool`);
        availableVocab.push(vocabularyToCheck);
      } else {
        console.log(`[FSRS] Skipping "${vocab.original}" - status: ${status}`);
      }
    }

    console.log(`[FSRS] Final available vocab count: ${availableVocab.length}`);

    // Random selection from available vocabulary
    if (availableVocab.length === 0) {
      console.log(`[FSRS] No available vocabulary to practice`);
      return null;
    }

    const shuffledVocab = this.shuffleArray(availableVocab);
    const selected = shuffledVocab[0];
    console.log(`[FSRS] Selected vocabulary: "${selected.original}"`);
    return selected;
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