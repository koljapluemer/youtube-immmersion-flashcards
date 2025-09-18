Let's improve the vocab and persistence flow.

- When processing vocab, persist in browser storage the video id, the timed subtitle segment index, and an array with references to the saved vocab
- By the way, when persisting vocab, persist it with a unique key of the target language form (e.g. "el gatto"). If a given key already exists, check if this key already exists, and if so, add the translation from chatgpt to a translation array; don't overwrite. treat the translation array as a set; no duplicates.

- when trying to get vocab, first check the browser storage, and only if the vocab for this segment was not yet processed call the OpenAI API.

Once we got the segment's vocab, we are in the FLASHCARD PRAcTICE FLOW.

- Fundamentally, we are picking random vocabulary from a pool of all vocab that's either new (not yet practiced) or due (according to a Date comparison with fsrsData.due)
  - we may need to adapt types and logic; currently I think the algo assumes that every persisted vocab also has learning data attached
- When a new card was seen (with its special UI), we use the fsrs function to create a new card for it, it is thus due and can be picked again immediately. You do not need to specify a due date explicitly, just use the CORRECT FUNCTION of fsrs.
- we overwrite the due date for scoring when a card is rated "Wrong" to be immediately due, so that card also goes back into the pool
- Under all circumstances, prevent that the same card comes up twice IN A ROW. Of course, cards may come up multiple times within a segment practice, just not directly in a row
- When no more vocab is available in the pool, show a screen "Nothing more to practice" with a button "Watch Segment" which then redirects to the autoplay
- Because we always show the "nothing more to practice" screen, we ALWAYS go through the FLASHCARD PRACTICE mode, we should never jump directly from EVALUATE to AUTOPLAY. You don't need an extra check for this, this should directly follow from robust and correct state machine implementation.
- Make sure cards are actually picked RANDOM (as they are currently)

You do not need to literally implement a vocab pool, this was just a metaphor. Design the simplest, most robust data structure for this use case.


Do not keep things "backwards compatible", simply cleanly implement this logic.
Implement ALL of these instructions.
Do not invent extra features.
Write clean, extensible, type-safe code without hacks.
Everything must work in Firefox AND chrome.
There is no need for crazy optimization in the array handling, the number of learn cards per segment is VERY SMALL (like 10)

## CLARIFICATION QUESTIONS

### 1. Vocabulary Caching Scope
- Should the vocabulary cache be global across all videos, or scoped per video?
- How long should cached vocabulary persist? Should there be an expiration mechanism?
- If a user revisits the same segment months later, should we use cached vocabulary or re-extract?

global. no expiration. always cached if exits.

### 2. Segment Identification
- How exactly should we identify "subtitle segment index"? Is this the index in the TimedSubtitle array?
- Should we consider timestamp-based identification instead of index (in case subtitles change)?
- What happens if subtitle timing changes between video visits?

understand the timedsubtitle array. yes, it is that. assume that subtitles don't change. 

### 3. Pool Management Details  
- When building the pool of "NEW or DUE" cards, should we include cards from the current segment only, or all cards across all segments?
- The spec mentions "pool of all vocab" - does this mean global across videos, or just current video/segment?
- Should NEW cards be prioritized over DUE cards, or is pure randomization preferred?

current segment only.

### 4. Duplicate Prevention Scope
- "Prevent same card comes up twice" - is this per practice session, per segment, or globally?
- Should this reset when starting a new practice session, or persist across sessions?
- What constitutes a "practice session" - from start practice until end practice?

see above, i meant "prevent same card coming up from twice in a row". no persistence needed, within the practice mode state is completly fine.

### 5. Practice Flow Transitions
- When showing "Nothing more to practice" screen, should this be a new PracticeMode or reuse existing states?
- After watching the segment (AUTOPLAY), do we return to FLASHCARD_PRACTICE or EVALUATION?
- Should the user be able to immediately re-practice the same segment after watching it?

whatever you think is cleanest. No option to re-practice. After AUTOPLAY, we go to EVALUATION.

### 6. FSRS Card Lifecycle
- "When a new card was seen, we use fsrs function to create a new card for it, it is thus due and can be picked again immediately" - should newly created cards be immediately available in the same session?
- Should there be a minimum interval before a card can be selected again, even if due?

no special treatmeant. create the fsrs card, it will thus be due, it will thus be pickable. nothing else, no minimal interval.

### 7. Storage Strategy
- Should vocabulary cache and FSRS cards be in separate storage keys or unified?
- What's the preferred approach for handling storage quota limits with large vocabulary caches?
- Should we implement storage cleanup mechanisms for old cached vocabulary?

add the fsrs card data to the vocab. ignore storage limits. no cleanup for now.

### 8. Error Handling
- What should happen if cached vocabulary exists but is corrupted/invalid?
- How should we handle cases where OpenAI API fails but cache is empty?
- Should we have fallback mechanisms for vocabulary extraction?

whatever is simplest. probably refetch when data is broken. if non-recoverable errors (such as we need openai but its down), show error to the user. no crazy fallbacks.

