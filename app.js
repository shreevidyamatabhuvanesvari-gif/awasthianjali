"use strict";

/*
 * Anjali Awasthi Reel Studio
 *
 * Responsibilities:
 * - Image/video preview
 * - Text validation and character count
 * - Local browser TTS preview
 * - One visible text line at a time
 * - Multicolor text rendering
 * - Preview play button handling
 * - Safe cleanup of object URLs
 *
 * Important limitation:
 * Browser speechSynthesis can play speech locally, but it does not
 * normally expose the generated speech as an audio file or audio stream.
 * Therefore, this file does not pretend to create a final audio-video
 * export from speechSynthesis alone.
 */

const MAX_TEXT_LENGTH = 10000;
const PREVIEW_LINE_LIMIT = 72;
const TTS_RATE = 0.92;
const TTS_PITCH = 1;
const TTS_VOLUME = 1;

const mediaInput = document.querySelector("#mediaInput");
const languageSelect = document.querySelector("#languageSelect");
const textInput = document.querySelector("#textInput");
const charCount = document.querySelector("#charCount");
const speakButton = document.querySelector("#speakButton");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");
const message = document.querySelector("#message");
const appStatus = document.querySelector("#appStatus");

const previewImage = document.querySelector("#previewImage");
const previewVideo = document.querySelector("#previewVideo");
const emptyPreview = document.querySelector("#emptyPreview");
const textOverlay = document.querySelector("#textOverlay");
const watermark = document.querySelector("#watermark");
const previewPlayButton = document.querySelector("#previewPlayButton");
const previewPlayIcon = document.querySelector("#previewPlayIcon");
const previewState = document.querySelector("#previewState");
const ttsAudio = document.querySelector("#ttsAudio");

let mediaObjectUrl = null;
let exportedObjectUrl = null;

let selectedMediaType = null;
let selectedFile = null;

let previewLines = [];
let currentLineIndex = 0;
let currentUtterance = null;
let previewRunId = 0;
let isPreviewRunning = false;

let availableVoices = [];

function getElement(selector) {
  return document.querySelector(selector);
}

function setMessage(text, type = "info") {
  if (!message) {
    return;
  }

  message.textContent = text;
  message.dataset.type = type;
}

function setAppStatus(text, type = "info") {
  if (!appStatus) {
    return;
  }

  appStatus.textContent = text;
  appStatus.dataset.type = type;
}

function setPreviewState(text) {
  if (!previewState) {
    return;
  }

  previewState.textContent = text;
}

function updateCharacterCount() {
  if (!textInput || !charCount) {
    return;
  }

  const length = textInput.value.length;
  charCount.textContent = `${length.toLocaleString("en-IN")} / ${MAX_TEXT_LENGTH.toLocaleString("en-IN")}`;

  if (length > MAX_TEXT_LENGTH) {
    charCount.dataset.state = "error";
  } else {
    charCount.dataset.state = "normal";
  }
}

function getText() {
  return textInput ? textInput.value : "";
}

function getLanguage() {
  return languageSelect && languageSelect.value
    ? languageSelect.value
    : "hi-IN";
}

function validateText() {
  const text = getText();

  if (!text.trim()) {
    return {
      valid: false,
      message: "कृपया पहले सुविचार लिखें।",
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      message: `सुविचार अधिकतम ${MAX_TEXT_LENGTH.toLocaleString("en-IN")} वर्णों का हो सकता है।`,
    };
  }

  return {
    valid: true,
    message: "",
  };
}

