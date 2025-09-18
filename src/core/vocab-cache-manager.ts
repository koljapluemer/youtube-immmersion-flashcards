import type { VocabItem, SegmentVocabCache } from '../types/index.js';
import browser from 'webextension-polyfill';
import type { Card } from 'ts-fsrs';

export class VocabCacheManager {
  private segmentCacheKeyPrefix = 'vocab_segment_';
  private globalVocabKeyPrefix = 'vocab_global_';

  /**
   * Get cached vocabulary for a specific video segment
   */
  async getSegmentVocabulary(videoId: string, segmentIndex: number): Promise<VocabItem[] | null> {
    const cacheKey = `${this.segmentCacheKeyPrefix}${videoId}_${segmentIndex}`;
    
    try {
      const result = await browser.storage.local.get([cacheKey]);
      
      if (!result[cacheKey]) {
        return null;
      }

      const cache = JSON.parse(result[cacheKey]) as SegmentVocabCache;
      
      // Deserialize FSRS card data if present
      const vocabulary = cache.vocabulary.map(vocab => ({
        ...vocab,
        fsrsCard: vocab.fsrsCard ? this.deserializeCard(vocab.fsrsCard) : undefined
      }));

      return vocabulary;
    } catch (error) {
      console.error('Error reading segment vocabulary cache:', error);
      // Clear corrupted cache and return null to trigger refetch
      await this.clearSegmentCache(videoId, segmentIndex);
      return null;
    }
  }

  /**
   * Cache vocabulary for a specific video segment
   */
  async cacheSegmentVocabulary(videoId: string, segmentIndex: number, vocabulary: VocabItem[]): Promise<void> {
    const cacheKey = `${this.segmentCacheKeyPrefix}${videoId}_${segmentIndex}`;
    
    try {
      // Serialize FSRS card data
      const serializedVocabulary = vocabulary.map(vocab => ({
        ...vocab,
        fsrsCard: vocab.fsrsCard ? this.serializeCard(vocab.fsrsCard) : undefined
      }));

      const cache: SegmentVocabCache = {
        videoId,
        segmentIndex,
        vocabulary: serializedVocabulary,
        timestamp: new Date().toISOString()
      };

      await browser.storage.local.set({
        [cacheKey]: JSON.stringify(cache)
      });
    } catch (error) {
      console.error('Error caching segment vocabulary:', error);
      // Non-fatal error, continue without caching
    }
  }

  /**
   * Get global vocabulary entry for a specific word
   */
  async getGlobalVocabEntry(original: string): Promise<VocabItem | null> {
    const globalKey = `${this.globalVocabKeyPrefix}${original}`;
    
    try {
      const result = await browser.storage.local.get([globalKey]);
      
      if (!result[globalKey]) {
        return null;
      }

      const vocab = JSON.parse(result[globalKey]) as VocabItem;
      
      // Deserialize FSRS card data if present
      return {
        ...vocab,
        fsrsCard: vocab.fsrsCard ? this.deserializeCard(vocab.fsrsCard) : undefined
      };
    } catch (error) {
      console.error('Error reading global vocabulary entry:', error);
      return null;
    }
  }

  /**
   * Update global vocabulary entry, merging translations
   */
  async updateGlobalVocabEntry(vocab: VocabItem): Promise<void> {
    const globalKey = `${this.globalVocabKeyPrefix}${vocab.original}`;
    
    try {
      // Get existing entry if it exists
      const existing = await this.getGlobalVocabEntry(vocab.original);
      
      let updatedVocab: VocabItem;
      
      if (existing) {
        // Merge translations (treat as set - no duplicates)
        const mergedTranslations = [...new Set([...existing.translations, ...vocab.translations])];
        
        updatedVocab = {
          ...existing,
          translations: mergedTranslations,
          // Always use new FSRS data if provided (for updates), otherwise keep existing
          fsrsCard: vocab.fsrsCard || existing.fsrsCard,
          // Update timestamps
          lastPicked: vocab.lastPicked || existing.lastPicked
        };
      } else {
        // New entry
        updatedVocab = {
          ...vocab,
          created: vocab.created || new Date().toISOString()
        };
      }

      // Serialize and save
      const serializedVocab = {
        ...updatedVocab,
        fsrsCard: updatedVocab.fsrsCard ? this.serializeCard(updatedVocab.fsrsCard) : undefined
      };

      await browser.storage.local.set({
        [globalKey]: JSON.stringify(serializedVocab)
      });
    } catch (error) {
      console.error('Error updating global vocabulary entry:', error);
      // Non-fatal error, continue without updating global cache
    }
  }

  /**
   * Process new vocabulary from API: merge with global cache and return enriched vocabulary
   */
  async processNewVocabulary(newVocabulary: Array<{ original: string; translation: string }>): Promise<VocabItem[]> {
    const enrichedVocabulary: VocabItem[] = [];

    for (const item of newVocabulary) {
      // Get existing global entry
      const existingGlobal = await this.getGlobalVocabEntry(item.original);
      
      let vocabItem: VocabItem;
      
      if (existingGlobal) {
        // Merge with existing
        const mergedTranslations = [...new Set([...existingGlobal.translations, item.translation])];
        vocabItem = {
          ...existingGlobal,
          translations: mergedTranslations
        };
      } else {
        // Create new entry
        vocabItem = {
          original: item.original,
          translations: [item.translation],
          created: new Date().toISOString()
        };
      }

      // Update global cache
      await this.updateGlobalVocabEntry(vocabItem);
      
      enrichedVocabulary.push(vocabItem);
    }

    return enrichedVocabulary;
  }

  /**
   * Clear segment cache (for error recovery)
   */
  async clearSegmentCache(videoId: string, segmentIndex: number): Promise<void> {
    const cacheKey = `${this.segmentCacheKeyPrefix}${videoId}_${segmentIndex}`;
    try {
      await browser.storage.local.remove([cacheKey]);
    } catch (error) {
      console.error('Error clearing segment cache:', error);
    }
  }

  /**
   * Serialize FSRS Card for storage
   */
  private serializeCard(card: Card): Record<string, unknown> {
    return {
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review?.toISOString()
    };
  }

  /**
   * Deserialize FSRS Card from storage
   */
  private deserializeCard(data: Record<string, unknown> | Card): Card {
    // If already a Card object, return as-is
    if (data instanceof Object && 'due' in data && data.due instanceof Date) {
      return data as Card;
    }

    const serializedData = data as Record<string, unknown>;
    return {
      ...serializedData,
      due: new Date(serializedData.due as string),
      last_review: serializedData.last_review ? new Date(serializedData.last_review as string) : undefined
    } as Card;
  }
}
