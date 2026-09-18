"use strict";

/*
 * Anjali Awasthi Reel Studio
 *
 * Features:
 * - Image / video selection
 * - Same-page 9:16 preview
 * - Live multicolor word-by-word text
 * - Continuous color chain across the whole thought
 * - Local browser TTS preview
 * - Video original audio mute/unmute
 * - Fullscreen preview
 * - Browser-side WebM reel export
 *
 * Important technical limitation:
 * Browser speechSynthesis does not normally expose its generated
 * voice as a reusable audio file or MediaStream. Therefore TTS can
 * be previewed locally, but it cannot honestly be inserted into
 * the exported video through speechSynthesis alone.
 */

const MAX_TEXT_LENGTH = 10000;
const PREVIEW_LINE_LIMIT = 72;

const TTS_RATE = 0.92;
const TTS_PITCH = 1;
const TTS_VOLUME = 1;

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const EXPORT_FPS = 30;

/*
 * पूरे सुविचार में रंगों का क्रम लगातार चलता है।
 * नई line पर sequence reset नहीं होता।
 */
const WORD_COLORS = [
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#c77dff",
  "#ff8fab",
];

/* ---------- DOM references ---------- */

const mediaInput = document.querySelector("#mediaInput");
const languageSelect = document.querySelector("#languageSelect");
const voiceSelect = document.querySelector("#voiceSelect");
const textInput = document.querySelector("#textInput");
const charCount = document.querySelector("#charCount");

const speakButton = document.querySelector("#speakButton");
const exportButton = document.querySelector("#exportButton");
const downloadLink = document.querySelector("#downloadLink");

const message = document.querySelector("#message");
const appStatus = document.querySelector("#appStatus");

const previewStage = document.querySelector("#previewStage");
const previewImage = document.querySelector("#previewImage");
const previewVideo = document.querySelector("#previewVideo");
const emptyPreview = document.querySelector("#emptyPreview");

const textOverlay = document.querySelector("#textOverlay");
const watermark = document.querySelector("#watermark");

const videoAudioButton = document.querySelector("#videoAudioButton");
const videoAudioIcon = document.querySelector("#videoAudioIcon");

const fullscreenButton = document.querySelector("#fullscreenButton");
const fullscreenIcon = document.querySelector("#fullscreenIcon");

const previewPlayButton = document.querySelector("#previewPlayButton");
const previewPlayIcon = document.querySelector("#previewPlayIcon");

const previewState = document.querySelector("#previewState");
const audioStatus = document.querySelector("#audioStatus");
const ttsAudio = document.querySelector("#ttsAudio");

/* ---------- State ---------- */

let mediaObjectUrl = null;
let exportedObjectUrl = null;

let selectedFile = null;
let selectedMediaType = null;

let previewLines = [];
let currentLineIndex = 0;

let currentUtterance = null;
let previewRunId = 0;
let isPreviewRunning = false;

let availableVoices = [];
let isVideoMuted = true;

/* ---------- General helpers ---------- */

function setMessage(text = "", type = "") {
  if (!message) return;

  message.textContent = text;

  message.classList.remove(
    "is-success",
    "is-warning",
    "is-error"
  );

  if (type === "success") {
    message.classList.add("is-success");
  }

  if (type === "warning") {
    message.classList.add("is-warning");
  }

  if (type === "error") {
    message.classList.add("is-error");
  }
}

function setAppStatus(text = "") {
  if (appStatus) {
    appStatus.textContent = text;
  }
}

function setPreviewState(text = "") {
  if (previewState) {
    previewState.textContent = text;
  }
}

function setAudioStatus(text = "", ready = false) {
  if (!audioStatus) return;

  audioStatus.textContent = text;
  audioStatus.classList.toggle("is-ready", ready);
}

function getText() {
  return textInput ? textInput.value : "";
}

