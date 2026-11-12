const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');
const sharp = require('sharp');

const MODEL_PATH = path.join(__dirname, '..', 'models', 'yolov8n.onnx');
const VEHICLE_CLASSES = {
  2: 'car',
  3: 'motorcycle',
  5: 'bus',
  7: 'truck'
};

let session = null;

async function getSession() {
  if (session) return session;

  if (!fs.existsSync(MODEL_PATH)) {
    console.error('\n======================================================');
    console.error('ERROR: YOLOv8n ONNX model missing at server/models/yolov8n.onnx');
    console.error('Download it directly using:');
    console.error('  curl -L -o server/models/yolov8n.onnx https://huggingface.co/SpotLab/YOLOv8Detection/resolve/3005c6751fb19cdeb6b10c066185908faf66a097/yolov8n.onnx');
    console.error('Or export via Python ultralytics:');
    console.error('  python -c "from ultralytics import YOLO; YOLO(\'yolov8n.pt\').export(format=\'onnx\')"');
    console.error('======================================================\n');
    throw new Error('YOLOv8n ONNX model file not found at ' + MODEL_PATH);
  }

  session = await ort.InferenceSession.create(MODEL_PATH);
  return session;
}

function calculateIoU(boxA, boxB) {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;

  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - intersection;
  return union > 0 ? intersection / union : 0;
}

function nonMaxSuppression(boxes, iouThreshold = 0.45) {
  boxes.sort((a, b) => b.score - a.score);
  const picked = [];

  for (const box of boxes) {
    let keep = true;
    for (const p of picked) {
      if (calculateIoU(box.bbox, p.bbox) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) picked.push(box);
  }
  return picked;
}

async function detectVehicles(imagePath, confThreshold = 0.35) {
  const sess = await getSession();

  const metadata = await sharp(imagePath).metadata();
  const origW = metadata.width;
  const origH = metadata.height;

  const { data: rawRgb } = await sharp(imagePath)
    .resize(640, 640, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const floatData = new Float32Array(3 * 640 * 640);
  const planeSize = 640 * 640;

  for (let i = 0; i < planeSize; i++) {
    floatData[i] = rawRgb[i * 3] / 255.0; // R
    floatData[planeSize + i] = rawRgb[i * 3 + 1] / 255.0; // G
    floatData[planeSize * 2 + i] = rawRgb[i * 3 + 2] / 255.0; // B
  }

  const tensor = new ort.Tensor('float32', floatData, [1, 3, 640, 640]);
  const output = await sess.run({ images: tensor });
  const output0 = output.output0.data;

  const numAnchors = 8400;

  // Check whether model outputs normalized coordinates (0..1) or pixel coordinates (0..640)
  let isNormalized = true;
  for (let i = 0; i < 200; i++) {
    if (output0[0 * numAnchors + i] > 1.0 || output0[2 * numAnchors + i] > 1.0) {
      isNormalized = false;
      break;
    }
  }

  const scaleX = isNormalized ? origW : origW / 640;
  const scaleY = isNormalized ? origH : origH / 640;

  const candidates = [];

  for (let i = 0; i < numAnchors; i++) {
    let bestScore = 0;
    let bestClass = -1;

    for (const classIdStr of Object.keys(VEHICLE_CLASSES)) {
      const classId = parseInt(classIdStr, 10);
      const score = output0[(classId + 4) * numAnchors + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = classId;
      }
    }

    if (bestScore >= confThreshold) {
      const cx = output0[0 * numAnchors + i];
      const cy = output0[1 * numAnchors + i];
      const w = output0[2 * numAnchors + i];
      const h = output0[3 * numAnchors + i];

      const x = Math.max(0, (cx - w / 2) * scaleX);
      const y = Math.max(0, (cy - h / 2) * scaleY);
      const boxW = Math.min(origW - x, w * scaleX);
      const boxH = Math.min(origH - y, h * scaleY);

      candidates.push({
        bbox: [Math.round(x), Math.round(y), Math.round(boxW), Math.round(boxH)],
        centroid: [Math.round(x + boxW / 2), Math.round(y + boxH / 2)],
        score: bestScore,
        classId: bestClass,
        className: VEHICLE_CLASSES[bestClass]
      });
    }
  }

  return nonMaxSuppression(candidates, 0.45);
}

module.exports = {
  detectVehicles,
  calculateIoU,
  MODEL_PATH
};

