// This background script handles any background tasks for the extension

chrome.runtime.onInstalled.addListener(function() {
    console.log('Recipe Suggester Extension installed. Backend communication required.');

    // No longer initializing API keys here as they are handled by the Python backend
    // Remove storage initialization for keys
});

// Listen for messages from the popup (optional - could be used for logging or other background tasks)
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Example: Log actions initiated from the popup
    if (request.action === 'logAction') {
        console.log('Action Logged:', request.data);
        sendResponse({status: 'logged'});
    }
    // Keep the listener alive for asynchronous responses if needed
    return true;
});

// Optional: Check backend status periodically or on startup
// chrome.alarms.create('checkBackendStatus', { periodInMinutes: 5 });
// chrome.alarms.onAlarm.addListener(async (alarm) => {
//     if (alarm.name === 'checkBackendStatus') {
//         try {
//             const response = await fetch('http://127.0.0.1:8000/'); // Check root endpoint
//             if (response.ok) {
//                 console.log('Backend status: OK');
//                 chrome.action.setBadgeText({ text: '' }); // Clear badge on success
//             } else {
//                 console.warn('Backend status: Not OK (status code ' + response.status + ')');
//                 chrome.action.setBadgeText({ text: 'ERR' });
//                 chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
//             }
//         } catch (error) {
//             console.error('Backend status: Unreachable', error);
//             chrome.action.setBadgeText({ text: 'OFF' });
//             chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
//         }
//     }
// });

// Initial check on startup
// setTimeout(() => chrome.alarms.get('checkBackendStatus', alarm => {
//     if (!alarm) chrome.alarms.create('checkBackendStatus', { delayInMinutes: 0.1 });
// }), 1000); // Run initial check shortly after install/update