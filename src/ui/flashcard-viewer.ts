import { FSRSCardManager, type VocabCard } from '../core/fsrs-card-manager.js';
import { VocabExtractor } from '../core/vocab-extractor.js';
import type { TimedSubtitle } from '../types/index.js';
import type { Grade } from 'ts-fsrs';

const CSS_CLASSES = {
  FLASHCARD_CONTAINER: 'flashcard-container',
  FLASHCARD_CARD: 'flashcard-card',
  FLASHCARD_FRONT: 'flashcard-front',
  FLASHCARD_BACK: 'flashcard-back',
  FLASHCARD_CONTROLS: 'flashcard-controls',
  RATING_BUTTON: 'rating-button'
};

const STYLES = {
  CONTAINER: `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `,
  CARD: `
    width: 600px;
    height: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin-bottom: 30px;
    cursor: pointer;
    transition: transform 0.2s ease;
  `,
  CARD_HOVER: `
    transform: scale(1.02);
  `,
  FRONT: `
    font-size: 32px;
    font-weight: bold;
    color: #333;
    text-align: center;
    padding: 20px;
  `,
  BACK: `
    font-size: 24px;
    color: #666;
    text-align: center;
    padding: 20px;
    border-top: 2px solid #eee;
    margin-top: 20px;
  `,
  CONTROLS: `
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    justify-content: center;
  `,
  RATING_BUTTON: `
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 100px;
  `,
  AGAIN_BUTTON: `
    background: #f44336;
    color: white;
  `,
  HARD_BUTTON: `
    background: #ff9800;
    color: white;
  `,
  GOOD_BUTTON: `
    background: #4caf50;
    color: white;
  `,
  EASY_BUTTON: `
    background: #2196f3;
    color: white;
  `,
  CLOSE_BUTTON: `
    background: #666;
    color: white;
    margin-left: 20px;
  `
};

export class FlashcardViewer {
  private cardManager: FSRSCardManager;
  private vocabExtractor: VocabExtractor;
  private container: HTMLElement | null;
  private currentCards: VocabCard[];
  private currentCardIndex: number;
  private showingBack: boolean;
  private onComplete: (() => void) | null;

  constructor() {
    this.cardManager = new FSRSCardManager();
    this.vocabExtractor = new VocabExtractor();
    this.container = null;
    this.currentCards = [];
    this.currentCardIndex = 0;
    this.showingBack = false;
    this.onComplete = null;
  }

  async showFlashcards(subtitle: TimedSubtitle, onComplete?: () => void): Promise<void> {
    this.onComplete = onComplete || null;

    try {
      // Extract vocabulary from subtitle
      const vocabulary = await this.vocabExtractor.extractVocabulary(subtitle.text, 'auto');

      if (vocabulary.length === 0) {
        console.log('No vocabulary found for this subtitle');
        if (this.onComplete) this.onComplete();
        return;
      }

      // Create cards for new vocabulary
      const cards = [];
      for (const vocab of vocabulary) {
        const existingCards = await this.cardManager.getStoredCards();
        const existingCard = existingCards.find(c => c.vocab.original === vocab.original);

        if (existingCard) {
          cards.push(existingCard);
        } else {
          const newCard = await this.cardManager.createCard(vocab);
          cards.push(newCard);
        }
      }

      this.currentCards = cards;
      this.currentCardIndex = 0;
      this.showingBack = false;

      this.createUI();
      this.updateCardDisplay();

    } catch (error) {
      console.error('Error showing flashcards:', error);
      if (this.onComplete) this.onComplete();
    }
  }