function validateMedia() {
  if (!selectedFile || !selectedMediaType) {
    return {
      valid: false,
      message: "कृपया पहले कोई फोटो या वीडियो चुनें।",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

function validatePreviewInputs() {
  const textResult = validateText();

  if (!textResult.valid) {
    return textResult;
  }

  const mediaResult = validateMedia();

  if (!mediaResult.valid) {
    return mediaResult;
  }

  return {
    valid: true,
    message: "",
  };
}

function revokeMediaObjectUrl() {
  if (mediaObjectUrl) {
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  }
}

function revokeExportedObjectUrl() {
  if (exportedObjectUrl) {
    URL.revokeObjectURL(exportedObjectUrl);
    exportedObjectUrl = null;
  }
}

function resetMediaPreview() {
  if (previewImage) {
    previewImage.hidden = true;
    previewImage.removeAttribute("src");
  }

  if (previewVideo) {
    previewVideo.pause();
    previewVideo.hidden = true;
    previewVideo.removeAttribute("src");
    previewVideo.load();
  }

  if (emptyPreview) {
    emptyPreview.hidden = false;
  }

  selectedMediaType = null;
  selectedFile = null;
}

function loadSelectedMedia(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    resetMediaPreview();
    setMessage("केवल फोटो या वीडियो फाइल चुनें।", "error");
    return;
  }

  stopPreview();

  revokeMediaObjectUrl();

  selectedFile = file;
  mediaObjectUrl = URL.createObjectURL(file);

  if (emptyPreview) {
    emptyPreview.hidden = true;
  }

  if (file.type.startsWith("image/")) {
    selectedMediaType = "image";

    if (previewVideo) {
      previewVideo.pause();
      previewVideo.hidden = true;
      previewVideo.removeAttribute("src");
      previewVideo.load();
    }

    if (previewImage) {
      previewImage.src = mediaObjectUrl;
      previewImage.alt = file.name || "चुनी गई फोटो";
      previewImage.hidden = false;
    }

    setPreviewState("फोटो तैयार है। Preview सुनने के लिए Play दबाएँ।");
    setMessage("फोटो सफलतापूर्वक लोड हो गई है।", "success");
  } else {
    selectedMediaType = "video";

    if (previewImage) {
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
    }

    if (previewVideo) {
      previewVideo.src = mediaObjectUrl;
      previewVideo.hidden = false;
      previewVideo.muted = true;
      previewVideo.playsInline = true;
      previewVideo.load();
    }

    setPreviewState("वीडियो तैयार है। Preview सुनने के लिए Play दबाएँ।");
    setMessage("वीडियो सफलतापूर्वक लोड हो गया है।", "success");
  }

  updateExportAvailability();
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function splitLongTextIntoLines(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const sourceParagraphs = normalized
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const lines = [];

  for (const paragraph of sourceParagraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLine = "";

    for (const word of words) {
      const proposedLine = currentLine
        ? `${currentLine} ${word}`
        : word;

      if (
        currentLine &&
        proposedLine.length > PREVIEW_LINE_LIMIT
      ) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = proposedLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function createMulticolorLine(line) {
  const safeText = String(line)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  return safeText;
}

function showLine(line, index) {
  if (!textOverlay) {
    return;
  }

  if (!line) {
    textOverlay.textContent = "";
    textOverlay.hidden = true;
    return;
  }

  textOverlay.innerHTML = createMulticolorLine(line);
  textOverlay.hidden = false;
  textOverlay.dataset.lineIndex = String(index);
}

function preparePreviewLines() {
  previewLines = splitLongTextIntoLines(getText());
  currentLineIndex = 0;

  if (previewLines.length > 0) {
    showLine(previewLines[0], 0);
  } else {
    showLine("", 0);
  }
}

function getVoiceForLanguage(language) {
  if (!availableVoices.length) {
    return null;
  }

  const exactVoice = availableVoices.find(
    (voice) => voice.lang.toLowerCase() === language.toLowerCase()
  );

  if (exactVoice) {
    return exactVoice;
  }

  const languagePrefix = language.split("-")[0].toLowerCase();

  return (
    availableVoices.find((voice) =>
      voice.lang.toLowerCase().startsWith(languagePrefix)
    ) || null
  );
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    availableVoices = [];
    return;
  }

  availableVoices = window.speechSynthesis.getVoices();
}

function stopSpeechSynthesis() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  currentUtterance = null;
}

function setPreviewButtonRunning(running) {
  isPreviewRunning = running;

  if (previewPlayButton) {
    previewPlayButton.hidden = running;
    previewPlayButton.disabled = running;
  }

  if (speakButton) {
    speakButton.disabled = running;
  }

  if (running) {
    setAppStatus("Preview चल रहा है…", "active");
  } else {
    setAppStatus("तैयार", "ready");
  }
}

function finishPreview(runId) {
  if (runId !== previewRunId) {
    return;
  }

  stopSpeechSynthesis();

  if (selectedMediaType === "video" && previewVideo) {
    previewVideo.pause();
    previewVideo.currentTime = 0;
  }

  currentLineIndex = 0;
  setPreviewButtonRunning(false);
  setPreviewState("Preview समाप्त हो गया। फिर से चलाने के लिए Play दबाएँ।");

  if (previewLines.length > 0) {
    showLine(previewLines[0], 0);
  } else {
    showLine("", 0);
  }
}

function speakLineAtIndex(index, runId) {
  if (runId !== previewRunId) {
    return;
  }

  if (index >= previewLines.length) {
    finishPreview(runId);
    return;
  }

  const line = previewLines[index];

  currentLineIndex = index;
  showLine(line, index);

  if (!("speechSynthesis" in window)) {
    finishPreview(runId);
    setMessage(
      "इस ब्राउज़र में स्थानीय आवाज़ सुनाने की सुविधा उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  const utterance = new SpeechSynthesisUtterance(line);
  const language = getLanguage();
  const selectedVoice = getVoiceForLanguage(language);

  utterance.lang = language;
  utterance.rate = TTS_RATE;
  utterance.pitch = TTS_PITCH;
  utterance.volume = TTS_VOLUME;

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    if (runId !== previewRunId) {
      return;
    }

    setPreviewState(
      `पंक्ति ${index + 1} / ${previewLines.length} चल रही है`
    );
  };

  utterance.onend = () => {
    if (runId !== previewRunId) {
      return;
    }

    speakLineAtIndex(index + 1, runId);
  };

  utterance.onerror = (event) => {
    if (runId !== previewRunId) {
      return;
    }

    if (event.error === "canceled" || event.error === "interrupted") {
      return;
    }

    finishPreview(runId);
    setMessage(
      "आवाज़ चलाते समय ब्राउज़र ने त्रुटि दी। कृपया फिर प्रयास करें।",
      "error"
    );
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function startVideoPreview() {
  if (selectedMediaType !== "video" || !previewVideo) {
    return;
  }

  previewVideo.currentTime = 0;
  previewVideo.muted = true;

  const playResult = previewVideo.play();

  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {
      setMessage(
        "वीडियो स्वतः नहीं चल पाया। ब्राउज़र की अनुमति जाँचें।",
        "error"
      );
    });
  }
}

function startPreview() {
  const validation = validatePreviewInputs();

  if (!validation.valid) {
    setMessage(validation.message, "error");
    return;
  }

  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस ब्राउज़र में speechSynthesis उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  stopPreview();

  preparePreviewLines();

  if (!previewLines.length) {
    setMessage("Preview के लिए कोई टेक्स्ट उपलब्ध नहीं है।", "error");
    return;
  }

  previewRunId += 1;
  const runId = previewRunId;

  setPreviewButtonRunning(true);
  setPreviewState("Preview शुरू हो रहा है…");
  setMessage(
    "Preview में दृश्य, टेक्स्ट और स्थानीय आवाज़ साथ चलेंगे।",
    "info"
  );

  startVideoPreview();
  speakLineAtIndex(0, runId);
}

function stopPreview() {
  previewRunId += 1;
  stopSpeechSynthesis();

  if (previewVideo) {
    previewVideo.pause();
  }

  setPreviewButtonRunning(false);

  if (previewLines.length > 0) {
    showLine(previewLines[0], 0);
  }
}

function speakTextOnly() {
  const textResult = validateText();

  if (!textResult.valid) {
    setMessage(textResult.message, "error");
    return;
  }

  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस ब्राउज़र में स्थानीय आवाज़ सुनाने की सुविधा उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  if (isPreviewRunning) {
    stopPreview();
    setMessage("आवाज़ सुनना रोक दिया गया है।", "info");
    return;
  }

  stopSpeechSynthesis();

  const utterance = new SpeechSynthesisUtterance(normalizeText(getText()));
  const language = getLanguage();
  const selectedVoice = getVoiceForLanguage(language);

  utterance.lang = language;
  utterance.rate = TTS_RATE;
  utterance.pitch = TTS_PITCH;
  utterance.volume = TTS_VOLUME;

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    if (speakButton) {
      speakButton.textContent = "आवाज़ रोकें";
    }

    setAppStatus("आवाज़ चल रही है…", "active");
    setMessage("टेक्स्ट की स्थानीय आवाज़ चल रही है।", "info");
  };

  utterance.onend = () => {
    if (speakButton) {
      speakButton.textContent = "आवाज़ सुनें";
    }

    setAppStatus("तैयार", "ready");
    setMessage("आवाज़ सुनना पूरा हो गया।", "success");
    currentUtterance = null;
  };

  utterance.onerror = (event) => {
    if (event.error === "canceled" || event.error === "interrupted") {
      return;
    }

    if (speakButton) {
      speakButton.textContent = "आवाज़ सुनें";
    }

    setAppStatus("तैयार", "ready");
    setMessage(
      "आवाज़ चलाते समय त्रुटि हुई। कृपया फिर प्रयास करें।",
      "error"
    );
    currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function updateExportAvailability() {
  /*
   * Deliberately disabled:
   *
   * speechSynthesis does not provide a reliable audio file/stream that
   * can be merged into a final video using only this browser API.
   *
   * Do not enable this button until a real local audio capture/render
   * workflow has been implemented and verified.
   */
  if (exportButton) {
    exportButton.disabled = true;
    exportButton.title =
      "वास्तविक audio-video export workflow अभी उपलब्ध नहीं है।";
  }

  if (downloadLink) {
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
  }
}

function handleExportClick() {
  /*
   * This is intentionally not a fake export.
   * A final reel must contain:
   * - selected image/video
   * - actual audio track
   * - synchronized text
   * - 9:16 composition
   * - watermark
   *
   * speechSynthesis alone cannot reliably provide an exportable audio
   * track. Therefore no empty or silent video is generated here.
   */
  setMessage(
    "रील एक्सपोर्ट अभी सक्रिय नहीं है, क्योंकि स्थानीय speechSynthesis की आवाज़ को वास्तविक audio track के रूप में सुरक्षित करके वीडियो में जोड़ना आवश्यक है।",
    "info"
  );
}

function handleTextInput() {
  updateCharacterCount();

  if (getText().length > MAX_TEXT_LENGTH) {
    setMessage(
      `सुविचार अधिकतम ${MAX_TEXT_LENGTH.toLocaleString("en-IN")} वर्णों का हो सकता है।`,
      "error"
    );
  } else {
    setMessage("", "info");
  }

  updateExportAvailability();
}

function handleLanguageChange() {
  stopPreview();
  stopSpeechSynthesis();

  setMessage(
    "भाषा बदल दी गई है। आवाज़ सुनने के लिए फिर से बटन दबाएँ।",
    "info"
  );
}

function handlePageVisibilityChange() {
  if (document.hidden && isPreviewRunning) {
    stopPreview();
    setMessage("पेज छिपने के कारण Preview रोक दिया गया।", "info");
  }
}

function initialize() {
  updateCharacterCount();
  loadVoices();
  updateExportAvailability();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  if (mediaInput) {
    mediaInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      loadSelectedMedia(file);
    });
  }

  if (textInput) {
    textInput.addEventListener("input", handleTextInput);
  }

  if (languageSelect) {
    languageSelect.addEventListener("change", handleLanguageChange);
  }

  if (speakButton) {
    speakButton.addEventListener("click", () => {
      if (currentUtterance) {
        stopSpeechSynthesis();

        if (speakButton) {
          speakButton.textContent = "आवाज़ सुनें";
        }

        setAppStatus("तैयार", "ready");
        setMessage("आवाज़ सुनना रोक दिया गया है।", "info");
        currentUtterance = null;
        return;
      }

      speakTextOnly();
    });
  }

  if (previewPlayButton) {
    previewPlayButton.addEventListener("click", startPreview);
  }

  if (exportButton) {
    exportButton.addEventListener("click", handleExportClick);
  }

  document.addEventListener(
    "visibilitychange",
    handlePageVisibilityChange
  );

  window.addEventListener("beforeunload", () => {
    stopPreview();
    revokeMediaObjectUrl();
    revokeExportedObjectUrl();
  });

  setAppStatus("तैयार", "ready");
}

initialize();
