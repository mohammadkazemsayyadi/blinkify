// Default settings
const DEFAULTS = {
  intervalMinutes: 20,
  playDurationSeconds: 20,
  isRunning: false,
  volume: 0.5,
  songMode: 'default', // NEW: Track the toggle switch state
  selectedSong: 'tracks/track1.mp3', 
  lastTimestamp: 0,
  notificationsEnabled: false,
  notificationMessage: 'Every 20 minutes look 20 feet away for 20 seconds'
};

let settings = { ...DEFAULTS };

// Promise that resolves once settings have been loaded from storage
let settingsReadyResolve;
const settingsReady = new Promise(r => settingsReadyResolve = r);

(async () => {
  const stored = await chrome.storage.local.get([
    'intervalMinutes',
    'playDurationSeconds',
    'isRunning',
    'songMode', // <-- FIX: Added this here so it reads the saved mode
    'selectedSong',
    'lastTimestamp',
    'notificationsEnabled',
    'notificationMessage',
    'volume'
  ]);
  Object.assign(settings, stored);
  settingsReadyResolve();
})();

chrome.runtime.onInstalled.addListener(async () => {
  await settingsReady; 
  if (settings.isRunning) {
    createAlarm(settings.intervalMinutes);
  }
});



// NEW: Generates a unique ID (Date.now()) so the notification pops up every single time!
function triggerNotification() {
  if (settings.notificationsEnabled) {
    const uniqueId = 'notif-' + Date.now(); 
    chrome.notifications.create(uniqueId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png', 
      title: 'Eye Care',
      message: settings.notificationMessage || 'every 20 minutes look 20 feet away for 20 seconds', // NEW: Uses your custom text
      priority: 2 // Boosted to priority 2 to make sure it pops up over other windows
    });
  }
}



// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Save the exact second the song paused
  if (msg.type === 'saveTimestamp') {
    settings.lastTimestamp = msg.timestamp;
    chrome.storage.local.set({ lastTimestamp: settings.lastTimestamp });
    sendResponse({ success: true });
    return;
  }  
  
  if (msg.type === 'updateSettings') {
    const updatesToSave = {};

    // ONLY update and save a setting if the popup explicitly sent it
    if (msg.intervalMinutes !== undefined) {
      settings.intervalMinutes = msg.intervalMinutes;
      updatesToSave.intervalMinutes = settings.intervalMinutes;
    }
    
    if (msg.playDurationSeconds !== undefined) {
      settings.playDurationSeconds = msg.playDurationSeconds;
      updatesToSave.playDurationSeconds = settings.playDurationSeconds;
    }

    // FIX: Track the toggle mode (Custom vs Default)
    if (msg.songMode) {
      settings.songMode = msg.songMode;
    }

    // FIX: Grab the song selection and reset the timestamp to 0 if it changed
    if (msg.selectedSong && settings.selectedSong !== msg.selectedSong) {
      settings.selectedSong = msg.selectedSong;
      settings.lastTimestamp = 0; 
    }
    
    // Track notification toggle changes
    if (msg.notificationsEnabled !== undefined) {
      settings.notificationsEnabled = msg.notificationsEnabled;
    }

    if (msg.notificationMessage !== undefined) {
      settings.notificationMessage = msg.notificationMessage;
    }
    //FIX: Force the timestamp to 0 if the popup tells us to!
    if (msg.resetTimestamp) {
      settings.lastTimestamp = 0;
    }
    //Track volume changes
    if (msg.volume !== undefined) {
      settings.volume = msg.volume;
    }
    // FIX: Save ALL settings to storage so it remembers the toggle switch
    chrome.storage.local.set({
      intervalMinutes: settings.intervalMinutes,
      playDurationSeconds: settings.playDurationSeconds,
      songMode: settings.songMode, 
      volume: settings.volume,
      selectedSong: settings.selectedSong,
      lastTimestamp: settings.lastTimestamp,
      notificationsEnabled: settings.notificationsEnabled,
      notificationMessage: settings.notificationMessage
    });
  }

  if (msg.type === 'start') {
    settings.isRunning = true;
    chrome.storage.local.set({ isRunning: true });
    createAlarm(settings.intervalMinutes);
    
    ensureOffscreen().then(() => {
      const durationMs = settings.playDurationSeconds * 1000;
      sendToOffscreen({
        action: 'play',
        duration: durationMs,
        songPath: settings.selectedSong,
        startTime: settings.lastTimestamp,
        volume: settings.volume
      });
      startIconAnimation(durationMs); 
      triggerNotification(); // <-- Fire Notification on Manual Start
    });
  }

  if (msg.type === 'stop') {
    settings.isRunning = false;
    chrome.storage.local.set({ isRunning: false });
    chrome.alarms.clear('playAlarm');
    sendToOffscreen({ action: 'stop' });
    
    stopIconAnimation();
  }
  // This catches the message when the song naturally finishes playing
  if (msg.type === 'audioEnded') {
    stopIconAnimation(); 
  }

  
  sendResponse({ success: true });
});

// Alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await settingsReady;   
  if (alarm.name === 'playAlarm' && settings.isRunning) {
    await ensureOffscreen();
    
    const durationMs = settings.playDurationSeconds * 1000;
    
    sendToOffscreen({
      action: 'play',
      duration: durationMs,
      songPath: settings.selectedSong, 
      startTime: settings.lastTimestamp,
      volume: settings.volume
    });
    
    startIconAnimation(durationMs); 
    triggerNotification(); // <-- Fire Notification on Alarm
  }
});

function createAlarm(periodMinutes) {
  chrome.alarms.clear('playAlarm', () => {
    chrome.alarms.create('playAlarm', {
      delayInMinutes: periodMinutes,
      periodInMinutes: periodMinutes
    });
  });
}

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play interval song'
    });
  }
}

function sendToOffscreen(message) {
  chrome.runtime.sendMessage(message);
}

// ==========================================
// TOOLBAR ICON ANIMATION LOGIC
// ==========================================
let animationInterval = null;
let stopAnimationTimeout = null; // NEW: Track the timeout so we can cancel it cleanly

function startIconAnimation(durationMs) {
  const frames = [
    'icons/frame1.png',
    'icons/frame2.png',
    'icons/frame3.png',
    'icons/frame4.png',
    'icons/frame5.png',
    'icons/frame6.png',
    'icons/frame7.png',
    'icons/frame8.png',
    'icons/frame9.png',
    'icons/frame10.png',
  ];
  
  let currentIndex = 0;
  let goingForward = true; 

  // Clear any existing animations AND ghost timers before starting a new one
  if (animationInterval) clearInterval(animationInterval);
  if (stopAnimationTimeout) clearTimeout(stopAnimationTimeout);

  animationInterval = setInterval(() => {
    chrome.action.setIcon({ path: frames[currentIndex] });

    if (goingForward) {
      currentIndex++;
      if (currentIndex === frames.length - 1) {
        goingForward = false;
      }
    } else {
      currentIndex--;
      if (currentIndex === 0) {
        goingForward = true;
      }
    }
  }, 250);

  // Save the timeout to our new variable so we can cancel it if the user hits Stop
  stopAnimationTimeout = setTimeout(() => {
    stopIconAnimation();
  }, durationMs);
}

function stopIconAnimation() {
  // 1. Clear the animation interval immediately
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  
  // 2. Clear the timeout so it doesn't fire again if stopped manually
  if (stopAnimationTimeout) {
    clearTimeout(stopAnimationTimeout);
    stopAnimationTimeout = null;
  }
  
  // 3. The Native Chrome Fallback Method!
  // Pass all sizes as an object. Chrome automatically checks which ones 
  // exist and picks the best resolution without crashing your script.
  chrome.action.setIcon({
    path: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }, () => {
    // This catches any silent Chrome errors (like missing files) 
    // and prints them to the Service Worker console so you can debug!
    if (chrome.runtime.lastError) {
      console.error("Failed to reset icon:", chrome.runtime.lastError.message);
    }
  });
}