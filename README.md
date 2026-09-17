# Awasthi Anjali Reel Studio

एक सरल, browser-based reel creation system, जिसमें फोटो या वीडियो क्लिप के साथ हिंदी अथवा सामान्य संस्कृत टेक्स्ट जोड़ा जा सकेगा। टेक्स्ट स्क्रीन पर दिखाई देगा और उसी टेक्स्ट से महिला आवाज़ में स्थानीय TTS ऑडियो तैयार किया जाएगा।

अंतिम वीडियो vertical 9:16 format में export किया जा सकेगा।

---

## परियोजना का नाम

**अंजली अवस्थी**

## Repository

`awasthianjali`

---

## मुख्य उद्देश्य

इस परियोजना का उद्देश्य एक ऐसा सरल और स्थानीय रूप से चलने वाला reel studio बनाना है, जिसमें उपयोगकर्ता:

1. फोटो या वीडियो क्लिप अपलोड कर सके।
2. हिंदी अथवा सामान्य संस्कृत टेक्स्ट लिख सके।
3. टेक्स्ट को वीडियो पर प्रदर्शित कर सके।
4. उसी टेक्स्ट का TTS audio तैयार कर सके।
5. फोटो/वीडियो, टेक्स्ट और आवाज़ को एक साथ जोड़ सके।
6. अंतिम वीडियो को 9:16 vertical reel के रूप में डाउनलोड कर सके।

---

## मुख्य विशेषताएँ

- Browser-based interface
- हिंदी Unicode text support
- सामान्य संस्कृत Unicode text support
- महिला TTS voice
- फोटो और वीडियो क्लिप का उपयोग
- वीडियो पर टेक्स्ट overlay
- TTS audio और visual text का synchronization
- 9:16 vertical video output
- Preview सुविधा
- Export और download सुविधा
- Preview तथा exported video में छोटा watermark:

  **अंजली अवस्थी**

- Local processing
- कोई external API नहीं
- अलग-अलग और maintainable source files
- सरल interface और सीमित feature scope

---

## Scope

इस संस्करण में केवल निम्नलिखित कार्य शामिल हैं:

- सामान्य हिंदी TTS
- सामान्य संस्कृत TTS
- फोटो/वीडियो से reel बनाना
- टेक्स्ट overlay
- TTS audio जोड़ना
- 9:16 video export
- watermark
- local download

---

## Scope से बाहर

इस संस्करण में निम्नलिखित कार्य शामिल नहीं हैं:

- वैदिक मंत्रों के लिए विशेष स्वर-प्रशिक्षण
- उदात्त, अनुदात्त और स्वरित का advanced prosody engine
- custom neural voice training
- उपयोगकर्ता की आवाज़ से voice cloning
- बड़ी voice-recording dataset
- external cloud TTS API
- online account या server dependency
- अनावश्यक advanced video-editing features
- multi-track professional video editor
- automatic social-media publishing

---

## टेक्नोलॉजी दिशा

परियोजना को client-side browser technologies पर आधारित रखा जाएगा।

संभावित तकनीकी घटक:

- HTML
- CSS
- JavaScript
- Web Audio API
- Canvas API
- MediaRecorder API
- Local TTS engine या local TTS runtime
- आवश्यकता के अनुसार local media processing library

अंतिम TTS engine का चयन इस आधार पर किया जाएगा कि वह:

- स्थानीय रूप से चल सके
- external API पर निर्भर न हो
- हिंदी और सामान्य संस्कृत Unicode text को संभाल सके
- browser environment में व्यावहारिक रूप से उपयोग किया जा सके
- audio output उपलब्ध करा सके

---

## भाषा समर्थन

### हिंदी

हिंदी के लिए देवनागरी Unicode text का समर्थन होगा।

उदाहरण:

> आज का दिन ज्ञान, साधना और सेवा के लिए समर्पित है।

### सामान्य संस्कृत

सामान्य संस्कृत पाठ, श्लोक और छोटे स्तोत्रों के लिए देवनागरी Unicode text का समर्थन होगा।

उदाहरण:

> सर्वे भवन्तु सुखिनः।

> विद्या विनयं ददाति।

> असतो मा सद्गमय।

यह संस्करण सामान्य संस्कृत TTS के लिए है। इसे विशेष वैदिक स्वर-पाठ या शास्त्रीय वैदिक उच्चारण प्रणाली के रूप में प्रस्तुत नहीं किया जाएगा।

---

## Video Format

अंतिम reel का लक्ष्य format:

- Orientation: Portrait
- Aspect ratio: 9:16
- Recommended resolution: 1080 × 1920
- Output: Video with audio
- Watermark: `अंजली अवस्थी`

Browser और codec support के आधार पर export format WebM हो सकता है। MP4 export को तभी जोड़ा जाएगा जब local browser-compatible processing का विश्वसनीय तरीका उपलब्ध हो।

---

## प्रस्तावित User Flow

1. उपयोगकर्ता फोटो या वीडियो क्लिप चुनेगा।
2. उपयोगकर्ता हिंदी या संस्कृत टेक्स्ट लिखेगा।
3. टेक्स्ट का style और position निर्धारित होगी।
4. स्थानीय TTS engine टेक्स्ट से audio तैयार करेगा।
5. Preview में media, text, audio और watermark दिखेंगे।
6. उपयोगकर्ता reel export करेगा।
7. तैयार 9:16 video स्थानीय रूप से डाउनलोड किया जाएगा।

---

## Watermark

Preview और exported video दोनों में निम्नलिखित watermark दिखाई देगा:

```text
अंजली अवस्थी
