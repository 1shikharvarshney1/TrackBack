import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function MapRoute({ sightings = [] }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const defaultCenter = [28.6139, 77.209];
    const map = L.map(mapContainerRef.current).setView(defaultCenter, 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const validSightings = sightings.filter(
      (s) => s.camera && typeof s.camera.lat === 'number' && typeof s.camera.lng === 'number'
    );

    if (validSightings.length === 0) return;

    const latLngs = [];

    validSightings.forEach((sighting, index) => {
      const pos = [sighting.camera.lat, sighting.camera.lng];
      latLngs.push(pos);

      const markerHtml = `<div style="
        background: #ef4444;
        color: white;
        font-weight: bold;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        font-size: 13px;
      ">${index + 1}</div>`;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const popupContent = `
        <div style="font-size: 13px; color: #1e293b;">
          <strong>Stop #${index + 1}: ${sighting.camera.name}</strong><br/>
          Time: ${new Date(sighting.timestamp).toLocaleTimeString()}<br/>
          Speed: ${sighting.estimatedSpeed || 0} km/h<br/>
          Flags: ${(sighting.flags || []).join(', ') || 'None'}
          ${
            sighting.cropImagePath
              ? `<br/><img src="/${sighting.cropImagePath}" style="width: 120px; margin-top: 6px; border-radius: 4px; display: block;" />`
              : ''
          }
        </div>
      `;

      L.marker(pos, { icon: customIcon }).bindPopup(popupContent).addTo(map);
    });

    if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '6, 6'
      }).addTo(map);
    }

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [sightings]);

  return <div ref={mapContainerRef} className="map-container" />;
}

