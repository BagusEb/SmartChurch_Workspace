import { useState, useEffect, useMemo } from 'react';
import { Player } from '@lottiefiles/react-lottie-player';

// Only 1 animation import is needed
import tabasAnim from './assets/Tabas.json';
import './App.css';

function App() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'in' | 'out'
  const [currentDate, setCurrentDate] = useState('');

  // Light particles (dust motes) for a candle-like atmosphere.
  // Random positions and animations are generated only once on mount.
  const motes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: Math.round(Math.random() * 100),
        delay: (Math.random() * 8).toFixed(2),
        duration: (10 + Math.random() * 8).toFixed(2),
        size: (Math.random() * 3 + 2).toFixed(1),
      })),
    []
  );

  // Update the displayed date every minute
  useEffect(() => {
    const updateDate = () => {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const today = new Date().toLocaleDateString('en-US', options);
      setCurrentDate(today);
    };

    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => clearInterval(interval);
  }, []);

  // Note: Audio is now played directly by the FastAPI server 
  // when it receives an "in"/"out" POST request. 
  // This bypasses the browser's audio autoplay restrictions 
  // since the UI and server are running on the same device.
  useEffect(() => {
    const ws = new WebSocket('ws://192.168.1.102:8001/ws');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.status);

      // Return to 'idle' state after 6 seconds of animation
      setTimeout(() => {
        setStatus('idle');
      }, 6000);
    };

    return () => ws.close();
  }, []);

  const wrapperClass =
    status === 'idle' ? 'app-wrapper bg-idle' : `app-wrapper bg-active tone-${status}`;

  return (
    <div className={wrapperClass}>
      {/* Candle light particles — purely decorative, does not interfere with the content */}
      <div className="motes" aria-hidden="true">
        {motes.map((m) => (
          <span
            key={m.id}
            className="mote"
            style={{
              left: `${m.left}%`,
              width: `${m.size}px`,
              height: `${m.size}px`,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
            }}
          />
        ))}
      </div>

      {status === 'idle' ? (
        <div className="idle-container" key="idle">
          <span className="ornament" aria-hidden="true">
            ✦
          </span>
          <h1 className="idle-title">Happy Sabbath</h1>
          <div className="divider">
            <span className="divider-line" />
            <span className="divider-mark" />
            <span className="divider-line" />
          </div>
          <h2 className="idle-date">{currentDate}</h2>
        </div>
      ) : (
        <div className="fullscreen-anim" key="active">
          <div className="anim-halo" aria-hidden="true" />
          <div className="anim-frame">
            <Player autoplay loop src={tabasAnim} style={{ height: '520px', width: '520px' }} />
          </div>
          <h1 className="greeting-text">
            {status === 'in' ? 'Welcome! Happy Sabath✨' : 'God bless & See you next Sabath'}
          </h1>
        </div>
      )}
    </div>
  );
}

export default App;