  private createUI(): void {
    this.container = document.createElement('div');
    this.container.className = CSS_CLASSES.FLASHCARD_CONTAINER;
    this.container.style.cssText = STYLES.CONTAINER;

    // Create card element
    const card = document.createElement('div');
    card.className = CSS_CLASSES.FLASHCARD_CARD;
    card.style.cssText = STYLES.CARD;
    card.addEventListener('click', () => this.flipCard());

    // Create front and back
    const front = document.createElement('div');
    front.className = CSS_CLASSES.FLASHCARD_FRONT;
    front.style.cssText = STYLES.FRONT;

    const back = document.createElement('div');
    back.className = CSS_CLASSES.FLASHCARD_BACK;
    back.style.cssText = STYLES.BACK;
    back.style.display = 'none';

    card.appendChild(front);
    card.appendChild(back);

    // Create controls
    const controls = document.createElement('div');
    controls.className = CSS_CLASSES.FLASHCARD_CONTROLS;
    controls.style.cssText = STYLES.CONTROLS;

    // Rating buttons (hidden initially)
    const ratingButtons = this.createRatingButtons();
    ratingButtons.style.display = 'none';

    // Instructions
    const instructions = document.createElement('div');
    instructions.textContent = 'Click card to reveal translation';
    instructions.style.cssText = `color: white; font-size: 18px; margin-bottom: 20px;`;

    controls.appendChild(instructions);
    controls.appendChild(ratingButtons);

    // Close button
    const closeButton = this.createButton('Close', STYLES.CLOSE_BUTTON, () => this.close());
    controls.appendChild(closeButton);

    this.container.appendChild(card);
    this.container.appendChild(controls);

    document.body.appendChild(this.container);
  }

  private createRatingButtons(): HTMLElement {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = STYLES.CONTROLS;

    const buttons = [
      { text: 'Again', style: STYLES.AGAIN_BUTTON, rating: FSRSCardManager.Rating.Again },
      { text: 'Hard', style: STYLES.HARD_BUTTON, rating: FSRSCardManager.Rating.Hard },
      { text: 'Good', style: STYLES.GOOD_BUTTON, rating: FSRSCardManager.Rating.Good },
      { text: 'Easy', style: STYLES.EASY_BUTTON, rating: FSRSCardManager.Rating.Easy }
    ];

    buttons.forEach(({ text, style, rating }) => {
      const button = this.createButton(
        text,
        STYLES.RATING_BUTTON + style,
        () => this.rateCard(rating)
      );
      buttonContainer.appendChild(button);
    });

    return buttonContainer;
  }

  private createButton(text: string, styles: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = styles;
    button.addEventListener('click', onClick);
    return button;
  }

  private updateCardDisplay(): void {
    if (!this.container || this.currentCardIndex >= this.currentCards.length) {
      return;
    }

    const currentCard = this.currentCards[this.currentCardIndex];
    const front = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_FRONT}`) as HTMLElement;
    const back = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_BACK}`) as HTMLElement;

    front.textContent = currentCard.vocab.original;
    back.textContent = currentCard.vocab.translation;

    // Reset card state
    this.showingBack = false;
    front.style.display = 'block';
    back.style.display = 'none';

    // Hide rating buttons
    const ratingButtons = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_CONTROLS} > div:nth-child(2)`) as HTMLElement;
    if (ratingButtons) {
      ratingButtons.style.display = 'none';
    }

    // Update instructions
    const instructions = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_CONTROLS} > div:first-child`) as HTMLElement;
    if (instructions) {
      instructions.textContent = `Card ${this.currentCardIndex + 1}/${this.currentCards.length} - Click to reveal translation`;
    }
  }

  private flipCard(): void {
    if (!this.container || this.showingBack) return;

    const front = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_FRONT}`) as HTMLElement;
    const back = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_BACK}`) as HTMLElement;
    const ratingButtons = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_CONTROLS} > div:nth-child(2)`) as HTMLElement;
    const instructions = this.container.querySelector(`.${CSS_CLASSES.FLASHCARD_CONTROLS} > div:first-child`) as HTMLElement;

    front.style.display = 'none';
    back.style.display = 'block';
    this.showingBack = true;

    if (ratingButtons) ratingButtons.style.display = 'flex';
    if (instructions) instructions.textContent = 'How well did you know this word?';
  }

  private async rateCard(rating: Grade): Promise<void> {
    if (this.currentCardIndex >= this.currentCards.length) return;

    const currentCard = this.currentCards[this.currentCardIndex];

    try {
      await this.cardManager.reviewCard(currentCard.id, rating);
      this.nextCard();
    } catch (error) {
      console.error('Error rating card:', error);
      this.nextCard(); // Continue even if rating fails
    }
  }

  private nextCard(): void {
    this.currentCardIndex++;

    if (this.currentCardIndex >= this.currentCards.length) {
      // All cards completed
      this.close();
      if (this.onComplete) this.onComplete();
    } else {
      this.updateCardDisplay();
    }
  }

  close(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  isActive(): boolean {
    return this.container !== null && document.contains(this.container);
  }
}