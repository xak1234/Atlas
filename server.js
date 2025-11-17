// server.js - 3I/ATLAS Tracker server with background cache
// Requires: express, cheerio, cors
// Uses native Node.js fetch (available in Node 18+)
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Simple in-memory cache that is refreshed by a background job
let cache = {
  updated: null,
  latestMag: null,
  observedMag: null,
  predictedMag: null,
  distanceKm: null,
  source: null,
  magStatus: 'normal', // 'normal' or 'abnormal'
  previousMag: null,
  raw: {}
};

const REFRESH_INTERVAL_HOURS = Number(process.env.REFRESH_INTERVAL_HOURS || 6); // default every 6 hours
const REFRESH_INTERVAL_MS = Math.max(60, REFRESH_INTERVAL_HOURS * 3600) * 1000; // ensure at least 60s
const DISTANCE_REFRESH_SECONDS = 10; // refresh distance every 10 seconds

// Helper to fetch and parse TheSkyLive for /c2025n1-info
async function fetchTheSkyLive(){
  const url = 'https://theskylive.com/c2025n1-info';
  try{
    const res = await fetch(url, { timeout: 20000 });
    const text = await res.text();
    const $ = cheerio.load(text);
    const pageText = $('body').text();
    const obs = pageText.match(/observed\s+mag(?:nitude)?\D*([0-9]{1,2}\.\d{1,2})/i) || pageText.match(/observed\s*[:\-]\s*([0-9]{1,2}\.\d{1,2})/i);
    const pred = pageText.match(/predicted\s+mag(?:nitude)?\D*([0-9]{1,2}\.\d{1,2})/i) || pageText.match(/predicted\s*[:\-]\s*([0-9]{1,2}\.\d{1,2})/i);
    // Extract distance to Earth (in km) - look for patterns like "310,769,103.3 kilometers" or "123,456 km"
    const dist = pageText.match(/distance(?:\s+to\s+)?(?:earth)?[\s\D]*([0-9]{1,10}(?:,?[0-9]{3})*(?:\.\d+)?)\s*(?:km|kilometers)/i);
    const distanceKm = dist ? parseFloat(dist[1].replace(/,/g, '')) : null;
    return { url, rawSnippet: pageText.slice(0,1200), observedMag: obs?parseFloat(obs[1]):null, predictedMag: pred?parseFloat(pred[1]):null, distanceKm };
  }catch(e){
    return { url, error: e.toString() };
  }
}

// Helper to fetch and parse COBS recent page for mentions of C/2025 N1
async function fetchCOBS(){
  const url = 'https://cobs.si/recent/';
  try{
    const res = await fetch(url, { timeout: 20000 });
    const text = await res.text();
    const $ = cheerio.load(text);
    const bodyText = $('body').text();
    const cometRe = /C\/?\s*2025\s*N1/gi;
    const lines = bodyText.split(/\n+/).map(s=>s.trim()).filter(Boolean);
    let latestMag = null; let note = null;
    for (let ln of lines){
      if (cometRe.test(ln)){
        const m = ln.match(/mag\.?\s*=?\s*([0-9]{1,2}\.\d{1,2})/i) || ln.match(/([0-9]{1,2}\.\d{1,2})/);
        if (m){ latestMag = parseFloat(m[1]); note = ln.slice(0,300); break; }
      }
    }
    return { url, rawSnippet: bodyText.slice(0,1200), latestMag, note };
  }catch(e){
    return { url, error: e.toString() };
  }
}

// Refresh job: fetch both sources and update cache
async function refreshCache(){
  try{
    console.log('Refreshing cache:', new Date().toISOString());
    const [ts, cobs] = await Promise.all([fetchTheSkyLive(), fetchCOBS()]);
    cache.updated = new Date().toISOString();
    cache.raw = { theskylive: ts, cobs: cobs };
    // choose priority: use COBS latest if present, else observed from theSkyLive, else predicted
    cache.latestMag = cobs && cobs.latestMag ? cobs.latestMag : (ts && ts.observedMag ? ts.observedMag : (ts && ts.predictedMag ? ts.predictedMag : null));
    cache.observedMag = ts && ts.observedMag ? ts.observedMag : null;
    cache.predictedMag = ts && ts.predictedMag ? ts.predictedMag : null;
    cache.distanceKm = ts && ts.distanceKm ? ts.distanceKm : null;
    cache.source = cobs && cobs.latestMag ? 'COBS' : (ts && ts.observedMag ? 'TheSkyLive(observed)' : (ts && ts.predictedMag ? 'TheSkyLive(predicted)' : 'none'));
    
    // Detect abnormal brightness: comet should get fainter (higher mag) as it recedes
    // If current magnitude is significantly brighter (lower) than previous, it's abnormal
    if(cache.previousMag !== null && cache.latestMag !== null){
      const magDiff = cache.previousMag - cache.latestMag; // positive = got brighter (abnormal)
      cache.magStatus = (magDiff > 0.3) ? 'abnormal' : 'normal'; // threshold: 0.3 magnitude units brighter
      console.log(`Magnitude changed by ${magDiff.toFixed(2)} (${cache.previousMag.toFixed(2)} → ${cache.latestMag.toFixed(2)}): ${cache.magStatus}`);
    } else {
      cache.magStatus = 'normal';
    }
    cache.previousMag = cache.latestMag;
    
    console.log('Cache updated:', cache);
  }catch(e){
    console.error('refreshCache failed', e);
  }
}

// Separate refresh job for distance only (runs more frequently)
async function refreshDistance(){
  try{
    const ts = await fetchTheSkyLive();
    if(ts.distanceKm){
      cache.distanceKm = ts.distanceKm;
      console.log('Distance updated:', cache.distanceKm, 'km');
    }
  }catch(e){
    console.error('refreshDistance failed', e);
  }
}

// Start background refresh loops
(async function startRefreshLoops(){
  // initial refresh at startup
  await refreshCache();
  // then schedule magnitude cache (every 6 hours)
  setInterval(refreshCache, REFRESH_INTERVAL_MS);
  // and schedule distance refresh (every 10 seconds)
  setInterval(refreshDistance, DISTANCE_REFRESH_SECONDS * 1000);
})();

// Endpoints
app.get('/api/test', (req,res)=>{
  res.json({ ok:true, server:'3I-ATLAS-Tracker', timestamp:new Date().toISOString(), note:'Test endpoint' });
});

// Return cached/latest reading
app.get('/api/latest', (req,res)=>{
  res.json({ ok:true, cache });
});

// Quick distance endpoint (fetches fresh without waiting for cache)
app.get('/api/distance', async (req,res)=>{
  const result = await fetchTheSkyLive();
  res.json({ ok:true, distanceKm: result.distanceKm, timestamp: new Date().toISOString() });
});

// Individual scraping endpoints for diagnostics (also update cache if immediate fetch needed)
app.get('/api/theskylive', async (req,res)=>{
  const result = await fetchTheSkyLive();
  res.json(result);
});

app.get('/api/cobs', async (req,res)=>{
  const result = await fetchCOBS();
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on port',PORT));