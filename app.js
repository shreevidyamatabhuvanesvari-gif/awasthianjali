const $ = (id) => document.getElementById(id);

const mediaInput = $("mediaInput");
const languageSelect = $("languageSelect");
const textInput = $("textInput");
const charCount = $("charCount");
const speakButton = $("speakButton");
const exportButton = $("exportButton");
const message = $("message");
const appStatus = $("appStatus");

const previewStage = $("previewStage");
const previewImage = $("previewImage");
const previewVideo = $("previewVideo");
const textOverlay = $("textOverlay");
const previewPlayButton = $("previewPlayButton");
const previewPlayIcon = $("previewPlayIcon");
const emptyPreview = $("emptyPreview");
const ttsAudio = $("ttsAudio");
const downloadLink = $("downloadLink");

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const MAX_TEXT_LENGTH = 10000;
const PREVIEW_FONT_FAMILY = '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif';
const LINE_MAX_RATIO = 0.84;

// पूरे सुविचार में color chain लगातार चलती है।
// नई visible line शुरू होने पर color sequence reset नहीं होता।
const WORD_COLORS = [
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#c77dff",
  "#ff8fab",
];

const state = {
  mediaUrl: "",
  mediaKind: "",
  sourceFile: null,
  lines: [],
  currentLine: -1,
  speaking: false,
  previewing: false,
  speechRunId: 0,
  voicesReady: false,
  exportAudioReady: false,
  exportBlob: null,
  recorderMimeType: "",
  videoFrameRequest: 0,
};

function setStatus(text) {
  appStatus.textContent = text;
}

function setMessage(text = "", type = "") {
  message.textContent = text;
  message.className = `message${type ? ` ${type}` : ""}`;
}

function unicodeLength(value) {
  return Array.from(value).length;
}

function updateCharCount() {
  const length = unicodeLength(textInput.value);

  charCount.textContent = `${length.toLocaleString("en-IN")} / 10,000`;

  charCount.classList.toggle("near-limit", length >= 9000);
  charCount.classList.toggle("at-limit", length >= MAX_TEXT_LENGTH);
}

function sanitizeText(value) {
  return value.replace(/\r\n?/g, "\n");
}

function chooseVoice(lang) {
  if (!("speechSynthesis" in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const exact = voices.find(
    (voice) => voice.lang.toLowerCase() === lang.toLowerCase()
  );

  if (exact) return exact;

  const base = lang.split("-")[0].toLowerCase();

  return (
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(`${base}-`)
    ) ||
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(base)
    ) ||
    null
  );
}