function getLanguage() {
  return languageSelect?.value || "hi-IN";
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Character count ---------- */

function updateCharacterCount() {
  if (!textInput || !charCount) return;

  const length = textInput.value.length;

  charCount.textContent =
    `${length.toLocaleString("en-IN")} / ${MAX_TEXT_LENGTH.toLocaleString("en-IN")}`;

  charCount.classList.remove(
    "near-limit",
    "at-limit"
  );

  if (length >= MAX_TEXT_LENGTH) {
    charCount.classList.add("at-limit");
  } else if (length >= 9000) {
    charCount.classList.add("near-limit");
  }
}

/* ---------- Validation ---------- */

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
      message:
        `सुविचार अधिकतम ${MAX_TEXT_LENGTH.toLocaleString("en-IN")} वर्णों का हो सकता है।`,
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

/* ---------- Object URL cleanup ---------- */

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

/* ---------- Media loading ---------- */

function resetMediaPreview() {
  stopPreview();
  revokeMediaObjectUrl();

  selectedFile = null;
  selectedMediaType = null;

  if (previewImage) {
    previewImage.pause?.();
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

  if (videoAudioButton) {
    videoAudioButton.hidden = true;
  }

  if (fullscreenButton) {
    fullscreenButton.hidden = true;
  }

  if (previewPlayButton) {
    previewPlayButton.hidden = true;
  }

  setPreviewState("Preview तैयार नहीं है");
  setAudioStatus(
    "फोटो या वीडियो चुनने के बाद Preview Play करें।",
    false
  );

  updateExportAvailability();
}

function loadSelectedMedia(file) {
  if (!file) {
    resetMediaPreview();
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    setMessage(
      "कृपया केवल फोटो या वीडियो फाइल चुनें।",
      "error"
    );
    return;
  }

  stopPreview();
  revokeMediaObjectUrl();

  selectedFile = file;
  selectedMediaType = isImage ? "image" : "video";
  mediaObjectUrl = URL.createObjectURL(file);

  if (emptyPreview) {
    emptyPreview.hidden = true;
  }

  if (isImage) {
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

    if (videoAudioButton) {
      videoAudioButton.hidden = true;
    }

    setPreviewState(
      "फोटो तैयार है। Preview सुनने के लिए Play दबाएँ।"
    );

    setAudioStatus(
      "फोटो तैयार है। Play दबाकर TTS Preview सुनें।",
      true
    );

    setMessage(
      "फोटो सफलतापूर्वक लोड हो गई है।",
      "success"
    );
  } else {
    isVideoMuted = true;

    if (previewImage) {
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
    }

    if (previewVideo) {
      previewVideo.src = mediaObjectUrl;
      previewVideo.hidden = false;
      previewVideo.muted = true;
      previewVideo.playsInline = true;
      previewVideo.controls = false;
      previewVideo.load();
    }

    if (videoAudioButton) {
      videoAudioButton.hidden = false;
      videoAudioButton.setAttribute(
        "aria-label",
        "वीडियो की मूल आवाज़ चालू करें"
      );
      videoAudioButton.setAttribute(
        "aria-pressed",
        "false"
      );
    }

    if (videoAudioIcon) {
      videoAudioIcon.textContent = "🔇";
    }

    setPreviewState(
      "वीडियो तैयार है। Preview सुनने के लिए Play दबाएँ।"
    );

    setAudioStatus(
      "वीडियो तैयार है। मूल आवाज़ डिफॉल्ट रूप से बंद है।",
      true
    );

    setMessage(
      "वीडियो सफलतापूर्वक लोड हो गया है।",
      "success"
    );
  }

  if (fullscreenButton) {
    fullscreenButton.hidden = false;
  }

  updateExportAvailability();
}

/* ---------- Text line preparation ---------- */

function splitLongTextIntoLines(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine
        ? `${currentLine} ${word}`
        : word;

      if (
        currentLine &&
        candidate.length > PREVIEW_LINE_LIMIT
      ) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function wordCount(line) {
  return line && line.trim()
    ? line.trim().split(/\s+/).length
    : 0;
}

/*
 * पूरे सुविचार में अब तक कितने words आ चुके हैं।
 * इसी से अगली line का रंग तय होगा।
 */
function lineStartWordIndex(lineIndex) {
  if (lineIndex <= 0) {
    return 0;
  }

  let count = 0;

  for (let index = 0; index < lineIndex; index += 1) {
    count += wordCount(previewLines[index] || "");
  }

  return count;
}

/*
 * हर शब्द को अलग span में रखा जाता है।
 * Color chain पूरे सुविचार में लगातार चलती है।
 */
function createMulticolorLine(
  line,
  startWordIndex = 0
) {
  const words = String(line || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "";
  }

  return words
    .map((word, index) => {
      const colorNumber =
        ((startWordIndex + index) % WORD_COLORS.length) + 1;

      return `
        <span class="word-color-${colorNumber}">
          ${escapeHtml(word)}
        </span>
      `;
    })
    .join(" ");
}

function showLine(line, index = 0) {
  if (!textOverlay) return;

  if (!line) {
    textOverlay.innerHTML = "";
    textOverlay.hidden = true;
    return;
  }

  const startIndex = lineStartWordIndex(index);

  textOverlay.innerHTML = createMulticolorLine(
    line,
    startIndex
  );

  textOverlay.hidden = false;
  textOverlay.dataset.lineIndex = String(index);
}

function preparePreviewLines() {
  previewLines = splitLongTextIntoLines(getText());
  currentLineIndex = 0;

  if (previewLines.length) {
    showLine(previewLines[0], 0);
  } else {
    showLine("", 0);
  }
}

/*
 * Text input में लिखते ही पहली line Display पर दिखाई दे।
 * इससे Play दबाने से पहले भी text visible रहेगा।
 */
function updateLiveTextDisplay() {
  if (!textOverlay) return;

  const lines = splitLongTextIntoLines(getText());
  previewLines = lines;

  if (!lines.length) {
    textOverlay.innerHTML = "";
    textOverlay.hidden = true;
    return;
  }

  showLine(lines[0], 0);
}

/* ---------- Speech synthesis ---------- */

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    availableVoices = [];
    return;
  }

  availableVoices =
    window.speechSynthesis.getVoices() || [];
}

function getVoiceForLanguage(language) {
  if (!availableVoices.length) {
    return null;
  }

  const exact = availableVoices.find(
    (voice) =>
      voice.lang.toLowerCase() === language.toLowerCase()
  );

  if (exact) {
    return exact;
  }

  const prefix = language
    .split("-")[0]
    .toLowerCase();

  return (
    availableVoices.find((voice) =>
      voice.lang.toLowerCase().startsWith(`${prefix}-`)
    ) ||
    availableVoices.find((voice) =>
      voice.lang.toLowerCase().startsWith(prefix)
    ) ||
    null
  );
}

function stopSpeechSynthesis() {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore browser-specific cancellation errors.
    }
  }

  currentUtterance = null;
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

  isPreviewRunning = false;

  if (previewPlayButton) {
    previewPlayButton.hidden = false;
    previewPlayButton.disabled = false;
  }

  if (speakButton) {
    speakButton.disabled = false;
  }

  if (previewPlayIcon) {
    previewPlayIcon.textContent = "▶";
  }

  setAppStatus("तैयार");
  setPreviewState(
    "Preview समाप्त हो गया। फिर से चलाने के लिए Play दबाएँ।"
  );

  if (previewLines.length) {
    showLine(previewLines[0], 0);
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
      "इस browser में स्थानीय आवाज़ उपलब्ध नहीं है।",
      "error"
    );

    return;
  }

  const utterance =
    new SpeechSynthesisUtterance(line);

  const language = getLanguage();
  const voice = getVoiceForLanguage(language);

  utterance.lang = language;
  utterance.rate = TTS_RATE;
  utterance.pitch = TTS_PITCH;
  utterance.volume = TTS_VOLUME;

  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => {
    if (runId !== previewRunId) return;

    setPreviewState(
      `पंक्ति ${index + 1} / ${previewLines.length} चल रही है`
    );
  };

  utterance.onend = () => {
    if (runId !== previewRunId) return;

    speakLineAtIndex(index + 1, runId);
  };

  utterance.onerror = (event) => {
    if (runId !== previewRunId) return;

    if (
      event.error === "canceled" ||
      event.error === "interrupted"
    ) {
      return;
    }

    finishPreview(runId);

    setMessage(
      "आवाज़ चलाते समय त्रुटि हुई। कृपया फिर प्रयास करें।",
      "error"
    );
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function startVideoPreview() {
  if (
    selectedMediaType !== "video" ||
    !previewVideo
  ) {
    return;
  }

  previewVideo.currentTime = 0;
  previewVideo.muted = isVideoMuted;

  const playPromise = previewVideo.play();

  if (
    playPromise &&
    typeof playPromise.catch === "function"
  ) {
    playPromise.catch(() => {
      setMessage(
        "वीडियो स्वतः नहीं चल पाया। Play button दबाकर फिर प्रयास करें।",
        "warning"
      );
    });
  }
}

function startPreview() {
  const textResult = validateText();

  if (!textResult.valid) {
    setMessage(textResult.message, "error");
    return;
  }

  const mediaResult = validateMedia();

  if (!mediaResult.valid) {
    setMessage(mediaResult.message, "error");
    return;
  }

  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस browser में speechSynthesis उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  stopPreview();
  preparePreviewLines();

  if (!previewLines.length) {
    setMessage(
      "Preview के लिए टेक्स्ट उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  previewRunId += 1;

  const runId = previewRunId;

  isPreviewRunning = true;

  if (previewPlayButton) {
    previewPlayButton.hidden = true;
    previewPlayButton.disabled = true;
  }

  if (speakButton) {
    speakButton.disabled = true;
  }

  if (previewPlayIcon) {
    previewPlayIcon.textContent = "⏸";
  }

  setAppStatus("Preview चल रहा है…");
  setPreviewState("Preview शुरू हो रहा है…");

  setMessage(
    "दृश्य, टेक्स्ट और स्थानीय TTS Preview साथ चल रहे हैं।"
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

  isPreviewRunning = false;

  if (previewPlayButton) {
    previewPlayButton.hidden =
      !selectedMediaType || !getText().trim();

    previewPlayButton.disabled = false;
  }

  if (speakButton) {
    speakButton.disabled = false;
  }

  if (previewPlayIcon) {
    previewPlayIcon.textContent = "▶";
  }

  setAppStatus("तैयार");

  if (previewLines.length) {
    showLine(previewLines[0], 0);
  }
}

function speakTextOnly() {
  const result = validateText();

  if (!result.valid) {
    setMessage(result.message, "error");
    return;
  }

  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस browser में स्थानीय TTS सुविधा उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  if (currentUtterance) {
    stopSpeechSynthesis();

    if (speakButton) {
      speakButton.textContent = "आवाज़ सुनें";
    }

    setAppStatus("तैयार");
    setMessage("आवाज़ रोक दी गई है।");
    return;
  }

  const utterance =
    new SpeechSynthesisUtterance(
      normalizeText(getText())
    );

  const language = getLanguage();
  const voice = getVoiceForLanguage(language);

  utterance.lang = language;
  utterance.rate = TTS_RATE;
  utterance.pitch = TTS_PITCH;
  utterance.volume = TTS_VOLUME;

  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => {
    if (speakButton) {
      speakButton.textContent = "आवाज़ रोकें";
    }

    setAppStatus("आवाज़ चल रही है…");
    setMessage("स्थानीय TTS आवाज़ चल रही है।");
  };

  utterance.onend = () => {
    if (speakButton) {
      speakButton.textContent = "आवाज़ सुनें";
    }

    setAppStatus("तैयार");
    setMessage(
      "आवाज़ सुनना पूरा हो गया।",
      "success"
    );

    currentUtterance = null;
  };

  utterance.onerror = (event) => {
    if (
      event.error === "canceled" ||
      event.error === "interrupted"
    ) {
      return;
    }

    if (speakButton) {
      speakButton.textContent = "आवाज़ सुनें";
    }

    setAppStatus("तैयार");
    setMessage(
      "आवाज़ चलाते समय त्रुटि हुई।",
      "error"
    );

    currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

/* ---------- Video original audio control ---------- */

function updateVideoAudioButton() {
  if (!videoAudioButton || !videoAudioIcon) {
    return;
  }

  if (isVideoMuted) {
    videoAudioIcon.textContent = "🔇";

    videoAudioButton.setAttribute(
      "aria-label",
      "वीडियो की मूल आवाज़ चालू करें"
    );

    videoAudioButton.setAttribute(
      "title",
      "वीडियो की मूल आवाज़ चालू करें"
    );

    videoAudioButton.setAttribute(
      "aria-pressed",
      "false"
    );
  } else {
    videoAudioIcon.textContent = "🔊";

    videoAudioButton.setAttribute(
      "aria-label",
      "वीडियो की मूल आवाज़ बंद करें"
    );

    videoAudioButton.setAttribute(
      "title",
      "वीडियो की मूल आवाज़ बंद करें"
    );

    videoAudioButton.setAttribute(
      "aria-pressed",
      "true"
    );
  }
}

function toggleVideoAudio() {
  if (
    selectedMediaType !== "video" ||
    !previewVideo
  ) {
    return;
  }

  isVideoMuted = !isVideoMuted;
  previewVideo.muted = isVideoMuted;

  updateVideoAudioButton();

  setAudioStatus(
    isVideoMuted
      ? "वीडियो की मूल आवाज़ बंद है।"
      : "वीडियो की मूल आवाज़ चालू है।",
    true
  );
}

/* ---------- Fullscreen ---------- */

function updateFullscreenButton() {
  if (!fullscreenButton || !fullscreenIcon) {
    return;
  }

  const isFullscreen =
    document.fullscreenElement === previewStage;

  fullscreenIcon.textContent =
    isFullscreen ? "⛶" : "⛶";

  fullscreenButton.setAttribute(
    "aria-label",
    isFullscreen
      ? "Fullscreen बंद करें"
      : "Preview fullscreen करें"
  );

  fullscreenButton.setAttribute(
    "title",
    isFullscreen
      ? "Fullscreen बंद करें"
      : "Fullscreen"
  );
}

async function toggleFullscreen() {
  if (!previewStage) {
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (previewStage.requestFullscreen) {
      await previewStage.requestFullscreen();
    } else {
      setMessage(
        "इस browser में Fullscreen सुविधा उपलब्ध नहीं है।",
        "warning"
      );
    }
  } catch (error) {
    setMessage(
      `Fullscreen शुरू नहीं हो सका: ${error.message}`,
      "error"
    );
  }

  updateFullscreenButton();
}

/* ---------- Export helpers ---------- */

function updateExportAvailability() {
  /*
   * Export तभी enable होगा जब media और text दोनों मौजूद हों।
   * Export में selected media + synchronized visible text render होगा।
   */
  const canExport =
    Boolean(selectedFile) &&
    Boolean(selectedMediaType) &&
    Boolean(getText().trim()) &&
    Boolean(window.MediaRecorder) &&
    Boolean(
      HTMLCanvasElement.prototype.captureStream
    );

  if (exportButton) {
    exportButton.disabled = !canExport;
    exportButton.title = canExport
      ? "9:16 Reel Export करें"
      : "पहले फोटो/वीडियो और सुविचार चुनें";
  }
}

function pickRecorderMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  return (
    types.find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) || ""
  );
}

function drawCover(
  context,
  source,
  width,
  height
) {
  const sourceWidth =
    source.videoWidth ||
    source.naturalWidth ||
    source.width;

  const sourceHeight =
    source.videoHeight ||
    source.naturalHeight ||
    source.height;

  if (!sourceWidth || !sourceHeight) {
    context.fillStyle = "#050816";
    context.fillRect(0, 0, width, height);
    return;
  }

  const sourceRatio =
    sourceWidth / sourceHeight;

  const targetRatio =
    width / height;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  context.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    width,
    height
  );
}

function getExportFontSize(line) {
  const length = String(line || "").length;

  if (length <= 24) return 76;
  if (length <= 38) return 66;
  if (length <= 52) return 56;
  if (length <= 66) return 48;

  return 42;
}

/*
 * Canvas पर हर word अलग रंग में draw होता है।
 * startWordIndex continuous color chain बनाए रखता है।
 */
function drawMulticolorLine(
  context,
  line,
  startWordIndex = 0
) {
  if (!line) return;

  const words = String(line)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return;

  const fontSize = getExportFontSize(line);

  context.font =
    `800 ${fontSize}px "Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif`;

  context.textBaseline = "middle";
  context.textAlign = "left";

  const spaceWidth =
    context.measureText(" ").width;

  const wordWidths = words.map((word) =>
    context.measureText(word).width
  );

  const totalWidth =
    wordWidths.reduce(
      (sum, width) => sum + width,
      0
    ) +
    spaceWidth * (words.length - 1);

  let x =
    (EXPORT_WIDTH - totalWidth) / 2;

  const y = EXPORT_HEIGHT * 0.76;

  context.shadowColor =
    "rgba(0, 0, 0, 0.72)";

  context.shadowBlur = 18;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 3;

  words.forEach((word, index) => {
    context.fillStyle =
      WORD_COLORS[
        (startWordIndex + index) %
          WORD_COLORS.length
      ];

    context.fillText(word, x, y);

    x +=
      wordWidths[index] + spaceWidth;
  });

  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

function drawTopWatermark(context) {
  const fontSize = 26;

  context.font =
    `700 ${fontSize}px "Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif`;

  context.textAlign = "right";
  context.textBaseline = "top";

  context.fillStyle =
    "rgba(255, 255, 255, 0.82)";

  context.shadowColor =
    "rgba(0, 0, 0, 0.75)";

  context.shadowBlur = 8;

  /*
   * Watermark ऊपर दाएँ कोने में।
   */
  context.fillText(
    "अंजली अवस्थी",
    EXPORT_WIDTH - 38,
    38
  );

  context.shadowBlur = 0;
}

function drawExportFrame(
  context,
  source,
  line,
  lineIndex
) {
  context.clearRect(
    0,
    0,
    EXPORT_WIDTH,
    EXPORT_HEIGHT
  );

  context.fillStyle = "#050816";

  context.fillRect(
    0,
    0,
    EXPORT_WIDTH,
    EXPORT_HEIGHT
  );

  drawCover(
    context,
    source,
    EXPORT_WIDTH,
    EXPORT_HEIGHT
  );

  drawMulticolorLine(
    context,
    line,
    lineStartWordIndex(lineIndex)
  );

  drawTopWatermark(context);
}

function waitForVideoMetadata(video) {
  return new Promise((resolve, reject) => {
    if (
      video.readyState >= 1 &&
      video.videoWidth &&
      video.videoHeight
    ) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(
        new Error("वीडियो metadata लोड नहीं हो सका।")
      );
    };

    const cleanup = () => {
      video.removeEventListener(
        "loadedmetadata",
        onLoaded
      );

      video.removeEventListener(
        "error",
        onError
      );
    };

    video.addEventListener(
      "loadedmetadata",
      onLoaded,
      { once: true }
    );

    video.addEventListener(
      "error",
      onError,
      { once: true }
    );
  });
}

function getMediaDuration() {
  if (selectedMediaType === "video" && previewVideo) {
    return Number.isFinite(previewVideo.duration) &&
      previewVideo.duration > 0
      ? previewVideo.duration
      : 5;
  }

  /*
   * Photo reel के लिए TTS duration उपलब्ध नहीं होने पर
   * सुरक्षित default duration रखा गया है।
   */
  return 10;
}

function getLineAtProgress(progress) {
  if (!previewLines.length) {
    return {
      line: "",
      index: 0,
    };
  }

  const safeProgress =
    Math.min(0.999999, Math.max(0, progress));

  const index = Math.min(
    previewLines.length - 1,
    Math.floor(
      safeProgress * previewLines.length
    )
  );

  return {
    line: previewLines[index],
    index,
  };
}

async function exportReel() {
  const textResult = validateText();
  const mediaResult = validateMedia();

  if (!textResult.valid) {
    setMessage(textResult.message, "error");
    return;
  }

  if (!mediaResult.valid) {
    setMessage(mediaResult.message, "error");
    return;
  }

  if (
    !window.MediaRecorder ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    setMessage(
      "इस browser में video export सुविधा उपलब्ध नहीं है। Chrome या Edge के नवीनतम संस्करण में प्रयास करें।",
      "error"
    );
    return;
  }

  const mimeType = pickRecorderMimeType();

  if (!mimeType) {
    setMessage(
      "इस browser में समर्थित WebM recording format उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  preparePreviewLines();

  if (!previewLines.length) {
    setMessage(
      "Export के लिए टेक्स्ट उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  const canvas =
    document.createElement("canvas");

  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;

  const context =
    canvas.getContext("2d");

  if (!context) {
    setMessage(
      "Canvas उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  const source =
    selectedMediaType === "video"
      ? previewVideo
      : previewImage;

  if (!source) {
    setMessage(
      "Export media उपलब्ध नहीं है।",
      "error"
    );
    return;
  }

  if (selectedMediaType === "video") {
    try {
      await waitForVideoMetadata(source);
    } catch (error) {
      setMessage(error.message, "error");
      return;
    }
  }

  revokeExportedObjectUrl();

  if (exportButton) {
    exportButton.disabled = true;
  }

  setAppStatus("Reel render हो रही है…");
  setMessage(
    "9:16 Reel render की जा रही है। कृपया इस पेज को बंद न करें।"
  );

  const canvasStream =
    canvas.captureStream(EXPORT_FPS);

  const outputStream =
    new MediaStream(
      canvasStream.getVideoTracks()
    );

  /*
   * Video का original audio तभी जोड़ा जाएगा जब
   * video captureStream उपलब्ध हो और audio track मिले।
   */
  let sourceStream = null;

  try {
    if (
      selectedMediaType === "video" &&
      typeof source.captureStream === "function"
    ) {
      sourceStream = source.captureStream();

      sourceStream
        .getAudioTracks()
        .forEach((track) => {
          outputStream.addTrack(track);
        });
    }

    const recorder =
      new MediaRecorder(
        outputStream,
        {
          mimeType,
          videoBitsPerSecond: 6_000_000,
        }
      );

    const chunks = [];

    const recorderFinished =
      new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = () => {
          reject(
            recorder.error ||
              new Error("MediaRecorder में त्रुटि हुई।")
          );
        };

        recorder.onstop = () => {
          resolve();
        };
      });

    const duration = getMediaDuration();

    let startedAt = performance.now();
    let animationFrameId = 0;

    if (selectedMediaType === "video") {
      source.currentTime = 0;
      source.muted = isVideoMuted;

      const playPromise = source.play();

      if (
        playPromise &&
        typeof playPromise.catch === "function"
      ) {
        await playPromise.catch(() => {
          throw new Error(
            "वीडियो export playback शुरू नहीं हो सका।"
          );
        });
      }
    }

    recorder.start(250);

    const render = () => {
      const elapsed =
        (performance.now() - startedAt) / 1000;

      const progress =
        Math.min(1, elapsed / duration);

      const current =
        getLineAtProgress(progress);

      drawExportFrame(
        context,
        source,
        current.line,
        current.index
      );

      if (progress < 1) {
        animationFrameId =
          requestAnimationFrame(render);
      } else {
        recorder.stop();
      }
    };

    render();

    await recorderFinished;

    cancelAnimationFrame(animationFrameId);

    if (selectedMediaType === "video") {
      source.pause();
      source.currentTime = 0;
    }

    const blob =
      new Blob(chunks, {
        type: mimeType,
      });

    if (!blob.size) {
      throw new Error(
        "Export file खाली बनी है।"
      );
    }

    exportedObjectUrl =
      URL.createObjectURL(blob);

    if (downloadLink) {
      downloadLink.href = exportedObjectUrl;
      downloadLink.download =
        "anjali-awasthi-reel.webm";
      downloadLink.hidden = false;
      downloadLink.textContent =
        "रील डाउनलोड करें";
    }

    setAppStatus("Reel तैयार है");
    setMessage(
      "9:16 Reel तैयार हो गई है। Download link पर क्लिक करें।",
      "success"
    );
  } catch (error) {
    setMessage(
      `Reel Export नहीं हो सका: ${error.message}`,
      "error"
    );

    setAppStatus("तैयार");
  } finally {
    if (sourceStream) {
      sourceStream
        .getTracks()
        .forEach((track) => track.stop());
    }

    canvasStream
      .getTracks()
      .forEach((track) => track.stop());

    if (selectedMediaType === "video" && source) {
      source.pause();
    }

    updateExportAvailability();
  }
}

/* ---------- Input handlers ---------- */

function handleTextInput() {
  updateCharacterCount();
  updateLiveTextDisplay();

  if (getText().length > MAX_TEXT_LENGTH) {
    setMessage(
      `सुविचार अधिकतम ${MAX_TEXT_LENGTH.toLocaleString("en-IN")} वर्णों का हो सकता है।`,
      "error"
    );
    return;
  }

  if (getText().trim()) {
    setMessage("");
  }

  if (previewPlayButton) {
    previewPlayButton.hidden =
      !selectedMediaType ||
      !getText().trim();
  }

  updateExportAvailability();
}

function handleLanguageChange() {
  stopPreview();
  stopSpeechSynthesis();

  if (speakButton) {
    speakButton.textContent = "आवाज़ सुनें";
  }

  setMessage(
    "भाषा बदल दी गई है। आवाज़ सुनने के लिए फिर से बटन दबाएँ।"
  );
}

function handleVoiceChange() {
  stopPreview();
  stopSpeechSynthesis();

  if (speakButton) {
    speakButton.textContent = "आवाज़ सुनें";
  }

  setMessage(
    "आवाज़ विकल्प बदल दिया गया है।"
  );
}

/* ---------- Event listeners ---------- */

if (mediaInput) {
  mediaInput.addEventListener("change", (event) => {
    const file =
      event.target.files?.[0] || null;

    loadSelectedMedia(file);
  });
}

if (textInput) {
  textInput.addEventListener(
    "input",
    handleTextInput
  );
}

if (languageSelect) {
  languageSelect.addEventListener(
    "change",
    handleLanguageChange
  );
}

if (voiceSelect) {
  voiceSelect.addEventListener(
    "change",
    handleVoiceChange
  );
}

if (speakButton) {
  speakButton.addEventListener(
    "click",
    speakTextOnly
  );
}

if (previewPlayButton) {
  previewPlayButton.addEventListener(
    "click",
    startPreview
  );
}

if (videoAudioButton) {
  videoAudioButton.addEventListener(
    "click",
    toggleVideoAudio
  );
}

if (fullscreenButton) {
  fullscreenButton.addEventListener(
    "click",
    toggleFullscreen
  );
}

if (exportButton) {
  exportButton.addEventListener(
    "click",
    exportReel
  );
}

document.addEventListener(
  "fullscreenchange",
  updateFullscreenButton
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden && isPreviewRunning) {
      stopPreview();

      setMessage(
        "पेज छिपने के कारण Preview रोक दिया गया।"
      );
    }
  }
);

window.addEventListener(
  "beforeunload",
  () => {
    stopPreview();
    revokeMediaObjectUrl();
    revokeExportedObjectUrl();
  }
);

/* ---------- Initialization ---------- */

function initialize() {
  updateCharacterCount();
  updateLiveTextDisplay();
  loadVoices();
  updateVideoAudioButton();
  updateFullscreenButton();
  updateExportAvailability();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged =
      loadVoices;
  }

  setAppStatus("तैयार");
  setPreviewState("Preview तैयार नहीं है");
}

initialize();
