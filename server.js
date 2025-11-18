// server.js - 3I/ATLAS Tracker server with background cache
// Requires: express, cheerio, cors
// Uses native Node.js fetch (available in Node 18+)
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(express.static(path.join(__dirname)));

// Simple rate limiting (in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const record = rateLimitMap.get(ip);
  
  if (now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: Math.ceil((record.resetTime - now) / 1000) });
  }
  
  record.count++;
  next();
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

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

const REFRESH_INTERVAL_HOURS = Number(process.env.REFRESH_INTERVAL_HOURS || 1); // default every 1 hour
const REFRESH_INTERVAL_MS = Math.max(60, REFRESH_INTERVAL_HOURS * 3600) * 1000; // ensure at least 60s
const DISTANCE_REFRESH_SECONDS = 10; // refresh distance every 10 seconds

// Luminosity (magnitude) refresh: every 1 hour
// To change frequency, modify the interval below or set REFRESH_INTERVAL_HOURS environment variable

// Helper to fetch and parse TheSkyLive for /c2025n1-info
async function fetchTheSkyLive(){
  const url = 'https://theskylive.com/c2025n1-info';
  try{
    const res = await fetch(url, { timeout: 20000 });
    const text = await res.text();
    const $ = cheerio.load(text);
    const pageText = $('body').text();
    
    // Enhanced magnitude matching - try multiple patterns to catch "10.1"
    // Pattern 1: "observed magnitude 10.1" or similar
    let obs = pageText.match(/observed\s+mag(?:nitude)?\s*[:\-]?\s*(\d{1,2}\.\d{1,2})/i);
    // Pattern 2: "Magnitude: 10.1" or "Current Magnitude 10.1"
    if (!obs) obs = pageText.match(/(?:current\s+)?magnitude\s*[:\-]?\s*(\d{1,2}\.\d{1,2})/i);
    // Pattern 3: "10.1" that appears near brightness/visual
    if (!obs) obs = pageText.match(/visual\s*[:\-]?\s*(\d{1,2}\.\d{1,2})/i);
    // Pattern 4: Look for any number pattern that matches typical magnitude range (0-18)
    if (!obs) {
      const allNumbers = pageText.match(/(\d{1,2}\.\d{1,2})/g);
      // Filter for valid magnitude values (0-18)
      if (allNumbers) {
        const validMags = allNumbers.filter(n => {
          const num = parseFloat(n);
          return num >= 0 && num <= 18;
        });
        if (validMags.length > 0) {
          // Take the first valid magnitude found
          obs = [validMags[0], validMags[0]];
        }
      }
    }
    
    // Predicted magnitude
    let pred = pageText.match(/predicted\s+mag(?:nitude)?\s*[:\-]?\s*(\d{1,2}\.\d{1,2})/i);
    
    // Extract distance to Earth (in km) - look for patterns like "310,769,103.3 kilometers" or "123,456 km"
    const dist = pageText.match(/distance(?:\s+to\s+)?(?:earth)?[\s\D]*([0-9]{1,10}(?:,?[0-9]{3})*(?:\.\d+)?)\s*(?:km|kilometers)/i);
    const distanceKm = dist ? parseFloat(dist[1].replace(/,/g, '')) : null;
    
    console.log(`[TheSkyLive] obs: ${obs?.[1] || 'null'}, pred: ${pred?.[1] || 'null'}, dist: ${distanceKm || 'null'}`);
    
    return { 
      url, 
      rawSnippet: pageText.slice(0,1200), 
      observedMag: obs ? parseFloat(obs[1]) : null, 
      predictedMag: pred ? parseFloat(pred[1]) : null, 
      distanceKm 
    };
  }catch(e){
    console.error(`[TheSkyLive] Fetch error: ${e.toString()}`);
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
    let latestMag = null; 
    let note = null;
    
    // Search for C/2025 N1 entries with magnitude values
    for (let ln of lines){
      if (cometRe.test(ln)){
        // Try multiple magnitude extraction patterns
        let m = ln.match(/mag\.?\s*=?\s*(\d{1,2}\.\d{1,2})/i) || 
                 ln.match(/magnitude\s*[:\-]?\s*(\d{1,2}\.\d{1,2})/i) ||
                 ln.match(/(\d{1,2}\.\d{1,2})/);
        
        if (m){ 
          const candidateMag = parseFloat(m[1]);
          // Validate magnitude is in reasonable range (0-18)
          if (candidateMag >= 0 && candidateMag <= 18) {
            latestMag = candidateMag;
            note = ln.slice(0, 300);
            console.log(`[COBS] Found magnitude: ${latestMag} in line: ${ln.substring(0, 100)}`);
            break;
          }
        }
      }
    }
    
    console.log(`[COBS] Latest mag found: ${latestMag || 'null'}`);
    return { url, rawSnippet: bodyText.slice(0,1200), latestMag, note };
  }catch(e){
    console.error(`[COBS] Fetch error: ${e.toString()}`);
    return { url, error: e.toString() };
  }
}

