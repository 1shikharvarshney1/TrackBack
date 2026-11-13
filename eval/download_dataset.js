const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getRange(url, start, end) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Range: `bytes=${start}-${end}` } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return getRange(res.headers.location, start, end).then(resolve, reject);
      }
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching range ${start}-${end}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

function parseLocalEntry(buffer, offset, cdRecord) {
  const localSig = buffer.readUInt32LE(offset);
  if (localSig !== 0x04034b50) {
    throw new Error(`Invalid local header signature at ${offset}: 0x${localSig.toString(16)}`);
  }
  const nameLen = buffer.readUInt16LE(offset + 26);
  const extraLen = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLen + extraLen;
  const dataEnd = dataStart + cdRecord.compressedSize;
  const compData = buffer.subarray(dataStart, dataEnd);

  if (cdRecord.compressionMethod === 0) {
    return compData;
  } else if (cdRecord.compressionMethod === 8) {
    return zlib.inflateRawSync(compData);
  } else {
    throw new Error(`Unsupported compression method ${cdRecord.compressionMethod}`);
  }
}

async function run() {
  const url = 'https://huggingface.co/datasets/abhineet123/ua_detrac/resolve/main/ua_detrac_test_set.zip';
  const cdOffset = 4246400167;
  const cdSize = 6437913;

  console.log('Step 1: Reading UA-DETRAC ZIP Central Directory via HTTP range request...');
  const cd = await getRange(url, cdOffset, cdOffset + cdSize - 1);
  console.log(`Central Directory fetched (${(cd.length / 1024 / 1024).toFixed(2)} MB). Parsing sequence indexes...`);

  const sequencesToDownload = [
    { name: 'detrac_70_MVI_39511', maxFrames: 380, category: 'moderate' },
    { name: 'detrac_69_MVI_39501', maxFrames: 350, category: 'crowded' },
    { name: 'detrac_84_MVI_40775', maxFrames: 350, category: 'crowded_occluded' },
    { name: 'detrac_82_MVI_40773', maxFrames: 350, category: 'moderate' },
    { name: 'detrac_83_MVI_40774', maxFrames: 350, category: 'sparse_highway' },
    { name: 'detrac_72_MVI_40711', maxFrames: 350, category: 'moderate_intersection' }
  ];

  let pos = 0;
  const cdRecordSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const seqEntries = new Map();
  for (const s of sequencesToDownload) {
    seqEntries.set(s.name, []);
  }

  while (pos < cd.length - 46) {
    if (cd.subarray(pos, pos + 4).equals(cdRecordSig)) {
      const compressionMethod = cd.readUInt16LE(pos + 10);
      const compressedSize = cd.readUInt32LE(pos + 20);
      const uncompressedSize = cd.readUInt32LE(pos + 24);
      const nameLen = cd.readUInt16LE(pos + 28);
      const extraLen = cd.readUInt16LE(pos + 30);
      const commentLen = cd.readUInt16LE(pos + 32);
      const localHeaderOffset = cd.readUInt32LE(pos + 42);
      const name = cd.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

      const slashIdx = name.indexOf('/');
      if (slashIdx !== -1) {
        const seq = name.substring(0, slashIdx);
        if (seqEntries.has(seq)) {
          seqEntries.get(seq).push({
            name,
            subname: name.substring(slashIdx + 1),
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset
          });
        }
      }
      pos += 46 + nameLen + extraLen + commentLen;
    } else {
      pos++;
    }
  }

  const baseDataDir = path.join(__dirname, 'data');
  fs.mkdirSync(baseDataDir, { recursive: true });

  const summaryReport = [];

  for (const seqConfig of sequencesToDownload) {
    const seq = seqConfig.name;
    const entries = seqEntries.get(seq);
    if (!entries || entries.length === 0) {
      console.warn(`No entries found for ${seq}`);
      continue;
    }

    console.log(`\n======================================================`);
    console.log(`Processing sequence: ${seq} (${seqConfig.category})`);
    console.log(`Available files in archive: ${entries.length}`);

    // Filter frames up to maxFrames, plus annotations.csv
    const annotationsRecord = entries.find(e => e.subname === 'annotations.csv');
    const frameRecords = entries
      .filter(e => e.subname.startsWith('img') && e.subname.endsWith('.jpg'))
      .sort((a, b) => a.subname.localeCompare(b.subname))
      .slice(0, seqConfig.maxFrames);

    const neededEntries = [annotationsRecord, ...frameRecords].filter(Boolean);
    neededEntries.sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

    const minOffset = neededEntries[0].localHeaderOffset;
    const lastEntry = neededEntries[neededEntries.length - 1];
    const maxOffset = lastEntry.localHeaderOffset + lastEntry.compressedSize + 1024;
    const spanBytes = maxOffset - minOffset;

    console.log(`Fetching contiguous sequence block: ${(spanBytes / 1024 / 1024).toFixed(2)} MB (${minOffset} to ${maxOffset})...`);
    const t0 = Date.now();
    const seqBuffer = await getRange(url, minOffset, maxOffset);
    console.log(`Downloaded ${seq} block in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

    const seqDir = path.join(baseDataDir, seq);
    const framesDir = path.join(seqDir, 'frames');
    const gtDir = path.join(seqDir, 'gt');
    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(gtDir, { recursive: true });

    // Extract frames to disk
    console.log(`Extracting ${frameRecords.length} frames to ${framesDir}...`);
    for (const fr of frameRecords) {
      const relOffset = fr.localHeaderOffset - minOffset;
      const imgBuf = parseLocalEntry(seqBuffer, relOffset, fr);
      fs.writeFileSync(path.join(framesDir, fr.subname), imgBuf);
    }

    // Extract annotations and convert to MOT format
    let totalGtBoxes = 0;
    const uniqueVehicles = new Set();
    const motGtLines = [];

    if (annotationsRecord) {
      const relOffset = annotationsRecord.localHeaderOffset - minOffset;
      const csvBuf = parseLocalEntry(seqBuffer, relOffset, annotationsRecord);
      const csvText = csvBuf.toString('utf8');
      const lines = csvText.trim().split('\n');

      const maxFrameIdx = frameRecords.length;

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 11) continue;
        const filename = parts[1].trim();
        const frameIdx = parseInt(filename.replace(/\D/g, ''), 10);
        if (frameIdx < 1 || frameIdx > maxFrameIdx) continue;

        const xmin = parseFloat(parts[5]);
        const ymin = parseFloat(parts[6]);
        const xmax = parseFloat(parts[7]);
        const ymax = parseFloat(parts[8]);
        const targetId = parseInt(parts[10].trim(), 10);

        const width = Math.max(0, xmax - xmin);
        const height = Math.max(0, ymax - ymin);

        uniqueVehicles.add(targetId);
        totalGtBoxes++;

        // MOT format: <frame>,<id>,<bb_left>,<bb_top>,<bb_width>,<bb_height>,1,-1,-1,-1
        motGtLines.push(
          `${frameIdx},${targetId},${xmin.toFixed(2)},${ymin.toFixed(2)},${width.toFixed(2)},${height.toFixed(2)},1,-1,-1,-1`
        );
      }

      // Sort MOT lines by frame, then id
      motGtLines.sort((a, b) => {
        const fa = parseInt(a.split(',')[0], 10);
        const fb = parseInt(b.split(',')[0], 10);
        if (fa !== fb) return fa - fb;
        return parseInt(a.split(',')[1], 10) - parseInt(b.split(',')[1], 10);
      });

      fs.writeFileSync(path.join(gtDir, 'gt.txt'), motGtLines.join('\n') + '\n', 'utf8');
      console.log(`Saved MOT ground truth gt.txt: ${motGtLines.length} boxes across ${uniqueVehicles.size} tracks.`);
    }

    // Write seqinfo.ini (standard MOT format)
    const seqInfo = [
      '[Sequence]',
      `name=${seq}`,
      'imDir=frames',
      'frameRate=25',
      `seqLength=${frameRecords.length}`,
      'imWidth=960',
      'imHeight=540',
      'imExt=.jpg'
    ].join('\n');
    fs.writeFileSync(path.join(seqDir, 'seqinfo.ini'), seqInfo + '\n', 'utf8');

    // Create MP4 video clip from frames via ffmpeg
    const videoPath = path.join(seqDir, `${seq}.mp4`);
    console.log(`Encoding MP4 video at ${videoPath}...`);
    try {
      execSync(
        `ffmpeg -y -framerate 25 -i "${path.join(framesDir, 'img%05d.jpg')}" -c:v libx264 -pix_fmt yuv420p "${videoPath}"`,
        { stdio: 'pipe' }
      );
      console.log(`Created video: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (ffmpegErr) {
      console.error(`ffmpeg failed for ${seq}:`, ffmpegErr.message);
    }

    summaryReport.push({
      sequence: seq,
      category: seqConfig.category,
      frames: frameRecords.length,
      gtTracks: uniqueVehicles.size,
      gtBoxes: totalGtBoxes,
      videoSizeMb: (fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)
    });
  }

  console.log('\n======================================================');
  console.log('STEP 1 DATASET SUMMARY:');
  console.log('======================================================');
  console.table(summaryReport);

  const totalFrames = summaryReport.reduce((a, b) => a + b.frames, 0);
  const totalTracks = summaryReport.reduce((a, b) => a + b.gtTracks, 0);
  const totalBoxes = summaryReport.reduce((a, b) => a + b.gtBoxes, 0);
  console.log(`TOTALS: ${summaryReport.length} sequences, ${totalFrames} frames, ${totalTracks} ground truth tracks, ${totalBoxes} bounding boxes.`);

  fs.writeFileSync(
    path.join(__dirname, 'results', 'dataset_summary.json'),
    JSON.stringify({ summaryReport, totalFrames, totalTracks, totalBoxes }, null, 2),
    'utf8'
  );
}

run().catch(console.error);