function splitLongLine(line, maxWidth) {
  const words = line.trim().split(/\s+/).filter(Boolean);

  if (!words.length) return [];

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) return [line.trim()];

  const style = getComputedStyle(textOverlay);
  const fontSize = Number.parseFloat(style.fontSize) || 30;
  const fontWeight = style.fontWeight || "700";

  context.font = `${fontWeight} ${fontSize}px ${PREVIEW_FONT_FAMILY}`;

  const result = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (
      current &&
      context.measureText(candidate).width > maxWidth
    ) {
      result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

function buildLines() {
  const raw = sanitizeText(textInput.value);

  if (!raw.trim()) return [];

  const maxWidth = Math.max(
    240,
    (previewStage.clientWidth || 430) * LINE_MAX_RATIO
  );

  const sourceLines = raw.split("\n");
  const result = [];

  for (const sourceLine of sourceLines) {
    if (!sourceLine.trim()) continue;

    result.push(
      ...splitLongLine(sourceLine, maxWidth)
    );
  }

  return result.filter(Boolean);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordCount(line) {
  return line.trim()
    ? line.trim().split(/\s+/).length
    : 0;
}

/*
 * दिए गए line के पहले कितने words आ चुके हैं।
 * इससे अगली line में color sequence वहीं से जारी रहती है।
 */
function lineStartWordIndex(index) {
  if (index <= 0) return 0;

  let count = 0;

  for (let i = 0; i < index; i += 1) {
    count += wordCount(state.lines[i] || "");
  }

  return count;
}

/*
 * Preview के लिए हर word को अलग span मिलता है।
 * startWordIndex पूरे thought की continuous color chain बनाए रखता है।
 */
function createMulticolorLine(line, startWordIndex = 0) {
  const words = line
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";

  return words
    .map((word, index) => {
      const colorClass =
        ((startWordIndex + index) % WORD_COLORS.length) + 1;

      return `<span class="word-color-${colorClass}">${escapeHtml(word)}</span>`;
    })
    .join(" ");
}

function setOverlayLine(index) {
  state.currentLine = index;

  if (index >= 0 && state.lines[index]) {
    textOverlay.innerHTML = createMulticolorLine(
      state.lines[index],
      lineStartWordIndex(index)
    );

    textOverlay.dataset.lineIndex = String(index);
  } else {
    textOverlay.innerHTML = "";
    textOverlay.removeAttribute("data-line-index");
  }
}

function resetOverlay() {
  state.currentLine = -1;
  textOverlay.textContent = "";
}

function revokeMediaUrl() {
  if (!state.mediaUrl) return;

  URL.revokeObjectURL(state.mediaUrl);
  state.mediaUrl = "";
}

function stopSourceVideo() {
  previewVideo.pause();
  previewVideo.onended = null;
  previewVideo.currentTime = 0;
}

function clearMediaPreview() {
  stopSourceVideo();
  revokeMediaUrl();

  state.sourceFile = null;
  state.mediaKind = "";

  previewImage.hidden = true;
  previewVideo.hidden = true;

  previewImage.removeAttribute("src");
  previewVideo.removeAttribute("src");

  emptyPreview.hidden = false;
  previewPlayButton.hidden = true;

  resetOverlay();
}

function loadMedia(file) {
  stopPreview();
  clearMediaPreview();

  if (!file) {
    updateExportState();
    setStatus("तैयार");
    return;
  }

  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/")
  ) {
    setMessage(
      "कृपया केवल फोटो या वीडियो चुनें।",
      "error"
    );
    return;
  }

  state.sourceFile = file;

  state.mediaKind = file.type.startsWith("image/")
    ? "image"
    : "video";

  state.mediaUrl = URL.createObjectURL(file);

  if (state.mediaKind === "image") {
    previewImage.src = state.mediaUrl;
    previewImage.hidden = false;
    previewImage.alt = "रील प्रिव्यू मीडिया";

    previewImage.onload = () => {
      emptyPreview.hidden = true;
      previewPlayButton.hidden = !hasUsableText();

      setStatus("फोटो तैयार है");
      setMessage(
        "Preview चलाकर टेक्स्ट और स्थानीय आवाज़ साथ सुनें।"
      );
    };

    previewImage.onerror = () => {
      setMessage(
        "फोटो लोड नहीं हो सकी।",
        "error"
      );

      clearMediaPreview();
    };
  } else {
    previewVideo.src = state.mediaUrl;
    previewVideo.hidden = false;
    previewVideo.load();

    previewVideo.onloadedmetadata = () => {
      emptyPreview.hidden = true;
      previewPlayButton.hidden = !hasUsableText();

      setStatus("वीडियो तैयार है");
      setMessage(
        "Preview चलाकर टेक्स्ट और स्थानीय आवाज़ साथ सुनें।"
      );
    };

    previewVideo.onerror = () => {
      setMessage(
        "वीडियो लोड नहीं हो सका।",
        "error"
      );

      clearMediaPreview();
    };
  }

  updateExportState();
}

function hasUsableText() {
  return textInput.value.trim().length > 0;
}

function stopSpeech() {
  state.speechRunId += 1;
  state.speaking = false;

  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Best effort.
    }
  }
}

function stopPreview() {
  state.previewing = false;

  stopSpeech();
  stopSourceVideo();

  previewPlayIcon.textContent = "▶";

  previewPlayButton.hidden =
    !state.mediaKind || !hasUsableText();

  resetOverlay();
}

/*
 * Browser local SpeechSynthesis के माध्यम से lines को क्रम से बोलता है।
 * Preview होने पर current line visible रहती है।
 */
