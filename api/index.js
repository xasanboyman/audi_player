import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// In-memory caching
const searchCache = new Map();
const streamCache = new Map();

// 1. YouTube Search via Playwright (with @sparticuz/chromium on Vercel)
async function searchWithPlaywright(query, limit = 20) {
  let browser = null;
  try {
    const { default: chromium } = await import('@sparticuz/chromium');
    const { chromium: playwright } = await import('playwright-core');

    const executablePath = await chromium.executablePath().catch(() => null);
    
    browser = await playwright.launch({
      args: chromium.args ? [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'] : ['--no-sandbox'],
      defaultViewport: chromium.defaultViewport || { width: 1280, height: 720 },
      executablePath: executablePath || '/usr/bin/google-chrome',
      headless: true
    });

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const results = await page.evaluate((maxResults) => {
      const items = [];
      const renderers = document.querySelectorAll('ytd-video-renderer');
      for (const el of renderers) {
        if (items.length >= maxResults) break;
        const titleEl = el.querySelector('#video-title');
        const channelEl = el.querySelector('#channel-name a') || el.querySelector('.ytd-channel-name a');
        const timeEl = el.querySelector('.badge-shape-wiz__text') || el.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
        const viewEl = el.querySelector('#metadata-line span:nth-child(1)');
        
        const href = titleEl?.getAttribute('href') || '';
        const match = href.match(/[?&]v=([^&]+)/);
        if (!match) continue;
        const videoId = match[1];
        const title = titleEl?.innerText?.trim() || '';
        const channel = channelEl?.innerText?.trim() || 'YouTube';
        const durationFormatted = timeEl?.innerText?.trim() || '3:30';
        const views = viewEl?.innerText?.trim() || '';
        const thumb = `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;
        
        items.push({
          id: `yt_${videoId}`,
          videoId,
          title,
          artist: channel,
          channel,
          durationFormatted,
          views,
          thumbnail: thumb,
          streamUrl: `/api/youtube/stream/${videoId}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          source: 'YouTube (Playwright Serverless)'
        });
      }
      return items;
    }, limit);

    if (results && results.length > 0) return results;
    throw new Error('Playwright returned 0 video renderers');
  } catch (err) {
    console.warn('[Playwright Vercel Search] Playwright fallback triggered:', err.message);
    return await searchWithDirectScraper(query, limit);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// 2. High-speed Direct Scraper (Zero-latency fallback for Serverless)
async function searchWithDirectScraper(query, limit = 20) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+1;'
    }
  });

  const html = await response.text();
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/);
  
  if (!match) {
    throw new Error('Could not parse ytInitialData from YouTube');
  }

  const data = JSON.parse(match[1]);
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  
  const results = [];
  for (const item of contents) {
    if (results.length >= limit) break;
    const v = item.videoRenderer;
    if (!v || !v.videoId) continue;

    const videoId = v.videoId;
    const title = v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || 'Unknown';
    const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || 'YouTube';
    const durationFormatted = v.lengthText?.simpleText || '3:30';
    const views = v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '';
    const thumb = `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;

    results.push({
      id: `yt_${videoId}`,
      videoId,
      title,
      artist: channel,
      channel,
      durationFormatted,
      views,
      thumbnail: thumb,
      streamUrl: `/api/youtube/stream/${videoId}`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'YouTube (Playwright / Cloud Scraper)'
    });
  }

  return results;
}

// Audio Stream Extraction via Invidious / Piped / Stream proxies for Vercel
async function getAudioStreamUrl(videoId) {
  const cleanId = videoId.replace(/^yt_/, '');
  const cached = streamCache.get(cleanId);
  if (cached && (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000)) {
    return cached.streamUrl;
  }

  const invidiousInstances = [
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://invidious.nerdvpn.de',
    'https://invidious.private.coffee'
  ];

  for (const host of invidiousInstances) {
    try {
      const res = await fetch(`${host}/api/v1/videos/${cleanId}`, { timeout: 6000 });
      if (!res.ok) continue;
      const data = await res.json();
      const adaptiveFormats = data.adaptiveFormats || [];
      const audioFormat = adaptiveFormats
        .filter(f => f.type?.startsWith('audio/') || f.container === 'm4a' || f.container === 'webm')
        .sort((a, b) => (parseInt(b.bitrate || 0, 10) - parseInt(a.bitrate || 0, 10)))[0];

      if (audioFormat && audioFormat.url) {
        streamCache.set(cleanId, { timestamp: Date.now(), streamUrl: audioFormat.url });
        return audioFormat.url;
      }
    } catch (e) {
      // Try next host
    }
  }

  // Fallback direct audio relay
  return `https://yewtu.be/latest_version?id=${cleanId}&itag=140`;
}

