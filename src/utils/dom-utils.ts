/**
 * Robust DOM utilities for handling dynamic content loading
 */

export interface WaitForElementOptions {
  timeout?: number;
  retryInterval?: number;
  container?: Element | Document;
}

/**
 * Waits for an element to appear in the DOM using MutationObserver for efficiency
 */
export function waitForElement(
  selector: string,
  options: WaitForElementOptions = {}
): Promise<Element> {
  const {
    timeout = 10000, // 10 seconds default
    retryInterval = 100, // 100ms fallback polling
    container = document
  } = options;

  return new Promise((resolve, reject) => {
    // Check if element already exists
    const existingElement = container.querySelector(selector);
    if (existingElement) {
      resolve(existingElement);
      return;
    }

    let timeoutId: number;
    let observer: MutationObserver | null = null;
    let fallbackIntervalId: number | null = null;

    // Cleanup function
    const cleanup = (): void => {
      if (timeoutId) clearTimeout(timeoutId);
      if (observer) observer.disconnect();
      if (fallbackIntervalId) clearInterval(fallbackIntervalId);
    };

    // Set timeout
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
    }, timeout);

    // Try MutationObserver first (more efficient)
    try {
      observer = new MutationObserver((mutations) => {
        // Check if target element was added
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                // Check if the added element matches our selector
                if (element.matches && element.matches(selector)) {
                  cleanup();
                  resolve(element);
                  return;
                }
                // Check if the added element contains our target
                const found = element.querySelector && element.querySelector(selector);
                if (found) {
                  cleanup();
                  resolve(found);
                  return;
                }
              }
            }
          }
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.warn('MutationObserver failed, falling back to polling:', error);
    }

    // Fallback polling mechanism
    fallbackIntervalId = window.setInterval(() => {
      const element = container.querySelector(selector);
      if (element) {
        cleanup();
        resolve(element);
      }
    }, retryInterval);
  });
}

/**
 * Waits for multiple elements to appear in the DOM
 */
export async function waitForElements(
  selectors: string[],
  options: WaitForElementOptions = {}
): Promise<Element[]> {
  const promises = selectors.map(selector => waitForElement(selector, options));
  return Promise.all(promises);
}

/**
 * Utility to wait for YouTube's dynamic content to be ready
 */
export function waitForYouTubeReady(): Promise<void> {
  return new Promise((resolve) => {
    // Check if YouTube's main app is loaded
    const checkYouTubeReady = (): void => {
      const ytdApp = document.querySelector('ytd-app');
      const videoContainer = document.querySelector('#movie_player');

      if (ytdApp && videoContainer) {
        resolve();
      } else {
        setTimeout(checkYouTubeReady, 100);
      }
    };

    checkYouTubeReady();
  });
}