function speakLines({ preview = false } = {}) {
  if (!("speechSynthesis" in window)) {
    setMessage(
      "इस browser में स्थानीय Speech Synthesis उपलब्ध नहीं है।",
      "error"
    );

    return Promise.resolve(false);
  }

  const text = textInput.value.trim();

  if (!text) {
    setMessage(
      "पहले सुविचार / टेक्स्ट लिखें।",
      "error"
    );

    return Promise.resolve(false);
  }

  const lang = languageSelect.value;
  const voice = chooseVoice(lang);

  if (!voice) {
    setMessage(
      `${
        lang === "hi-IN" ? "हिंदी" : "संस्कृत"
      } के लिए इस browser में कोई स्थानीय TTS voice उपलब्ध नहीं है।`,
      "error"
    );

    return Promise.resolve(false);
  }

  state.lines = buildLines();

  if (!state.lines.length) {
    setMessage(
      "सुविचार में बोलने योग्य टेक्स्ट नहीं है।",
      "error"
    );

    return Promise.resolve(false);
  }

  stopSpeech();

  const runId = state.speechRunId;
  state.speaking = true;

  return new Promise((resolve) => {
    let index = 0;

    const finish = (ok) => {
      if (runId !== state.speechRunId) {
        resolve(false);
        return;
      }

      state.speaking = false;
      resolve(ok);
    };

    const speakNext = () => {
      if (runId !== state.speechRunId) {
        finish(false);
        return;
      }

      if (index >= state.lines.length) {
        if (preview) {
          setOverlayLine(-1);
        }

        finish(true);
        return;
      }

      if (preview) {
        setOverlayLine(index);
      }

      const utterance =
        new SpeechSynthesisUtterance(
          state.lines[index]
        );

      utterance.lang = lang;
      utterance.voice = voice;
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        index += 1;
        speakNext();
      };

      utterance.onerror = (event) => {
        const reason =
          event?.error || "unknown";

        if (
          reason === "canceled" ||
          reason === "interrupted"
        ) {
          finish(false);
          return;
        }

        setMessage(
          `TTS playback में त्रुटि हुई: ${reason}`,
          "error"
        );

        finish(false);
      };

      try {
        window.speechSynthesis.speak(
          utterance
        );
      } catch (error) {
        setMessage(
          `TTS playback शुरू नहीं हो सका: ${error.message}`,
          "error"
        );

        finish(false);
      }
    };

    speakNext();
  });
}

async function listenOnly() {
  if (state.speaking || state.previewing) {
    return;
  }

  setMessage("आवाज़ चल रही है…");
  setStatus("आवाज़ चल रही है");

  speakButton.disabled = true;

  const ok = await speakLines({
    preview: false,
  });

  speakButton.disabled = false;

  if (ok) {
    setMessage("आवाज़ पूरी हो गई।");
    setStatus("तैयार");
  } else if (!state.speaking) {
    setStatus("तैयार");
  }
}

async function playPreview() {
  if (state.previewing) {
    return;
  }

  if (!state.mediaKind) {
    setMessage(
      "पहले फोटो या वीडियो चुनें।",
      "error"
    );

    return;
  }

  if (!hasUsableText()) {
    setMessage(
      "पहले सुविचार / टेक्स्ट लिखें।",
      "error"
    );

    return;
  }

  const lang = languageSelect.value;

  if (!chooseVoice(lang)) {
    setMessage(
      `${
        lang === "hi-IN" ? "हिंदी" : "संस्कृत"
      } के लिए इस browser में कोई स्थानीय TTS voice उपलब्ध नहीं है।`,
      "error"
    );

    return;
  }

  stopSpeech();

  state.previewing = true;
  state.lines = buildLines();

  resetOverlay();

  previewPlayButton.hidden = true;
  previewPlayIcon.textContent = "⏸";

  setStatus("Preview चल रहा है");
  setMessage(
    "Visual और TTS आवाज़ साथ चल रही है…"
  );

  const videoLoop = () => {
    if (
      !state.previewing ||
      state.mediaKind !== "video"
    ) {
      return;
    }

    if (previewVideo.ended) {
      try {
        previewVideo.currentTime = 0;
        void previewVideo.play();
      } catch {
        // Speech flow remains authoritative.
      }
    }

    state.videoFrameRequest =
      requestAnimationFrame(videoLoop);
  };

  if (state.mediaKind === "video") {
    try {
      previewVideo.currentTime = 0;
      await previewVideo.play();

      state.videoFrameRequest =
        requestAnimationFrame(videoLoop);
    } catch (error) {
      state.previewing = false;

      previewPlayButton.hidden = false;
      previewPlayIcon.textContent = "▶";

      setStatus("तैयार");

      setMessage(
        `वीडियो Preview शुरू नहीं हो सका: ${error.message}`,
        "error"
      );

      return;
    }
  }

  const ok = await speakLines({
    preview: true,
  });

  cancelAnimationFrame(
    state.videoFrameRequest
  );

  state.videoFrameRequest = 0;

  stopSourceVideo();

  state.previewing = false;

  previewPlayIcon.textContent = "▶";
  previewPlayButton.hidden = false;

  resetOverlay();

  setStatus("तैयार");

  if (ok) {
    setMessage("Preview पूरा हो गया।");
  }
}

