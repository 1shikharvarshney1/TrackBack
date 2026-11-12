const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// Persistent plate recognition cache
const CACHE_DIR = path.join(__dirname, '..', 'uploads', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'plate_cache.json');

const plateCache = new Map();

// Initialize cache from disk if available
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      plateCache.set(k, v);
    }
  }
} catch (e) {
  // Ignore corrupted cache and proceed with fresh map
}

function persistCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const obj = Object.fromEntries(plateCache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) {
    // Non-fatal cache persist failure
  }
}

function computeImageHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

let dailyQuotaExceeded = false;

async function cropVehicleLowerRegion(framePath, bbox, outputPath) {
  const [x, y, w, h] = bbox;
  const metadata = await sharp(framePath).metadata();

  const cropTop = Math.max(0, Math.min(metadata.height - 10, y + Math.floor(h * 0.35)));
  const cropLeft = Math.max(0, Math.min(metadata.width - 10, x));
  const cropWidth = Math.max(10, Math.min(metadata.width - cropLeft, w));
  const cropHeight = Math.max(10, Math.min(metadata.height - cropTop, Math.floor(h * 0.65)));

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const croppedBuffer = await sharp(framePath)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  await sharp(croppedBuffer).toFile(outputPath);
  return croppedBuffer;
}

async function requestGeminiOcr(base64Image) {
  if (process.env.MOCK_GEMINI === 'true') {
    return { plate: 'TEST9999' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  if (!apiKey || apiKey === 'your_gemini_api_key') {
    return { plate: null, unconfigured: true };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const promptText =
    'Extract the vehicle registration/license number plate text from this cropped vehicle image. ' +
    'Return ONLY a JSON object in this exact schema: {"plate": "PLATE_TEXT"}. ' +
    'If no license plate is legible or visible, return {"plate": null}. Do not guess or invent letters.';

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    const error = new Error(`Gemini API error (${response.status}): ${errText}`);
    error.status = response.status;
    error.bodyText = errText;
    throw error;
  }

  const data = await response.json();
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) return { plate: null };

  const parsed = JSON.parse(candidateText.trim());
  if (!parsed.plate) return { plate: null };

  const cleanPlate = parsed.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return { plate: cleanPlate.length >= 3 ? cleanPlate : null };
}

async function readPlate(imageBuffer, options = {}) {
  const { allowApiCall = true } = options;
  const hash = computeImageHash(imageBuffer);

  // Return cached plate text if already processed
  if (plateCache.has(hash)) {
    return {
      plate: plateCache.get(hash),
      cached: true,
      calledApi: false
    };
  }

  // If API call disallowed by caller (e.g. video call cap reached)
  if (!allowApiCall) {
    return {
      plate: 'unreadable',
      cached: false,
      calledApi: false,
      reason: 'CALL_LIMIT_REACHED'
    };
  }

  // If daily quota was already hit during this process lifecycle, skip API call
  if (dailyQuotaExceeded) {
    console.warn('Gemini daily quota previously exhausted. Skipping call and marking unreadable.');
    plateCache.set(hash, 'unreadable');
    persistCache();
    return {
      plate: 'unreadable',
      cached: false,
      calledApi: false,
      reason: 'DAILY_QUOTA_EXCEEDED'
    };
  }

  const base64Image = imageBuffer.toString('base64');
  let result = null;

  try {
    result = await requestGeminiOcr(base64Image);
  } catch (err) {
    const is429 = err.status === 429;
    const bodyLower = (err.bodyText || '').toLowerCase();
    const isDailyQuota =
      is429 &&
      (bodyLower.includes('quota') ||
        bodyLower.includes('resource_exhausted') ||
        bodyLower.includes('limit') ||
        bodyLower.includes('perday') ||
        bodyLower.includes('per_day'));

    if (is429) {
      if (isDailyQuota || !err.bodyText) {
        // Daily quota error: do NOT retry
        dailyQuotaExceeded = true;
        console.warn('Gemini 429 Daily Quota Exceeded. Not retrying. Marking plate as unreadable.');
        plateCache.set(hash, 'unreadable');
        persistCache();
        return {
          plate: 'unreadable',
          cached: false,
          calledApi: true,
          error: err.message
        };
      }
    }

    // Check if temporary server error eligible for single retry with backoff
    const isTemporary = [500, 502, 503, 504].includes(err.status);
    if (isTemporary) {
      console.warn(`Temporary Gemini error (${err.status}). Retrying once after 1.5s backoff...`);
      await new Promise((r) => setTimeout(r, 1500));
      try {
        result = await requestGeminiOcr(base64Image);
      } catch (retryErr) {
        console.warn('Gemini retry failed:', retryErr.message);
        plateCache.set(hash, 'unreadable');
        persistCache();
        return {
          plate: 'unreadable',
          cached: false,
          calledApi: true,
          error: retryErr.message
        };
      }
    } else {
      console.warn('Gemini OCR request failed:', err.message);
      plateCache.set(hash, 'unreadable');
      persistCache();
      return {
        plate: 'unreadable',
        cached: false,
        calledApi: true,
        error: err.message
      };
    }
  }

  const finalPlate = result?.plate || 'unreadable';
  plateCache.set(hash, finalPlate);
  persistCache();

  return {
    plate: finalPlate,
    cached: false,
    calledApi: true
  };
}

module.exports = {
  cropVehicleLowerRegion,
  readPlate,
  computeImageHash,
  plateCache
};
