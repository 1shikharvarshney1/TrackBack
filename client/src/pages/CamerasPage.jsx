import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import CameraPickerMap from '../components/CameraPickerMap';

export default function CamerasPage() {
  const [cameras, setCameras] = useState([]);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchCameras = async () => {
    try {
      const data = await api.getCameras();
      setCameras(data);
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const handleSelectPos = (pos) => {
    setLat(pos.lat);
    setLng(pos.lng);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || lat === '' || lng === '') {
      setError('Please provide camera name and select lat/lng');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.createCamera({ name, lat: Number(lat), lng: Number(lng) });
      setName('');
      setLat('');
      setLng('');
      fetchCameras();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedPos = lat !== '' && lng !== '' ? [Number(lat), Number(lng)] : null;

  return (
    <div className="container">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px' }}>Surveillance Cameras</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Register camera nodes and geo-coordinates for route mapping and vehicle tracking.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Add New Camera Node</h3>

          {error && (
            <div
              style={{
                padding: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#f87171',
                fontSize: '13px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Camera Name / Intersection
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. 5th Ave & Broadway Junction"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="28.6139"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="77.2090"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  required
                />
              </div>
            </div>

            <CameraPickerMap
              selectedPos={selectedPos}
              onSelectPos={handleSelectPos}
              existingCameras={cameras}
            />

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Adding...' : 'Register Camera'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>
            Registered Cameras ({cameras.length})
          </h3>

          {cameras.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>No cameras registered yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((cam) => (
                  <tr key={cam._id}>
                    <td style={{ fontWeight: '500' }}>{cam.name}</td>
                    <td>{cam.lat}</td>
                    <td>{cam.lng}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

