const intervalInput = document.getElementById('interval');
const durationInput = document.getElementById('duration');
const statusDiv = document.getElementById('status');
const countdownDiv = document.getElementById('countdown'); 
let countdownInterval = null;

// UI Elements
const modeRadios = document.querySelectorAll('input[name="songMode"]');
const defaultSection = document.getElementById('defaultSection');
const customSection = document.getElementById('customSection');
const songSelect = document.getElementById('songSelect');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');

// Controls
const powerToggle = document.getElementById('powerToggle');
const notificationToggle = document.getElementById('notificationToggle'); 
const notifMessageInput = document.getElementById('notifMessage');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Load saved settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get([
    'intervalMinutes',
    'playDurationSeconds',
    'isRunning',
    'songMode',
    'selectedSong',
    'notificationsEnabled',
    'notificationMessage' 
  ]);
  
  if (stored.intervalMinutes) intervalInput.value = stored.intervalMinutes;
  if (stored.playDurationSeconds) durationInput.value = stored.playDurationSeconds;
  
  if (stored.songMode) {
    document.querySelector(`input[name="songMode"][value="${stored.songMode}"]`).checked = true;
    toggleSections(stored.songMode);
  }
  
  if (stored.songMode === 'default' && stored.selectedSong) {
    songSelect.value = stored.selectedSong;
  }

  notificationToggle.checked = stored.notificationsEnabled || false;

  if (stored.notificationMessage) {
    notifMessageInput.value = stored.notificationMessage;
  }

  const hasCustom = await checkCustomSongInDB();
  if (hasCustom) {
    uploadStatus.textContent = 'Custom song is saved in database!';
    uploadStatus.style.color = 'green';
  }

  if (stored.isRunning) {
    powerToggle.checked = true;
    updateStatus(true);
    startCountdownUI(); 
  } else {
    powerToggle.checked = false;
    updateStatus(false);
  }
});

modeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    toggleSections(e.target.value);
  });
});

function toggleSections(mode) {
  if (mode === 'default') {
    defaultSection.classList.remove('hidden');
    customSection.classList.add('hidden');
  } else {
    defaultSection.classList.add('hidden');
    customSection.classList.remove('hidden');
  }
}

// Save notification setting immediately when toggled
notificationToggle.addEventListener('change', async (event) => {
  const isEnabled = event.target.checked;
  await chrome.storage.local.set({ notificationsEnabled: isEnabled });
  await chrome.runtime.sendMessage({
    type: 'updateSettings',
    notificationsEnabled: isEnabled
  });
});

// NEW: Save the text whenever the user types something new
notifMessageInput.addEventListener('change', async (event) => {
  const newMsg = event.target.value;
  await chrome.storage.local.set({ notificationMessage: newMsg });
  await chrome.runtime.sendMessage({
    type: 'updateSettings',
    notificationMessage: newMsg
  });
});

// ==========================================
// UNIFIED START/STOP LOGIC
// ==========================================
async function triggerStart() {
  const interval = parseInt(intervalInput.value, 10) || 10;
  const duration = parseInt(durationInput.value, 10) || 60;
  const activeMode = document.querySelector('input[name="songMode"]:checked').value;
  let chosenSong = 'songs/song1.mp3'; 
  
  if (activeMode === 'default') {
    chosenSong = songSelect.value;
  } else if (activeMode === 'custom') {
    chosenSong = 'custom'; 
  }

  await chrome.runtime.sendMessage({
    type: 'updateSettings',
    intervalMinutes: interval,
    playDurationSeconds: duration,
    songMode: activeMode,
    selectedSong: chosenSong,
    notificationsEnabled: notificationToggle.checked,
    notificationMessage: notifMessageInput.value
  });
  
  await chrome.runtime.sendMessage({ type: 'start' });
  
  // Update UI components
  powerToggle.checked = true;
  updateStatus(true);
  startCountdownUI();
}

