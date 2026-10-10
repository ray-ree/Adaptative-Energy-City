import React from 'react';
import { useSimStore } from '../store/simStore';

export default function WelcomeScreen() {
  const dismiss = useSimStore(s => s.dismissWelcome);
  const runDemo = useSimStore(s => s.runDemo);

  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-logo">⚡</div>
        <h1 className="welcome-title">Adaptive Energy City</h1>
        <p className="welcome-subtitle">Solar-aware Smart Energy Management Simulator</p>

        <div className="welcome-description">
          <p>
            Welcome to <strong>Adaptive Energy City</strong> — an interactive simulator where you
            can explore how a smart city manages electricity in real time.
          </p>
          <p>
            Watch what happens when solar panels stop generating power, when electricity prices spike,
            or when the grid can't supply enough energy. See how the intelligent scheduling system
            automatically reschedules non-critical activities to keep the city running safely.
          </p>
        </div>

        <div className="welcome-features">
          <div className="feature-item">
            <span className="feature-icon">🏙️</span>
            <div>
              <strong>3D Interactive City</strong>
              <p>Explore buildings, click to inspect, and see energy flow animations</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🤖</span>
            <div>
              <strong>Real Scheduling Engine</strong>
              <p>Priority-based rescheduling — not hardcoded. Results are calculated dynamically.</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <div>
              <strong>Live Charts & Dashboard</strong>
              <p>Track demand, solar, prices, and costs in real time</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <div>
              <strong>Trigger Crises</strong>
              <p>Cause a solar drop, price spike, or grid outage and see the response</p>
            </div>
          </div>
        </div>

        <div className="welcome-scenario">
          <div className="scenario-badge">📖 Illustrative Scenario</div>
          <p>
            A factory with a 100 kW grid limit has equipment totalling 115 kW. When everything runs
            at once, the system detects the overload and reschedules EV charging and water pumping
            to later, lower-cost time slots — keeping critical systems online.
          </p>
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            ⚠️ This is a planning and educational simulator. It does not calculate real voltage,
            current, or electrical losses. Results are for learning purposes only.
          </p>
        </div>

        <div className="welcome-actions">
          <button className="welcome-demo-btn" onClick={runDemo}>
            ⚡ Run Power Shortage Demo
          </button>
          <button className="welcome-explore-btn" onClick={dismiss}>
            🗺️ Explore the City
          </button>
        </div>

        <div className="welcome-how">
          <strong>How to use:</strong>
          <ol>
            <li>Press <em>Run Power Shortage Demo</em> to see an instant crisis + resolution</li>
            <li>Use the <em>control panel</em> to trigger events like solar drops or price spikes</li>
            <li>Click any building to inspect its energy data and device schedule</li>
            <li>Check the <em>Decision Panel</em> to understand each scheduling choice</li>
            <li>Switch between 3D and 2D views using the toggle button</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