function getMediaElement() {
  return state.mediaKind === "video"
    ? previewVideo
    : previewImage;
}

function hasRealAudioSource() {
  if (
    ttsAudio.srcObject instanceof MediaStream
  ) {
    return (
      ttsAudio.srcObject.getAudioTracks().length > 0
    );
  }

  return Boolean(
    ttsAudio.currentSrc || ttsAudio.src
  );
}

function audioIsReady() {
  if (!hasRealAudioSource()) {
    return false;
  }

  return (
    Number.isFinite(ttsAudio.duration) &&
    ttsAudio.duration > 0
  );
}

function updateExportState() {
  state.exportAudioReady =
    audioIsReady();

  exportButton.disabled = !(
    state.mediaKind &&
    state.lines.length &&
    state.exportAudioReady
  );

  if (!state.exportAudioReady) {
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
  }
}

function pickRecorderMimeType(hasAudio) {
  const candidates = hasAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
    : [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];

  return (
    candidates.find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) || ""
  );
}

function drawCover(ctx, element) {
  const sourceWidth =
    element.videoWidth ||
    element.naturalWidth ||
    element.width;

  const sourceHeight =
    element.videoHeight ||
    element.naturalHeight ||
    element.height;

  if (!sourceWidth || !sourceHeight) {
    return;
  }

  const sourceRatio =
    sourceWidth / sourceHeight;

  const targetRatio =
    EXPORT_WIDTH / EXPORT_HEIGHT;

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

  ctx.drawImage(
    element,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    EXPORT_WIDTH,
    EXPORT_HEIGHT
  );
}

/*
 * Reel export में भी वही continuous word-color chain लागू होती है।
 * प्रत्येक word canvas पर अपने अलग रंग में draw होता है।
 */
