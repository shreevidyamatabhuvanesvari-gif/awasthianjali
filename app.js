const mediaInput = document.getElementById("mediaInput");
const languageSelect = document.getElementById("languageSelect");
const textInput = document.getElementById("textInput");

const previewImage = document.getElementById("previewImage");
const previewVideo = document.getElementById("previewVideo");
const previewStage = document.getElementById("previewStage");
const textOverlay = document.getElementById("textOverlay");
const emptyPreview = document.getElementById("emptyPreview");

const speakButton = document.getElementById("speakButton");
const exportButton = document.getElementById("exportButton");

const ttsAudio = document.getElementById("ttsAudio");
const downloadLink = document.getElementById("downloadLink");

const charCount = document.getElementById("charCount");
const appStatus = document.getElementById("appStatus");
const message = document.getElementById("message");

let mediaUrl = "";

function setMessage(text = "", type = "") {
  message.textContent = text;
  message.dataset.type = type;
}

function setStatus(text) {
  appStatus.textContent = text;
}

function updateText() {
  const text = textInput.value.trim();

  textOverlay.textContent = text;
  charCount.textContent = `${textInput.value.length} / ${textInput.maxLength}`;

  if (!text) {
    textOverlay.hidden = true;
  } else {
    textOverlay.hidden = false;
  }

  updateControls();
}

function updateControls() {
  const hasMedia =
    !previewImage.hidden || !previewVideo.hidden;

  const hasText = textInput.value.trim().length > 0;

  speakButton.disabled = !hasText;
  exportButton.disabled = true;

  if (!hasMedia) {
    setStatus("मीडिया चुनें");
  } else if (!hasText) {
    setStatus("टेक्स्ट लिखें");
  } else {
    setStatus("तैयार");
  }
}

function clearMediaUrl() {
  if (mediaUrl) {
    URL.revokeObjectURL(mediaUrl);
    mediaUrl = "";
  }
}

function resetPreview() {
  previewImage.hidden = true;
  previewVideo.hidden = true;
  previewImage.removeAttribute("src");
  previewVideo.removeAttribute("src");

  emptyPreview.hidden = false;
  clearMediaUrl();
}

function showImage(file) {
  clearMediaUrl();

  mediaUrl = URL.createObjectURL(file);
  previewImage.src = mediaUrl;
  previewImage.hidden = false;
  previewVideo.hidden = true;
  emptyPreview.hidden = true;

  setStatus("फोटो तैयार");
  setMessage("");
}

function showVideo(file) {
  clearMediaUrl();

  mediaUrl = URL.createObjectURL(file);
  previewVideo.src = mediaUrl;
  previewVideo.hidden = false;
  previewImage.hidden = true;
  emptyPreview.hidden = true;

  previewVideo.currentTime = 0;
  previewVideo.load();

  setStatus("वीडियो तैयार");
  setMessage("");
}

function handleMediaChange() {
  const file = mediaInput.files?.[0];

  if (!file) {
    resetPreview();
    updateControls();
    return;
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    mediaInput.value = "";
    resetPreview();
    setStatus("मीडिया चुनें");
    setMessage("केवल फोटो या वीडियो फाइल चुनें।", "error");
    updateControls();
    return;
  }

  if (file.type.startsWith("image/")) {
    showImage(file);
  } else {
    showVideo(file);
  }

  updateControls();
}

function getSpeechLanguage() {
  return languageSelect.value === "sa-IN"
    ? "sa-IN"
    : "hi-IN";
}

function findVoice(language) {
  if (!("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();

  const exact = voices.find(
    voice => voice.lang.toLowerCase() === language.toLowerCase()
  );

  if (exact) {
    return exact;
  }

  const base = language.slice(0, 2).toLowerCase();

  return voices.find(
    voice => voice.lang.toLowerCase().startsWith(base)
  ) || null;
}

function speakText() {
  const text = textInput.value.trim();

  if (!text) {
    setMessage("पहले टेक्स्ट लिखें।", "error");
    textInput.focus();
    return;
  }

  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस browser में स्थानीय speech synthesis उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechLanguage();

  const voice = findVoice(utterance.lang);

  if (voice) {
    utterance.voice = voice;
  }

  // Natural baseline; device voice engine determines the final timbre.
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    setStatus("आवाज़ चल रही है");
    setMessage("TTS playback शुरू हो गया।");
    speakButton.disabled = true;
  };

  utterance.onend = () => {
    updateControls();
    setMessage("TTS playback पूरा हुआ।", "success");
  };

  utterance.onerror = event => {
    updateControls();
    setMessage(
      `TTS playback शुरू नहीं हो सका: ${event.error || "अज्ञात त्रुटि"}`,
      "error"
    );
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeechOnUnload() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

textInput.addEventListener("input", updateText);
mediaInput.addEventListener("change", handleMediaChange);
speakButton.addEventListener("click", speakText);

languageSelect.addEventListener("change", () => {
  window.speechSynthesis?.cancel();
  updateControls();
});

previewStage.addEventListener("dblclick", () => {
  if (!previewVideo.hidden && previewVideo.paused) {
    previewVideo.play().catch(() => {});
  }
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = updateControls;
}

window.addEventListener("beforeunload", stopSpeechOnUnload);

resetPreview();
updateText();

void ttsAudio;
void downloadLink;