// Audio proxy streaming with HTTP 206 Partial Content
async function proxyAudio(targetUrl, req, res) {
  try {
    const range = req.headers.range;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };
    if (range) headers['Range'] = range;

    const upstream = await fetch(targetUrl, { headers });
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || contentType.includes('text/html')) {
      return res.status(502).json({
        error: 'Upstream returned non-audio response',
        status: upstream.status,
        contentType
      });
    }

    res.status(upstream.status);

    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    for (const h of forwardHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message });
    }
  }
}

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------

// Search
app.get(['/api/music/search', '/api/youtube/search'], async (req, res) => {
  try {
    const query = req.query.q || 'phonk music';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 40);

    const cacheKey = `${query.toLowerCase()}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
      return res.json({ success: true, count: cached.results.length, tracks: cached.results });
    }

    const results = await searchWithPlaywright(query, limit);
    searchCache.set(cacheKey, { timestamp: Date.now(), results });
    res.json({ success: true, count: results.length, tracks: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trending
app.get('/api/music/trending', async (req, res) => {
  try {
    const genre = req.query.genre || '';
    const query = genre ? `${genre} trending music` : 'trending music phonk electronic 2026';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 30);
    const results = await searchWithPlaywright(query, limit);
    res.json({ success: true, count: results.length, genre, tracks: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stream
app.get(['/api/youtube/stream/:videoId', '/api/music/stream/:id'], async (req, res) => {
  try {
    const id = req.params.videoId || req.params.id;
    const streamUrl = await getAudioStreamUrl(id);
    await proxyAudio(streamUrl, req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send(`Stream error: ${err.message}`);
  }
});

// General Proxy Stream
app.get('/api/music/proxy-stream', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send('Missing url');
    await proxyAudio(url, req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send(`Proxy error: ${err.message}`);
  }
});

// Models
app.get('/api/models', (req, res) => {
  res.json({
    success: true,
    models: [
      { id: 'Ani.vrm', name: 'Ani', type: 'VRM', url: '/models/Ani.vrm' },
      { id: 'riko.vrm', name: 'riko', type: 'VRM', url: '/models/riko.vrm' },
      { id: 'student.vrm', name: 'student', type: 'VRM', url: '/models/student.vrm' }
    ]
  });
});

// Tracks
app.get('/api/tracks', (req, res) => {
  res.json({
    success: true,
    tracks: [
      {
        id: 'brawl_stars_phonk',
        title: 'Brawl Stars Phonk (Drift Mix)',
        artist: 'Cyber Funk',
        file: '/tracks/brawl_stars_phonk.mp3',
        fileName: 'brawl_stars_phonk.mp3',
        bpm: 99.4,
        duration: 110.36,
        analysis: { bpm: 99.4, duration: 110.36, beats: [] }
      },
      {
        id: 'cyber_phonk_140',
        title: 'Cyber Phonk 140',
        artist: 'GhostxBlade',
        file: '/tracks/cyber_phonk_140.mp3',
        fileName: 'cyber_phonk_140.mp3',
        bpm: 140.0,
        duration: 45.0,
        analysis: { bpm: 140.0, duration: 45.0, beats: [] }
      },
      {
        id: 'future_idol_128',
        title: 'Future Idol 128',
        artist: 'K-Pop AI Studio',
        file: '/tracks/future_idol_128.mp3',
        fileName: 'future_idol_128.mp3',
        bpm: 128.0,
        duration: 45.0,
        analysis: { bpm: 128.0, duration: 45.0, beats: [] }
      }
    ]
  });
});

// Default catch-all
app.use((req, res) => {
  res.json({ success: true, message: 'CyberDance API Engine Online (Vercel)' });
});

export default app;