## REVISED IMPLEMENTATION PLAN

### Key Requirements Summary (Based on Clarifications)
1. **Vocabulary Storage**: Global cache by unique target language word (e.g., "el gatto") with translation arrays (no duplicates)
2. **Segment Caching**: Cache vocabulary by video ID + subtitle segment index 
3. **FSRS Integration**: Embed FSRS card data directly in vocabulary objects
4. **Practice Flow**: Current segment only, prevent consecutive duplicates, always go through FLASHCARD_PRACTICE
5. **Simplicity**: No pools, small arrays (~10 items), simple data structures

### 1. Updated Type Definitions

```typescript
// Enhanced VocabItem with translations array and optional FSRS data
interface VocabItem {
  original: string;           // Target language word (unique key)
  translations: string[];     // Array of translations (treated as set)
  fsrsCard?: Card;           // Optional FSRS card data
  created?: string;          // ISO date when first seen
  lastPicked?: string;       // Track for consecutive duplicate prevention
}

// Segment vocabulary cache
interface SegmentVocabCache {
  videoId: string;
  segmentIndex: number;
  vocabulary: VocabItem[];
  timestamp: string;         // When cached
}
```

### 2. Vocabulary Caching System

**Storage Structure:**
- **Segment cache key**: `vocab_segment_${videoId}_${segmentIndex}`
- **Global vocab key**: `vocab_global_${original}` (for individual words)

**Cache Logic:**
1. Check segment cache first: `vocab_segment_${videoId}_${segmentIndex}`
2. If exists, load vocabulary from segment cache
3. If not exists, call OpenAI API
4. For each vocabulary word from API:
   - Check if global word exists: `vocab_global_${original}`
   - If exists, merge translations (no duplicates)
   - If not exists, create new entry
   - Update/create global word storage
5. Save complete segment cache

### 3. FSRS Integration

**Card Creation:**
- When NEW vocabulary is encountered, create FSRS card using `createEmptyCard(new Date())`
- Embed FSRS card data directly in VocabItem object
- No separate card storage - everything unified in vocabulary objects

**Card Selection Logic:**
```typescript
// Simple selection from current segment vocabulary
function getNextCard(segmentVocab: VocabItem[], lastPickedOriginal?: string): VocabItem | null {
  const now = new Date();
  
  // Filter available cards (NEW or DUE, not last picked)
  const available = segmentVocab.filter(vocab => {
    if (lastPickedOriginal && vocab.original === lastPickedOriginal) return false;
    if (!vocab.fsrsCard) return true; // NEW card
    return now >= vocab.fsrsCard.due; // DUE card
  });
  
  if (available.length === 0) return null;
  
  // Random selection
  return available[Math.floor(Math.random() * available.length)];
}
```

### 4. Practice Flow Implementation

**State Management:**
- Add `lastPickedVocabOriginal: string | null` to practice controller
- Reset on new segment, update on card selection
- Always go: FLASHCARD_PRACTICE -> (if cards available: next card | if no cards: "Nothing to practice" screen) -> AUTOPLAY -> EVALUATION

**"Nothing More to Practice" Screen:**
- Reuse existing flashcard container/styling
- Show message and "Watch Segment" button
- Transition directly to AUTOPLAY mode

### 5. Implementation Steps

1. **Update Types** (`src/types/index.ts`):
   - Modify VocabItem to include translations array and optional fsrsCard
   - Add SegmentVocabCache interface

2. **Create Vocabulary Cache Manager** (new file `src/core/vocab-cache-manager.ts`):
   - Handle segment and global vocabulary storage
   - Merge translation logic
   - Cache lookup and persistence

3. **Update VocabExtractor** (`src/core/vocab-extractor.ts`):
   - Check segment cache before API call
   - Integrate with vocab cache manager for storage

4. **Update FSRSCardManager** (`src/core/fsrs-card-manager.ts`):
   - Simplify to work with embedded FSRS data in VocabItem
   - Remove separate card storage logic

5. **Update PracticeController** (`src/core/practice-controller.ts`):
   - Implement simple card selection logic
   - Add "Nothing more to practice" screen
   - Track lastPickedVocabOriginal for consecutive prevention

6. **Update State Machine** (if needed):
   - Ensure FLASHCARD_PRACTICE always happens before AUTOPLAY
   - Handle transitions cleanly

### 6. Key Simplifications

- **No complex pools**: Simple array filtering and random selection
- **Unified storage**: FSRS data embedded in vocabulary objects
- **Global vocabulary**: Single source of truth per word across all videos
- **Simple caching**: Video ID + segment index based lookup
- **Minimal state**: Only track last picked word to prevent consecutive repeats

### 7. Error Handling Strategy

- **Corrupted cache**: Clear and refetch from API
- **API failures**: Show error message to user
- **Missing data**: Graceful fallbacks where possible
- **Storage errors**: Log and continue with degraded functionality

This revised plan addresses all the clarified requirements with a much simpler, more robust approach focused on the core functionality without over-engineering.