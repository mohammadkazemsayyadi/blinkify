const audio = document.getElementById('audio');
audio.loop = true; // NEW: Makes the song loop seamlessly if it reaches the end!

let stopTimer = null;
let currentObjectUrl = null; 

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'play') {
    playForDuration(msg.duration, msg.songPath, msg.startTime, msg.volume);
  } else if (msg.action === 'stop') {
    stopPlayback(true);
  }else if (msg.action === 'setVolume') {
    //Allows real-time adjustments while playing
    audio.volume = msg.volume; 
  }
});

function getSongFromDB() {
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
      const transaction = db.transaction(['songs'], 'readonly');
      const store = transaction.objectStore('songs');
      
      const getReq = store.get('customSong'); 

      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = (e) => reject(e.target.error);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

async function playForDuration(durationMs, songPath, startTime, volume) {
  stopPlayback(); 
  
  try {
    if (songPath === 'custom') {
      const fileBlob = await getSongFromDB();
      
      if (!fileBlob) {
        console.warn("No custom song found in database! User needs to upload one.");
        return;
      }
      
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }

      currentObjectUrl = URL.createObjectURL(fileBlob);
      audio.src = currentObjectUrl;
    } else {
      audio.src = songPath; 
    }

    await new Promise((resolve) => {
      if (audio.readyState >= 1) { 
        resolve();
      } else {
        audio.onloadedmetadata = () => {
          resolve();
          audio.onloadedmetadata = null; 
        };
      }
    });

    // FIX: Math to prevent the timestamp from exceeding the song length!
    // If the song is 100 seconds long, and we try to start at 120, this wraps it back to 20.
    let safeStartTime = startTime || 0;
    if (audio.duration && safeStartTime >= audio.duration) {
        safeStartTime = safeStartTime % audio.duration;
    }

    audio.currentTime = safeStartTime;
    audio.volume = volume !== undefined ? volume : 0.5;
    await audio.play();

    stopTimer = setTimeout(() => {
      stopPlayback(true); // Cleaned this up to use our unified stop function
    }, durationMs);
    
  } catch (err) {
    console.error('Playback failed:', err);
  }
}

function stopPlayback(isFinalStop = false) {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  
  // FIX: ALWAYS save the timestamp when the player stops, no matter what!
  chrome.runtime.sendMessage({ 
    type: 'saveTimestamp', 
    timestamp: audio.currentTime 
  });
  
  audio.pause();

  
  // ONLY reset the icon if it is a real stop, not a cleanup!
  if (isFinalStop) {
    chrome.runtime.sendMessage({ type: 'audioEnded' });
  }
}