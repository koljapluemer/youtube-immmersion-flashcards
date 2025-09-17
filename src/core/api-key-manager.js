class ApiKeyManager {
  static async ensureOpenAIKey() {
    // Try to get existing key from chrome storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['openai_api_key'], resolve);
    });

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

    // Store the key securely in chrome storage
    await ApiKeyManager.storeKey(apiKey);
    console.log('OpenAI API key saved to storage');
    return apiKey;
  }

  static validateKeyFormat(key) {
    return key && key.startsWith('sk-');
  }

  static async storeKey(apiKey) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ 'openai_api_key': apiKey }, resolve);
    });
  }

  static async getStoredKey() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['openai_api_key'], resolve);
    });
    return result.openai_api_key || null;
  }

  static async clearKey() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['openai_api_key'], resolve);
    });
  }
}