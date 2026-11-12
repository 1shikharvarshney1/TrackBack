# TrackBack

TrackBack is a MERN-stack hit-and-run vehicle tracking and surveillance intelligence system. It ingests CCTV footage from multiple cameras, detects and tracks vehicles, reads license plates via Gemini Flash vision AI, maps chronological routes with Leaflet, flags traffic violations (overspeeding, sudden braking, collisions), and generates formal incident PDF dossiers.

---

## Architecture Overview

```
Surveillance Video Clip (MP4/AVI)
         │
         ▼
[ fluent-ffmpeg ] ──► Extract frames (~3 FPS)
         │
         ▼
[ YOLOv8n ONNX (onnxruntime-node) ] ──► Vehicle Detections (Car, Motorcycle, Bus, Truck)
         │
         ▼
[ Custom JS Tracker ] ──► IoU + Centroid Distance Tracking & Trajectory Chaining
         │
         ├──► [ Sharp ] ──► Crop Vehicle Lower Region (Bumper/Plate area)
         │       │
         │       ▼
         │    [ Gemini Flash Vision API ] ──► License Plate OCR (JSON)
         │
         └──► [ Speed & Flag Analyzer ] ──► Pixel displacement/sec x calibration
                 ├── Overspeeding (> 60 km/h)
                 ├── Sudden Braking (Rapid deceleration)
                 └── Collision Detection (Bbox overlap + abrupt speed drop)
         │
         ▼
[ MongoDB Sightings ] ──► Chronological Timeline & Spatial Metadata
         │
         ├──► [ Leaflet Map ] ──► Interactive Route with numbered checkpoints
         └──► [ PDFKit ]      ──► Downloadable Investigation Incident Report
```

---

## Stack

- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT, Bcrypt, Multer
- **Computer Vision & Tracking**: YOLOv8n ONNX via `onnxruntime-node`, custom JS IoU + centroid-distance tracker (no python)
- **Frame Extraction & Image Processing**: `fluent-ffmpeg`, `sharp`
- **OCR**: Google Gemini 1.5/2.0 Flash Vision REST API (free tier)
- **Frontend**: React (Vite), Leaflet map with custom numbered markers
- **Reporting**: `pdfkit`

---

## Setup Instructions

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas URI
- **ffmpeg** installed and accessible in your system `PATH`

### 2. Environment Configuration
Copy `.env.example` to `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/trackback
JWT_SECRET=supersecret_jwt_key_trackback_2026
SPEED_CALIBRATION=0.5
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### 3. Model File Setup
The YOLOv8n ONNX model must reside at `server/models/yolov8n.onnx`.

If missing, download the official pre-converted ONNX model directly:
```bash
curl -L -o server/models/yolov8n.onnx https://huggingface.co/SpotLab/YOLOv8Detection/resolve/3005c6751fb19cdeb6b10c066185908faf66a097/yolov8n.onnx
```

### 4. Install Dependencies

**Server:**
```bash
cd server
npm install
```

**Client:**
```bash
cd client
npm install
```

### 5. Running the Application

**Start the Server:**
```bash
cd server
npm start # or: node server.js
```
The backend API runs on `http://localhost:5000`.

**Start the Client:**
```bash
cd client
npm run dev
```
The React frontend opens at `http://localhost:3000`.

---

## Features

1. **Authentication**: JWT authentication with bcrypt password hashing.
2. **Camera Management**: Register CCTV cameras with geolocation coordinates using point-and-click Leaflet map.
3. **Surveillance Video Ingestion**: Upload CCTV clips linked to specific cameras and timestamps; processing runs asynchronously in the background.
4. **Vehicle Detection & Tracking**: YOLOv8n detects vehicles; custom JS tracker maintains persistent identities across frames using IoU and centroid distance.
5. **Automated Plate Recognition**: Sharp crops the lower vehicle bumper/plate region and queries Gemini Flash vision API.
6. **Speed Estimation**: Computes pixel displacement per second multiplied by linear calibration factor.
7. **Incident Flags**: Detects overspeeding, sudden braking, and potential collisions (bounding box overlap followed by sharp deceleration).
8. **Route Reconstruction**: Search any plate to visualize chronological stops on Leaflet map with numbered markers and timeline.
9. **Investigation Report PDF**: Generates formal incident report containing vehicle details, time window, camera locations, max speed, violation flags, and last seen location.
10. **Dashboard**: Summary metrics for surveillance clips, tracked vehicles, and flagged traffic incidents.

---

## System Limitations & Disclaimer

- **Approximate Speed Estimation**: Speed is calculated based on 2D pixel centroid movement per second multiplied by a linear calibration constant. Because standard CCTV cameras exhibit optical perspective distortion, depth foreshortening, and varying angles, speed estimates are approximate and intended for investigative guidance rather than certified radar telemetry.
- **Plate Recognition Sensitivity**: Gemini Flash OCR accuracy depends heavily on input image resolution, lighting conditions, camera distance, and motion blur. Extremely blurry, low-resolution, occluded, or night-time infrared footage may fail to yield readable plate characters.

