import browser from 'webextension-polyfill';

export class ApiKeyManager {
  static async ensureOpenAIKey(): Promise<string | null> {
    // Try to get existing key from browser storage
    const result = await browser.storage.sync.get(['openai_api_key']);

    if (result.openai_api_key) {
      console.log('OpenAI API key found in storage');
      return result.openai_api_key;
    }

    // Prompt user for API key
    const apiKey = prompt('Please enter your OpenAI API key:');

    if (!apiKey || apiKey.trim() === '') {
      alert('OpenAI API key is required to use this feature');
      return null;
    }

    // Validate API key format (starts with sk-)
    if (!ApiKeyManager.validateKeyFormat(apiKey)) {
      alert('Invalid OpenAI API key format. Keys should start with "sk-"');
      return null;
    }

    // Store the key securely in browser storage
    await ApiKeyManager.storeKey(apiKey);
    console.log('OpenAI API key saved to storage');
    return apiKey;
  }

  static validateKeyFormat(key: string): boolean {
    return key && key.startsWith('sk-');
  }

  static async storeKey(apiKey: string): Promise<void> {
    await browser.storage.sync.set({ 'openai_api_key': apiKey });
  }

  static async getStoredKey(): Promise<string | null> {
    const result = await browser.storage.sync.get(['openai_api_key']);
    return result.openai_api_key || null;
  }

  static async clearKey(): Promise<void> {
    await browser.storage.sync.remove(['openai_api_key']);
  }
}