import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function CameraPickerMap({ selectedPos, onSelectPos, existingCameras = [] }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const selectionMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const initial = selectedPos || [28.6139, 77.209];
    const map = L.map(mapContainerRef.current).setView(initial, 12);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Existing cameras markers
    existingCameras.forEach((cam) => {
      if (typeof cam.lat === 'number' && typeof cam.lng === 'number') {
        const marker = L.circleMarker([cam.lat, cam.lng], {
          radius: 6,
          color: '#3b82f6',
          fillColor: '#60a5fa',
          fillOpacity: 0.8
        }).addTo(map);
        marker.bindPopup(`<b>${cam.name}</b><br/>Lat: ${cam.lat}, Lng: ${cam.lng}`);
      }
    });

    if (selectedPos) {
      selectionMarkerRef.current = L.marker(selectedPos).addTo(map);
    }

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (selectionMarkerRef.current) {
        selectionMarkerRef.current.setLatLng([lat, lng]);
      } else {
        selectionMarkerRef.current = L.marker([lat, lng]).addTo(map);
      }
      onSelectPos({ lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [existingCameras]);

  useEffect(() => {
    if (mapRef.current && selectedPos) {
      if (selectionMarkerRef.current) {
        selectionMarkerRef.current.setLatLng(selectedPos);
      } else {
        selectionMarkerRef.current = L.marker(selectedPos).addTo(mapRef.current);
      }
    }
  }, [selectedPos]);

  return (
    <div>
      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
        Click anywhere on the map to set camera location coordinates:
      </div>
      <div ref={mapContainerRef} className="map-container" style={{ height: '280px' }} />
    </div>
  );
}

