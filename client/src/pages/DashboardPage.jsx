import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function DashboardPage({ onSearchPlate }) {
  const [stats, setStats] = useState({ videoCount: 0, vehicleCount: 0, flaggedCount: 0 });
  const [recentSightings, setRecentSightings] = useState([]);
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [sData, sightings, videos] = await Promise.all([
        api.getStats(),
        api.getSightings(),
        api.getVideos()
      ]);
      setStats(sData);
      setRecentSightings(sightings.slice(0, 8));
      setRecentVideos(videos.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px' }}>Investigation Dashboard</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Overview of surveillance network footage, vehicle detections, and traffic violations.
        </p>
      </div>

      <div className="grid-3">
        <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase' }}>
            Surveillance Videos
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '6px' }}>
            {stats.videoCount}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Processed CCTV footage files
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase' }}>
            Tracked Vehicles
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '6px' }}>
            {stats.vehicleCount}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Vehicle sightings recorded
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase' }}>
            Flagged Incidents
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '6px', color: '#ef4444' }}>
            {stats.flaggedCount}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Collisions, braking & speed violations
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>Recent Flagged Vehicles & Alerts</h3>
          {recentSightings.filter((s) => s.flags && s.flags.length > 0).length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>No flagged incidents detected yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Camera</th>
                  <th>Speed</th>
                  <th>Violations</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentSightings
                  .filter((s) => s.flags && s.flags.length > 0)
                  .map((s) => (
                    <tr key={s._id}>
                      <td style={{ fontWeight: '600', color: '#38bdf8' }}>{s.plate}</td>
                      <td>{s.camera?.name || 'Unknown'}</td>
                      <td>{s.estimatedSpeed} km/h</td>
                      <td>
                        {s.flags.map((f) => (
                          <span
                            key={f}
                            className={`badge ${f === 'possible_collision' ? 'badge-danger' : 'badge-warning'}`}
                            style={{ marginRight: '4px' }}
                          >
                            {f.replace('_', ' ')}
                          </span>
                        ))}
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          onClick={() => onSearchPlate(s.plate)}
                        >
                          Trace Route
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>Surveillance Processing Pipeline</h3>
          {recentVideos.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>No video clips uploaded.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Clip Name</th>
                  <th>Camera</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentVideos.map((v) => (
                  <tr key={v._id}>
                    <td>{v.originalName}</td>
                    <td>{v.camera?.name || 'CCTV'}</td>
                    <td>
                      <span
                        className={`badge ${
                          v.status === 'done'
                            ? 'badge-success'
                            : v.status === 'processing'
                            ? 'badge-warning'
                            : v.status === 'failed'
                            ? 'badge-danger'
                            : 'badge-muted'
                        }`}
                      >
                        {v.status}
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

