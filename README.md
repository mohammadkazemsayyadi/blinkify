# Blinkify: 20-20-20 Eye Care & Break Timer

A lightweight Chrome Extension designed to mitigate computer vision syndrome (digital eye strain) by enforcing customizable break intervals. Built with vanilla JavaScript, HTML, and CSS.

## ✨ Features

* **Customizable Timers:** Users can define specific work intervals and break durations tailored to their workflow.
* **Local Audio Persistence:** Integrates `IndexedDB` to allow users to securely upload and store custom `.mp3` break alerts locally without hitting browser quota limits.
* **Reliable Background Execution:** Utilizes the Chrome `chrome.alarms` API to trigger events precisely, ensuring timers run reliably even when the service worker goes to sleep.
* **Offscreen Audio Playback:** Leverages the Manifest V3 `chrome.offscreen` API for uninterrupted audio playback and event handling.
* **Dynamic UI State:** Real-time synchronization of countdowns, progress bars, and toggle states between the background script and the popup using `chrome.storage.local`.
* **Smart Notifications:** Priority system alerts that pop up over other windows with customizable prompt messages.

## 🛠️ Built With

* Vanilla JavaScript (ES6+)
* HTML5 & CSS3
* Chrome Extension API (Manifest V3)

## 🚀 Installation (Developer Mode)

1. Clone this repository to your local machine:
   ```bash
   git clone [https://github.com/yourusername/blinkify-chrome-extension.git](https://github.com/yourusername/blinkify-chrome-extension.git)
