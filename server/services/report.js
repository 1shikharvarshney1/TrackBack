const PDFDocument = require('pdfkit');

function generateIncidentReport(plate, sightings, outputStream) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      doc.pipe(outputStream);

      // Header Banner
      doc
        .rect(0, 0, doc.page.width, 70)
        .fill('#0f172a');

      doc
        .fillColor('#38bdf8')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('TRACKBACK', 40, 20, { continued: true })
        .fillColor('#ef4444')
        .text(' INCIDENT REPORT');

      doc
        .fillColor('#94a3b8')
        .fontSize(10)
        .font('Helvetica')
        .text('Automated Hit-and-Run CCTV Vehicle Route & Violation Dossier', 40, 46);

      doc.moveDown(3);

      // Incident Summary Box
      const firstSeen = sightings.length > 0 ? new Date(sightings[0].timestamp) : null;
      const lastSighting = sightings.length > 0 ? sightings[sightings.length - 1] : null;
      const lastSeen = lastSighting ? new Date(lastSighting.timestamp) : null;

      let maxSpeed = 0;
      const allFlags = new Set();
      sightings.forEach((s) => {
        if (s.estimatedSpeed > maxSpeed) maxSpeed = s.estimatedSpeed;
        (s.flags || []).forEach((f) => allFlags.add(f.replace('_', ' ').toUpperCase()));
      });

      doc
        .fillColor('#0f172a')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`TARGET VEHICLE: ${plate.toUpperCase()}`, 40, 95);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#475569')
        .text(`Report Generated: ${new Date().toLocaleString()}`);

      doc.moveDown(0.8);

      const summaryY = doc.y;
      doc
        .rect(40, summaryY, doc.page.width - 80, 85)
        .fillAndStroke('#f8fafc', '#cbd5e1');

      doc
        .fillColor('#1e293b')
        .fontSize(10)
        .font('Helvetica-Bold');

      doc.text(`Sightings Recorded:`, 55, summaryY + 12);
      doc.text(`Time Window:`, 55, summaryY + 30);
      doc.text(`Peak Estimated Speed:`, 55, summaryY + 48);
      doc.text(`Flags & Violations:`, 55, summaryY + 66);

      doc.font('Helvetica').fillColor('#334155');
      doc.text(`${sightings.length} camera checkpoints`, 190, summaryY + 12);
      doc.text(
        firstSeen && lastSeen
          ? `${firstSeen.toLocaleTimeString()} - ${lastSeen.toLocaleTimeString()} (${firstSeen.toLocaleDateString()})`
          : 'N/A',
        190,
        summaryY + 30
      );
      doc.text(`${maxSpeed} km/h`, 190, summaryY + 48);

      const flagsStr = Array.from(allFlags).join(', ') || 'NONE DETECTED';
      doc
        .fillColor(allFlags.size > 0 ? '#dc2626' : '#16a34a')
        .font('Helvetica-Bold')
        .text(flagsStr, 190, summaryY + 66);

      // Last Seen Location
      doc.moveDown(4.5);
      doc
        .fillColor('#0f172a')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('LAST SEEN LOCATION');

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#334155')
        .text(
          lastSighting?.camera
            ? `Camera: ${lastSighting.camera.name} (Latitude: ${lastSighting.camera.lat}, Longitude: ${lastSighting.camera.lng}) at ${lastSeen.toLocaleString()}`
            : 'No location recorded'
        );

      doc.moveDown(1.5);

      // Chronological Route Table
      doc
        .fillColor('#0f172a')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('CHRONOLOGICAL ROUTE TIMELINE');

      doc.moveDown(0.5);

      // Table Header
      const tableTop = doc.y;
      doc
        .rect(40, tableTop, doc.page.width - 80, 20)
        .fill('#0f172a');

      doc
        .fillColor('#ffffff')
        .fontSize(9)
        .font('Helvetica-Bold');

      doc.text('STOP #', 48, tableTop + 5);
      doc.text('CAMERA NODE', 95, tableTop + 5);
      doc.text('TIMESTAMP', 255, tableTop + 5);
      doc.text('SPEED', 380, tableTop + 5);
      doc.text('VIOLATIONS', 440, tableTop + 5);

      let rowY = tableTop + 20;

      sightings.forEach((s, idx) => {
        const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
        doc.rect(40, rowY, doc.page.width - 80, 22).fill(bg);

        doc.fillColor('#1e293b').font('Helvetica').fontSize(9);
        doc.text(`${idx + 1}`, 55, rowY + 6);
        doc.text(`${s.camera?.name || 'Unknown'}`, 95, rowY + 6, { width: 150, ellipsis: true });
        doc.text(`${new Date(s.timestamp).toLocaleTimeString()}`, 255, rowY + 6);
        doc.text(`${s.estimatedSpeed || 0} km/h`, 380, rowY + 6);

        const rowFlags = (s.flags || []).join(', ');
        if (rowFlags) {
          doc.fillColor('#dc2626').font('Helvetica-Bold');
          doc.text(rowFlags.replace(/_/g, ' '), 440, rowY + 6, { width: 110, ellipsis: true });
        } else {
          doc.fillColor('#64748b').font('Helvetica');
          doc.text('Normal', 440, rowY + 6);
        }

        rowY += 22;
      });

      // Disclaimer / Limitations
      doc.moveDown(4);
      doc.y = Math.max(doc.y, rowY + 25);
      doc
        .fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor('#64748b')
        .text(
          'DISCLAIMER & LIMITATIONS: Speed values are estimated based on pixel displacement per second with linear calibration and are approximate. Plate recognition relies on AI optical character extraction from vehicle crops and may fail on low-resolution, occluded, or blurry surveillance footage.',
          40,
          doc.y,
          { width: doc.page.width - 80 }
        );

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateIncidentReport
};

