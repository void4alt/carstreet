import { spawn } from 'node:child_process';
import http from 'node:http';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port, retries = 25) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
      });
      const list = JSON.parse(data);
      if (list.length > 0 && list[0].webSocketDebuggerUrl) {
        return list[0].webSocketDebuggerUrl;
      }
    } catch {
      await sleep(200);
    }
  }
  throw new Error('Could not find DevToolsActivePort / webSocketDebuggerUrl');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function runBenchmark() {
  console.log('🚀 Launching Headless Brave Browser on port 9333...');
  const bravePath = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
  const brave = spawn(bravePath, [
    '--headless=new',
    '--remote-debugging-port=9333',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--window-size=1280,720',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'http://localhost:5173/?garage=1',
  ], {
    stdio: 'ignore',
  });

  try {
    const wsUrl = await getDebuggerUrl(9333);
    console.log('🔗 Connected to CDP WebSocket:', wsUrl);
    const client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Runtime.enable');
    client.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => (a.value !== undefined ? a.value : (a.description || ''))).join(' ');
        console.log('[BROWSER CONSOLE]', text);
      }
    });

    // Wait 3 seconds for garage and Three.js scene to initialize & warm up shaders
    console.log('⏳ Waiting for garage scene initialization and GPU shader warm-up...');
    await sleep(3000);

    // Profile startup transition by clicking "Drive Mountain Touge"
    console.log('⏱️ Initiating transition from Garage to Track Gameplay...');
    const result = await client.evaluate(`
      new Promise(async (resolve) => {
        // Collect telemetry and frame pacing
        const frameTimes = [];
        let firstPlayableTime = null;
        let startTriggerTime = performance.now();
        let frameCount = 0;
        let lastFrameTime = null;

        let startBtn = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          startBtn = document.querySelector('button[data-start="true"]') ||
                     Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Drive') || b.textContent.includes('Start') || b.textContent.includes('Test')));
          if (startBtn) break;
          await new Promise(r => setTimeout(r, 250));
        }

        if (!startBtn) {
          resolve({ error: 'Could not find start button' });
          return;
        }

        console.log('CLICKING BUTTON:', startBtn.outerHTML);
        const tClick0 = performance.now();
        startBtn.click();
        const tClickMs = performance.now() - tClick0;
        console.log('CLICK HANDLER DURATION:', tClickMs);

        function onFrame(now) {
          if (document.body.dataset.state === 'playing' && firstPlayableTime === null) {
            firstPlayableTime = now - startTriggerTime;
          }

          if (frameCount < 5) {
            console.log('[ONFRAME #' + frameCount + '] now=' + now.toFixed(1) + ' last=' + (lastFrameTime ? lastFrameTime.toFixed(1) : 'null'));
          }

          if (lastFrameTime === null) {
            lastFrameTime = now;
            requestAnimationFrame(onFrame);
            return;
          }

          const delta = now - lastFrameTime;
          lastFrameTime = now;
          frameCount++;
          frameTimes.push({ frame: frameCount, dt: delta });

          if (frameCount < 120) {
            requestAnimationFrame(onFrame);
          } else {
            // Compute metrics
            const rawTimes = frameTimes.map(f => f.dt);
            const spikes = frameTimes.filter(f => f.dt > 25);
            rawTimes.sort((a, b) => a - b);
            const sum = rawTimes.reduce((acc, v) => acc + v, 0);
            const avgDt = sum / rawTimes.length;
            const avgFps = 1000 / avgDt;
            const p99Dt = rawTimes[Math.floor(rawTimes.length * 0.99)];
            const p95Dt = rawTimes[Math.floor(rawTimes.length * 0.95)];
            const maxDt = rawTimes[rawTimes.length - 1];
            const minDt = rawTimes[0];
            const low1Fps = 1000 / p99Dt;

            const droppedFrames = rawTimes.filter(dt => dt > 25).length;
            const severeStutterFrames = rawTimes.filter(dt => dt > 35).length;

            const audioCtx = window.__audioCtx || (window.soundEngine && window.soundEngine.ctx);
            const audioState = audioCtx ? audioCtx.state : 'unlocked_running';
            const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;

            const carState = window.__gameState || {};

            resolve({
              timeToFirstPlayableFrameMs: firstPlayableTime,
              firstFrameDtMs: frameTimes[0] !== undefined ? frameTimes[0].dt : 0,
              maxFrameSpikeMs: maxDt,
              spikes: spikes,
              p95FrameMs: p95Dt,
              p99FrameMs: p99Dt,
              avgFps: avgFps,
              low1Fps: low1Fps,
              droppedFramesCount: droppedFrames,
              severeStutterCount: severeStutterFrames,
              totalFramesSampled: rawTimes.length,
              audioState: audioState,
              sampleRate: sampleRate,
              carSpeedKmh: carState.speedKmh ?? 0,
              carRpm: carState.rpm ?? 0
            });
          }
        }

        requestAnimationFrame(onFrame);
      });
    `);

    console.log('\n📊 === STARTUP PERFORMANCE PROFILE RESULTS ===');
    console.log(JSON.stringify(result, null, 2));

    client.close();
  } finally {
    brave.kill('SIGTERM');
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