// Refresh job: fetch both sources and update cache
async function refreshCache(){
  try{
    console.log('\n=== REFRESHING CACHE ===', new Date().toISOString());
    const [ts, cobs] = await Promise.all([fetchTheSkyLive(), fetchCOBS()]);
    cache.updated = new Date().toISOString();
    cache.raw = { theskylive: ts, cobs: cobs };
    
    // Validate and sanitize magnitude values (must be between 0 and 30)
    const validateMag = (mag) => {
      const num = parseFloat(mag);
      return (num >= 0 && num <= 30 && isFinite(num)) ? num : null;
    };
    
    // Validate distance (must be positive and reasonable for solar system)
    const validateDistance = (dist) => {
      const num = parseFloat(dist);
      return (num > 0 && num < 1e12 && isFinite(num)) ? num : null;
    };
    
    // choose priority: use COBS latest if present, else observed from theSkyLive, else predicted
    cache.latestMag = validateMag(cobs?.latestMag) ?? validateMag(ts?.observedMag) ?? validateMag(ts?.predictedMag) ?? null;
    cache.observedMag = validateMag(ts?.observedMag) ?? null;
    cache.predictedMag = validateMag(ts?.predictedMag) ?? null;
    cache.distanceKm = validateDistance(ts?.distanceKm) ?? null;
    cache.source = (cobs?.latestMag ? 'COBS' : (ts?.observedMag ? 'TheSkyLive(observed)' : (ts?.predictedMag ? 'TheSkyLive(predicted)' : 'none')));
    
    console.log(`[CACHE] Latest mag: ${cache.latestMag} from ${cache.source}`);
    console.log(`[CACHE] Observed: ${cache.observedMag}, Predicted: ${cache.predictedMag}, Distance: ${cache.distanceKm}`);
    
    // Detect abnormal brightness: comet should get fainter (higher mag) as it recedes
    // If current magnitude is significantly brighter (lower) than previous, it's abnormal
    if(cache.previousMag !== null && cache.latestMag !== null){
      const magDiff = cache.previousMag - cache.latestMag; // positive = got brighter (abnormal)
      cache.magStatus = (magDiff > 0.3) ? 'abnormal' : 'normal'; // threshold: 0.3 magnitude units brighter
      console.log(`[CACHE] Magnitude changed by ${magDiff.toFixed(2)} (${cache.previousMag.toFixed(2)} → ${cache.latestMag.toFixed(2)}): ${cache.magStatus}`);
    } else {
      cache.magStatus = 'normal';
    }
    cache.previousMag = cache.latestMag;
    
    console.log('=== CACHE UPDATE COMPLETE ===\n');
  }catch(e){
    console.error('[CACHE] refreshCache failed', e);
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
app.get('/api/test', rateLimit, (req,res)=>{
  res.json({ ok:true, server:'3I-ATLAS-Tracker', timestamp:new Date().toISOString(), note:'Test endpoint' });
});

// Return cached/latest reading
app.get('/api/latest', rateLimit, (req,res)=>{
  res.json({ ok:true, cache });
});

// Quick distance endpoint (fetches fresh without waiting for cache)
app.get('/api/distance', rateLimit, async (req,res)=>{
  const result = await fetchTheSkyLive();
  // Validate distance before sending
  const validateDistance = (dist) => {
    const num = parseFloat(dist);
    return (num > 0 && num < 1e12 && isFinite(num)) ? num : null;
  };
  res.json({ ok:true, distanceKm: validateDistance(result.distanceKm), timestamp: new Date().toISOString() });
});

// Individual scraping endpoints for diagnostics (also update cache if immediate fetch needed)
app.get('/api/theskylive', rateLimit, async (req,res)=>{
  const result = await fetchTheSkyLive();
  res.json(result);
});

app.get('/api/cobs', rateLimit, async (req,res)=>{
  const result = await fetchCOBS();
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on port',PORT));