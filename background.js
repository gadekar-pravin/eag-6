// This background script handles any background tasks for the extension
// Currently, it just initializes when the extension is installed

chrome.runtime.onInstalled.addListener(function() {
    console.log('Recipe Suggester Extension installed');

    // Initialize storage with default values
    chrome.storage.sync.get(['spoonacularKey', 'telegramBotKey', 'sendgridKey', 'geminiKey'], function(result) {
        if (!result.spoonacularKey) {
            chrome.storage.sync.set({ spoonacularKey: '' });
        }

        if (!result.telegramBotKey) {
            chrome.storage.sync.set({ telegramBotKey: '' });
        }

        if (!result.sendgridKey) {
            chrome.storage.sync.set({ sendgridKey: '' });
        }

        if (!result.geminiKey) {
            chrome.storage.sync.set({ geminiKey: '' });
        }
    });
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'logConversation') {
        console.log('Conversation History:', request.data);
        sendResponse({status: 'logged'});
    }
    return true;
});