async function triggerStop() {
  await chrome.runtime.sendMessage({ type: 'stop' });
  
  // Update UI components
  powerToggle.checked = false;
  updateStatus(false);
  stopCountdownUI();
}

// Link both the Switch and the Buttons to our unified logic
startBtn.addEventListener('click', triggerStart);
stopBtn.addEventListener('click', triggerStop);

powerToggle.addEventListener('change', (event) => {
  if (event.target.checked) {
    triggerStart();
  } else {
    triggerStop();
  }
});

function updateStatus(isRunning) {
  statusDiv.textContent = isRunning ? 'Active' : 'Stopped';
  statusDiv.style.color = isRunning ? 'green' : 'red';
}

// ==========================================
// COUNTDOWN TIMER LOGIC
// ==========================================
function startCountdownUI() {
  clearInterval(countdownInterval);
  refreshCountdown();
  countdownInterval = setInterval(refreshCountdown, 1000);
}

function stopCountdownUI() {
  clearInterval(countdownInterval);
  countdownDiv.textContent = '--:--';
}

function refreshCountdown() {
  chrome.alarms.get('playAlarm', (alarm) => {
    if (!alarm) {
      countdownDiv.textContent = '--:--';
      // Reset progress bar to full when stopped
      document.querySelector('.progress-bar').style.width = '100%';
      return;
    }
    const timeRemainingMs = alarm.scheduledTime - Date.now();
    if (timeRemainingMs <= 0) {
      countdownDiv.textContent = 'Playing...';
      // Empty the progress bar when playing
      document.querySelector('.progress-bar').style.width = '0%';
      return;
    }
    
    // Calculate the time text
    const totalSeconds = Math.floor(timeRemainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    countdownDiv.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');

    // --- PROGRESS BAR LOGIC ---
    // Calculate the total duration in seconds based on the user's input
    const totalDuration = (parseInt(intervalInput.value, 10) || 10) * 60;
    // Calculate what percentage of time is remaining
    const percentage = (totalSeconds / totalDuration) * 100;
    // Update the width of the progress bar in the UI
    document.querySelector('.progress-bar').style.width = `${percentage}%`;
  });
}
// ==========================================
// INDEXEDDB LOGIC
// ==========================================
function checkCustomSongInDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('SongPlayerDB', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('songs')) {
        resolve(false);
        return;
      }
      const transaction = db.transaction(['songs'], 'readonly');
      const store = transaction.objectStore('songs');
      const getReq = store.get('customSong');
      getReq.onsuccess = () => resolve(!!getReq.result);
      getReq.onerror = () => resolve(false);
    };
    request.onerror = () => resolve(false);
  });
}

function saveSongToDB(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SongPlayerDB', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs');
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['songs'], 'readwrite');
      const store = transaction.objectStore('songs');
      store.put(file, 'customSong');
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadStatus.textContent = 'Saving to database...';
    uploadStatus.style.color = 'blue';
    try {
      await saveSongToDB(file);
      uploadStatus.textContent = 'Saved successfully: ' + file.name;
      uploadStatus.style.color = 'green';
      
      await chrome.runtime.sendMessage({
        type: 'updateSettings',
        songMode: 'custom',
        selectedSong: 'custom',
        resetTimestamp: true // NEW: Forces the background script back to 0:00!
      });
    } catch (err) {
      uploadStatus.textContent = 'Error saving song!';
      uploadStatus.style.color = 'red';
      console.error(err);
    }
  }
});
// ==========================================
// DONATION / COPY WALLET LOGIC
// ==========================================
const copyBtn = document.getElementById('copyBtn');
const walletAddress = document.getElementById('walletAddress');

if (copyBtn && walletAddress) {
  copyBtn.addEventListener('click', () => {
    // Select the text field
    walletAddress.select();
    walletAddress.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(walletAddress.value).then(() => {
      // Visual feedback
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      
      // Reset button text after 2 seconds
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  });
}