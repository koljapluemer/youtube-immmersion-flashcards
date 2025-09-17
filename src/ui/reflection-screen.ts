import type { TimedSubtitle } from '../types/index.js';

const CSS_CLASSES = {
  REFLECTION_CONTAINER: 'reflection-container',
  REFLECTION_CONTENT: 'reflection-content',
  REFLECTION_TEXT: 'reflection-text',
  REFLECTION_CONTROLS: 'reflection-controls'
};

const STYLES = {
  CONTAINER: `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `,
  CONTENT: `
    max-width: 600px;
    background: white;
    border-radius: 12px;
    padding: 40px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    text-align: center;
  `,
  TEXT: `
    font-size: 18px;
    line-height: 1.6;
    color: #333;
    margin-bottom: 30px;
  `,
  CONTROLS: `
    display: flex;
    gap: 20px;
    justify-content: center;
    flex-wrap: wrap;
  `,
  BUTTON: `
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 120px;
  `,
  CONTINUE_BUTTON: `
    background: #4caf50;
    color: white;
  `,
  FINISH_BUTTON: `
    background: #2196f3;
    color: white;
  `
};

export class ReflectionScreen {
  private container: HTMLElement | null;
  private onContinue: (() => void) | null;
  private onFinish: (() => void) | null;

  constructor() {
    this.container = null;
    this.onContinue = null;
    this.onFinish = null;
  }

  show(subtitle: TimedSubtitle, progress: { current: number; total: number }, onContinue?: () => void, onFinish?: () => void): void {
    this.onContinue = onContinue || null;
    this.onFinish = onFinish || null;

    this.createUI(subtitle, progress);
  }

  private createUI(subtitle: TimedSubtitle, progress: { current: number; total: number }): void {
    this.container = document.createElement('div');
    this.container.className = CSS_CLASSES.REFLECTION_CONTAINER;
    this.container.style.cssText = STYLES.CONTAINER;

    const content = document.createElement('div');
    content.className = CSS_CLASSES.REFLECTION_CONTENT;
    content.style.cssText = STYLES.CONTENT;

    // Progress info
    const progressText = document.createElement('h2');
    progressText.textContent = `Segment ${progress.current}/${progress.total} Complete!`;
    progressText.style.cssText = `color: #4caf50; margin-bottom: 20px; font-size: 24px;`;

    // Reflection text
    const reflectionText = document.createElement('div');
    reflectionText.className = CSS_CLASSES.REFLECTION_TEXT;
    reflectionText.style.cssText = STYLES.TEXT;
    reflectionText.innerHTML = `
      <p><strong>You just studied:</strong></p>
      <p style="font-style: italic; margin: 15px 0; padding: 15px; background: #f5f5f5; border-radius: 8px;">"${subtitle.text}"</p>
      <p>Take a moment to reflect on what you learned. How well did you understand the vocabulary in context?</p>
    `;

    // Controls
    const controls = document.createElement('div');
    controls.className = CSS_CLASSES.REFLECTION_CONTROLS;
    controls.style.cssText = STYLES.CONTROLS;

    if (progress.current < progress.total) {
      const continueButton = this.createButton(
        'Continue Learning',
        STYLES.BUTTON + STYLES.CONTINUE_BUTTON,
        () => {
          this.close();
          if (this.onContinue) this.onContinue();
        }
      );
      controls.appendChild(continueButton);
    }

    const finishButton = this.createButton(
      progress.current < progress.total ? 'Finish Session' : 'Complete!',
      STYLES.BUTTON + STYLES.FINISH_BUTTON,
      () => {
        this.close();
        if (this.onFinish) this.onFinish();
      }
    );
    controls.appendChild(finishButton);

    content.appendChild(progressText);
    content.appendChild(reflectionText);
    content.appendChild(controls);
    this.container.appendChild(content);

    document.body.appendChild(this.container);
  }

  private createButton(text: string, styles: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = styles;
    button.addEventListener('click', onClick);
    return button;
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