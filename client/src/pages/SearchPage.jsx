import React, { useState, useEffect } from 'react';
import { api, apiRequest } from '../api/client';
import MapRoute from '../components/MapRoute';

export default function SearchPage({ initialPlate = '' }) {
  const [plate, setPlate] = useState(initialPlate);
  const [sightings, setSightings] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (initialPlate) {
      setPlate(initialPlate);
      handleSearch(null, initialPlate);
    }
  }, [initialPlate]);

  const handleSearch = async (e, plateQuery) => {
    if (e) e.preventDefault();
    const query = (plateQuery || plate).trim();
    if (!query) return;

    setLoading(true);
    setError('');

    try {
      const data = await api.searchSightings(query);
      setSightings(data);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!plate.trim() || sightings.length === 0) return;
    setDownloadingPdf(true);
    try {
      const blob = await apiRequest(`/reports/plate/${encodeURIComponent(plate.trim())}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Incident_Report_${plate.trim().toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(`PDF Report failed: ${err.message}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px' }}>Vehicle Plate Search & Route Reconstruction</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Query a vehicle license plate to retrace chronological route across surveillance cameras and analyze violations.
        </p>
      </div>

      <div className="card">
        <form onSubmit={(e) => handleSearch(e)} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Enter license plate number (e.g. MH12AB1234, UNKNOWN)..."
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            style={{ fontSize: '16px', textTransform: 'uppercase' }}
            required
          />
          <button type="submit" className="btn-primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Searching...' : 'Search Route'}
          </button>
        </form>

        {error && (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#f87171',
              fontSize: '13px',
              marginTop: '14px'
            }}
          >
            {error}
          </div>
        )}
      </div>

      {searched && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '18px' }}>
              Route & Timeline for <span style={{ color: '#38bdf8' }}>{plate.toUpperCase()}</span> ({sightings.length} sightings)
            </h3>
            {sightings.length > 0 && (
              <button
                className="btn-secondary"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                style={{ fontSize: '13px' }}
              >
                {downloadingPdf ? 'Generating PDF...' : 'Download Incident Report (PDF)'}
              </button>
            )}
          </div>

          {sightings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px' }}>
              No surveillance sightings found for license plate "{plate.toUpperCase()}".
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
                <MapRoute sightings={sightings} />
              </div>

              <div className="card">
                <h4 style={{ fontSize: '15px', marginBottom: '12px' }}>Chronological Surveillance Timeline</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Stop #</th>
                      <th>Camera / Location</th>
                      <th>Timestamp</th>
                      <th>Speed Estimate</th>
                      <th>Flags</th>
                      <th>Plate Crop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sightings.map((s, index) => (
                      <tr key={s._id}>
                        <td>
                          <span
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              fontWeight: 'bold',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px'
                            }}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td>
                          <strong>{s.camera?.name || 'CCTV Camera'}</strong>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {s.camera?.lat}, {s.camera?.lng}
                          </div>
                        </td>
                        <td>{new Date(s.timestamp).toLocaleString()}</td>
                        <td>
                          <strong>{s.estimatedSpeed || 0} km/h</strong>
                        </td>
                        <td>
                          {(s.flags || []).length === 0 ? (
                            <span className="badge badge-muted">Normal</span>
                          ) : (
                            s.flags.map((f) => (
                              <span
                                key={f}
                                className={`badge ${
                                  f === 'possible_collision' ? 'badge-danger' : 'badge-warning'
                                }`}
                                style={{ marginRight: '4px' }}
                              >
                                {f.replace('_', ' ')}
                              </span>
                            ))
                          )}
                        </td>
                        <td>
                          {s.cropImagePath ? (
                            <img
                              src={`/${s.cropImagePath}`}
                              alt="Crop"
                              style={{ width: '80px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '12px' }}>N/A</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

