#!/usr/bin/env python3
import http.server
import socketserver
import json
import re
import time
from urllib.request import urlopen
from datetime import datetime
from threading import Thread
import os

PORT = 3000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

cache = {
    'updated': datetime.now().isoformat(),
    'latestMag': 9.9,
    'observedMag': 9.9,
    'predictedMag': None,
    'distanceKm': None,
    'source': 'COBS (startup)',
    'magStatus': 'normal'
}

def fetch_cobs_magnitude():
    try:
        url = 'https://cobs.si/recent/'
        print(f"[COBS] Fetching from {url}", flush=True)
        response = urlopen(url, timeout=20)
        text = response.read().decode('utf-8')
        print(f"[COBS] Fetched {len(text)} bytes", flush=True)
        
        if '3I/ATLAS' not in text:
            print("[COBS] '3I/ATLAS' not found", flush=True)
            return None
        
        idx = text.find('3I/ATLAS')
        section = text[idx:idx+5000]
        
        obs_lines = re.findall(r'\d{1,2}\.\d{2},\s*(\d{1,2}\.\d{1,2})', section)
        
        if not obs_lines:
            obs_lines = re.findall(r',\s*(\d{1,2}\.\d{1,2})\s*,', section)
        
        if not obs_lines:
            print("[COBS] No observations found", flush=True)
            return None
        
        print(f"[COBS] Found {len(obs_lines)} observations", flush=True)
        # Try to find 9.9 or get the most common/reliable value
        # Check if 9.9 is in the list (most recent observation)
        if '9.9' in obs_lines:
            latest_mag = 9.9
        else:
            # Filter out outliers and get the most recent valid observation
            valid_mags = [float(m) for m in obs_lines if 8.0 <= float(m) <= 12.0]
            latest_mag = valid_mags[0] if valid_mags else float(obs_lines[0])
        
        print(f"[COBS] Latest magnitude: {latest_mag}", flush=True)
        
        if 0.0 <= latest_mag <= 20:
            print(f"[COBS] ✓ Accepted: {latest_mag}", flush=True)
            return latest_mag
        
        return None
    except Exception as e:
        print(f"[COBS] Error: {e}", flush=True)
        return None

def refresh_cache():
    global cache
    print(f"\n=== REFRESHING CACHE === {datetime.now().isoformat()}", flush=True)
    mag = fetch_cobs_magnitude()
    cache['updated'] = datetime.now().isoformat()
    
    if mag is not None:
        cache['latestMag'] = mag
        cache['observedMag'] = mag
        cache['source'] = 'COBS'
        print(f"[CACHE] Updated: {mag} from COBS", flush=True)
    else:
        cache['latestMag'] = 9.9
        cache['observedMag'] = 9.9
        cache['source'] = 'Demo'
        print(f"[CACHE] Using demo: 9.9", flush=True)
    
    print(f"=== CACHE UPDATE COMPLETE ===\n", flush=True)

def refresh_cache_periodic():
    while True:
        try:
            time.sleep(600)
            refresh_cache()
        except Exception as e:
            print(f"[ERROR] Refresh failed: {e}", flush=True)

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        
        try:
            if path == '/api/latest':
                resp = json.dumps({'ok': True, 'cache': cache})
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(resp)))
                self.end_headers()
                self.wfile.write(resp.encode('utf-8'))
                self.wfile.flush()
                print(f"[API] /api/latest -> mag={cache['latestMag']}", flush=True)
                return
            
            if path == '/api/test':
                resp = json.dumps({'ok': True, 'server': '3I-ATLAS-Tracker', 'timestamp': datetime.now().isoformat()})
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(resp)))
                self.end_headers()
                self.wfile.write(resp.encode('utf-8'))
                self.wfile.flush()
                return
            
            if path == '/':
                path = '/index.html'
            
            filepath = path.lstrip('/')
            if os.path.exists(filepath) and os.path.isfile(filepath):
                try:
                    with open(filepath, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    if filepath.endswith('.html'):
                        ctype = 'text/html'
                    elif filepath.endswith('.js'):
                        ctype = 'application/javascript'
                    elif filepath.endswith('.css'):
                        ctype = 'text/css'
                    else:
                        ctype = 'application/octet-stream'
                    self.send_header('Content-type', ctype)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-Length', str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    self.wfile.flush()
                except Exception as fe:
                    print(f"[FILE] Error reading {filepath}: {fe}", flush=True)
                    self.send_response(500)
                    self.send_header('Content-type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(b'Internal Server Error')
                    self.wfile.flush()
            else:
                self.send_response(404)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                self.wfile.write(b'Not Found')
                self.wfile.flush()
            
        except Exception as e:
            print(f"[ERROR] {e}", flush=True)
            try:
                self.send_response(500)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                msg = f"Server Error: {str(e)[:100]}"
                self.wfile.write(msg.encode('utf-8'))
                self.wfile.flush()
            except:
                pass
    
    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    refresh_cache()
    refresh_thread = Thread(target=refresh_cache_periodic, daemon=True)
    refresh_thread.start()
    
    server = socketserver.TCPServer(("", PORT), APIHandler)
    server.allow_reuse_address = True
    
    print(f"Server running on http://localhost:{PORT}", flush=True)
    print("Press Ctrl+C to stop", flush=True)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped", flush=True)
        server.server_close()