function drawMulticolorLine(
  ctx,
  line,
  startWordIndex = 0
) {
  if (!line) return;

  const fontSize = Math.min(
    76,
    Math.max(
      34,
      76 - Math.max(0, line.length - 26) * 0.65
    )
  );

  ctx.font = `700 ${fontSize}px ${PREVIEW_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const words = line
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return;

  const gap = ctx.measureText(" ").width;

  const widths = words.map((word) =>
    ctx.measureText(word).width
  );

  const totalWidth =
    widths.reduce(
      (sum, width) => sum + width,
      0
    ) +
    gap *
      Math.max(0, words.length - 1);

  let x =
    (EXPORT_WIDTH - totalWidth) / 2;

  const y = EXPORT_HEIGHT * 0.77;

  ctx.shadowColor =
    "rgba(0, 0, 0, 0.62)";

  ctx.shadowBlur = 18;

  words.forEach((word, index) => {
    ctx.fillStyle =
      WORD_COLORS[
        (startWordIndex + index) %
          WORD_COLORS.length
      ];

    ctx.fillText(word, x, y);

    x +=
      widths[index] + gap;
  });

  ctx.shadowBlur = 0;
}

function drawWatermark(ctx) {
  const fontSize = 24;

  ctx.font =
    `600 ${fontSize}px ${PREVIEW_FONT_FAMILY}`;

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  ctx.fillStyle =
    "rgba(255,255,255,0.72)";

  ctx.fillText(
    "अंजली अवस्थी",
    EXPORT_WIDTH - 38,
    EXPORT_HEIGHT - 30
  );
}

function parseLineTimings() {
  const raw =
    ttsAudio.dataset.lineTimings || "";

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        start: Number(item?.start),
        end: Number(item?.end),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.start) &&
          Number.isFinite(item.end) &&
          item.end > item.start
      );
  } catch {
    return [];
  }
}

function lineIndexForTime(
  timings,
  seconds
) {
  if (!timings.length) {
    return -1;
  }

  const index = timings.findIndex(
    (item) =>
      seconds >= item.start &&
      seconds < item.end
  );

  if (index >= 0) {
    return index;
  }

  if (
    seconds >=
    timings[timings.length - 1].end
  ) {
    return timings.length - 1;
  }

  return 0;
}

function resetDownload() {
  if (state.exportBlob) {
    state.exportBlob = null;
  }

  downloadLink.hidden = true;
  downloadLink.removeAttribute("href");
}

async function exportReel() {
  if (exportButton.disabled) {
    setMessage(
      "रील एक्सपोर्ट के लिए वास्तविक TTS audio track उपलब्ध नहीं है।",
      "error"
    );

    return;
  }

  if (
    !window.MediaRecorder ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    setMessage(
      "इस browser में local video recording API उपलब्ध नहीं है।",
      "error"
    );

    return;
  }

  const timings =
    parseLineTimings();

  if (
    timings.length !== state.lines.length
  ) {
    setMessage(
      "Export रोक दिया गया है: वास्तविक TTS audio के line timings उपलब्ध नहीं हैं। अनुमानित timing का उपयोग नहीं किया जाएगा।",
      "error"
    );

    return;
  }

  const canvas =
    document.createElement("canvas");

  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    setMessage(
      "Export canvas उपलब्ध नहीं है।",
      "error"
    );

    return;
  }

  resetDownload();

  exportButton.disabled = true;

  setStatus(
    "Reel render हो रही है"
  );

  setMessage(
    "रील को browser के अंदर render किया जा रहा है…"
  );

  const mediaElement =
    getMediaElement();

  const canvasStream =
    canvas.captureStream(30);

  const outputStream =
    new MediaStream(
      canvasStream.getVideoTracks()
    );

  let audioCleanup = null;

  try {
    if (
      typeof ttsAudio.captureStream !==
      "function"
    ) {
      throw new Error(
        "Audio captureStream इस browser में उपलब्ध नहीं है।"
      );
    }

    const audioStream =
      ttsAudio.captureStream();

    audioStream
      .getAudioTracks()
      .forEach((track) =>
        outputStream.addTrack(track)
      );

    audioCleanup = () =>
      audioStream
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

    const mimeType =
      pickRecorderMimeType(
        outputStream.getAudioTracks()
          .length > 0
      );

    if (!mimeType) {
      throw new Error(
        "समर्थित WebM recording format उपलब्ध नहीं है।"
      );
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

    const recorderDone =
      new Promise(
        (resolve, reject) => {
          recorder.ondataavailable =
            (event) => {
              if (event.data?.size) {
                chunks.push(
                  event.data
                );
              }
            };

          recorder.onerror = () =>
            reject(
              recorder.error ||
                new Error(
                  "MediaRecorder error."
                )
            );

          recorder.onstop = () =>
            resolve();
        }
      );

    ttsAudio.currentTime = 0;

    if (state.mediaKind === "video") {
      previewVideo.currentTime = 0;
      await previewVideo.play();
    }

    await ttsAudio.play();

    let exportFrame = 0;

    const renderFrame = () => {
      const currentTime =
        ttsAudio.currentTime;

      ctx.fillStyle = "#000";

      ctx.fillRect(
        0,
        0,
        EXPORT_WIDTH,
        EXPORT_HEIGHT
      );

      drawCover(
        ctx,
        mediaElement
      );

      const currentLineIndex =
        lineIndexForTime(
          timings,
          currentTime
        );

      /*
       * महत्वपूर्ण:
       * currentLine के पहले वाले सभी words की गिनती
       * करके उसी point से color chain जारी होती है।
       */
      drawMulticolorLine(
        ctx,
        state.lines[
          currentLineIndex
        ] || "",
        lineStartWordIndex(
          currentLineIndex
        )
      );

      drawWatermark(ctx);

      if (
        state.mediaKind === "video" &&
        previewVideo.ended &&
        !ttsAudio.ended
      ) {
        try {
          previewVideo.currentTime = 0;
          void previewVideo.play();
        } catch {
          // Last available video frame पर rendering जारी रखें।
        }
      }

      if (
        !ttsAudio.paused &&
        !ttsAudio.ended
      ) {
        exportFrame =
          requestAnimationFrame(
            renderFrame
          );
      }
    };

    recorder.start(250);

    renderFrame();

    await new Promise(
      (resolve) => {
        const end = () =>
          resolve();

        if (ttsAudio.ended) {
          end();
        } else {
          ttsAudio.addEventListener(
            "ended",
            end,
            { once: true }
          );
        }
      }
    );

    cancelAnimationFrame(
      exportFrame
    );

    recorder.stop();

    await recorderDone;

    const blob = new Blob(
      chunks,
      { type: mimeType }
    );

    if (!blob.size) {
      throw new Error(
        "Export file खाली बन गई।"
      );
    }

    state.exportBlob = blob;
    state.recorderMimeType =
      mimeType;

    const url =
      URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download =
      "anjali-awasthi-reel.webm";

    downloadLink.hidden = false;

    downloadLink.textContent =
      "रील डाउनलोड करें";

    setStatus("Reel तैयार है");

    setMessage(
      "रील browser में तैयार हो गई है।"
    );
  } catch (error) {
    setMessage(
      `Reel Export नहीं हो सका: ${error.message}`,
      "error"
    );

    setStatus("तैयार");
  } finally {
    try {
      ttsAudio.pause();
      ttsAudio.currentTime = 0;
    } catch {
      // Best effort reset.
    }

    if (audioCleanup) {
      audioCleanup();
    }

    canvasStream
      .getTracks()
      .forEach((track) =>
        track.stop()
      );

    updateExportState();
  }
}

function attachTtsAudioSource(
  source,
  lineTimings
) {
  if (
    !(source instanceof Blob) &&
    typeof source !== "string"
  ) {
    throw new TypeError(
      "TTS source must be a Blob or URL string."
    );
  }

  if (
    !Array.isArray(lineTimings) ||
    lineTimings.length !==
      state.lines.length
  ) {
    throw new Error(
      "प्रत्येक visible line के लिए वास्तविक start/end timing आवश्यक है।"
    );
  }

  ttsAudio.pause();

  if (ttsAudio.src) {
    URL.revokeObjectURL(
      ttsAudio.src
    );
  }

  ttsAudio.removeAttribute(
    "src"
  );

  ttsAudio.dataset.lineTimings =
    JSON.stringify(
      lineTimings
    );

  if (source instanceof Blob) {
    ttsAudio.src =
      URL.createObjectURL(
        source
      );
  } else {
    ttsAudio.src = source;
  }

  ttsAudio.load();
}

function handleTtsAudioReady() {
  updateExportState();
}

function handleTextChange() {
  updateCharCount();

  resetOverlay();

  state.lines =
    buildLines();

  previewPlayButton.hidden =
    !state.mediaKind ||
    !hasUsableText();

  updateExportState();
}

function refreshVoices() {
  state.voicesReady =
    "speechSynthesis" in window &&
    window.speechSynthesis
      .getVoices()
      .length > 0;
}

function removeLegacyDurationControl() {
  const durationInput =
    $("durationInput");

  if (!durationInput) return;

  const field =
    durationInput.closest(
      ".field"
    );

  if (field) {
    field.remove();
  } else {
    durationInput.remove();
  }
}

mediaInput.addEventListener(
  "change",
  (event) => {
    loadMedia(
      event.target.files?.[0] ||
        null
    );
  }
);

textInput.addEventListener(
  "input",
  handleTextChange
);

languageSelect.addEventListener(
  "change",
  () => {
    stopPreview();

    setMessage(
      "भाषा बदल दी गई है। Preview से नई भाषा जाँचें।"
    );
  }
);

speakButton.addEventListener(
  "click",
  listenOnly
);

previewPlayButton.addEventListener(
  "click",
  playPreview
);

exportButton.addEventListener(
  "click",
  exportReel
);

ttsAudio.addEventListener(
  "loadedmetadata",
  handleTtsAudioReady
);

ttsAudio.addEventListener(
  "durationchange",
  handleTtsAudioReady
);

window.addEventListener(
  "beforeunload",
  () => {
    stopPreview();

    revokeMediaUrl();

    if (
      ttsAudio.src?.startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(
        ttsAudio.src
      );
    }
  }
);

if (
  "speechSynthesis" in window
) {
  window.speechSynthesis.addEventListener(
    "voiceschanged",
    refreshVoices
  );

  refreshVoices();
} else {
  speakButton.disabled = true;
}

removeLegacyDurationControl();

updateCharCount();

state.lines =
  buildLines();

updateExportState();

setStatus("तैयार");

window.reelStudio =
  Object.freeze({
    attachTtsAudioSource,
    stopPreview,

    getState: () => ({
      mediaKind:
        state.mediaKind,

      lines: [
        ...state.lines,
      ],

      speaking:
        state.speaking,

      previewing:
        state.previewing,

      exportAudioReady:
        state.exportAudioReady,
    }),
  });
