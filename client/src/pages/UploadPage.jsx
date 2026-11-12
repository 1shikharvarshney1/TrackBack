import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function UploadPage() {
  const [cameras, setCameras] = useState([]);
  const [videos, setVideos] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [videoFile, setVideoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [cList, vList] = await Promise.all([api.getCameras(), api.getVideos()]);
      setCameras(cList);
      if (cList.length > 0 && !selectedCamera) {
        setSelectedCamera(cList[0]._id);
      }
      setVideos(vList);
    } catch (err) {
      console.error('Failed to load upload page data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      try {
        const vList = await api.getVideos();
        setVideos(vList);
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      setError('Please select a video file');
      return;
    }
    if (!selectedCamera) {
      setError('Please select a camera');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('cameraId', selectedCamera);
      formData.append('startTime', new Date(startTime).toISOString());

      await api.uploadVideo(formData);
      setSuccess('Video uploaded! Processing runs in background.');
      setVideoFile(null);
      e.target.reset();
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px' }}>Surveillance Video Ingestion</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Upload CCTV video footage mapped to specific cameras and timestamps for background vehicle detection and plate reading.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Upload Surveillance Clip</h3>

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

          {success && (
            <div
              style={{
                padding: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid #10b981',
                borderRadius: '6px',
                color: '#34d399',
                fontSize: '13px',
                marginBottom: '16px'
              }}
            >
              {success}
            </div>
          )}

          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Camera Source
              </label>
              <select
                className="input-field"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                required
              >
                {cameras.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.lat}, {c.lng})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Clip Recording Start Timestamp
              </label>
              <input
                type="datetime-local"
                className="input-field"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Video File (.mp4, .avi, .mov)
              </label>
              <input
                type="file"
                accept="video/*"
                className="input-field"
                onChange={(e) => setVideoFile(e.target.files[0])}
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={uploading} style={{ marginTop: '8px' }}>
              {uploading ? 'Uploading Video...' : 'Ingest Surveillance Clip'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>
            Uploaded Surveillance Clips ({videos.length})
          </h3>

          {videos.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>No video clips uploaded.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Clip Name</th>
                  <th>Camera</th>
                  <th>Start Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((vid) => (
                  <tr key={vid._id}>
                    <td style={{ fontWeight: '500' }}>{vid.originalName}</td>
                    <td>{vid.camera?.name || 'Unknown'}</td>
                    <td style={{ fontSize: '13px', color: '#cbd5e1' }}>
                      {new Date(vid.startTime).toLocaleString()}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          vid.status === 'done'
                            ? 'badge-success'
                            : vid.status === 'processing'
                            ? 'badge-warning'
                            : vid.status === 'failed'
                            ? 'badge-danger'
                            : 'badge-muted'
                        }`}
                      >
                        {vid.status}
                      </span>
                    </td>
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

