const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { getData, getPreview, getTracks, getDetails } = require('spotify-url-info')(fetch);
const NodeID3 = require('node-id3');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'server_debug.log');

// Clear debug log
try { fs.writeFileSync(LOG_FILE, ''); } catch (e) { }

// Sync Logging
function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) {
        console.error('Logging failed:', e);
    }
}

// Temp Dir
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Global Request Logger - CRITICAL
app.use((req, res, next) => {
    log(`[Incoming] ${req.method} ${req.url}`);
    next();
});

// Ruta base para UptimeRobot (evitar que la app se duerma en Render)
app.get('/ping', (req, res) => {
    res.send('Servidor de Xavi M. online 24/7 ✅');
});
app.get('/', (req, res) => {
    res.send('Servidor de Xavi en línea y funcionando 24/7');
});

// ============================================================
// ENDPOINT DE DIAGNÓSTICO TEMPORAL - Probar dlapi.app desde Render
// Usa: GET /api/test-dlapi?id=SPOTIFY_TRACK_ID
// ============================================================
app.get('/api/test-dlapi', async (req, res) => {
    const trackId = req.query.id || '7FxaIJrCTlq2mHhcIdq3pA';
    const endpoints = [
        `https://api.dlapi.app/spotify/track?id=${trackId}`,
        `https://api.dlapi.app/spotify?id=${trackId}`,
        `https://api.dlapi.app/track?id=${trackId}`,
        `https://api.dlapi.app/download?url=https://open.spotify.com/track/${trackId}`,
        `https://api.dlapi.app/api/spotify?id=${trackId}`,
        `https://api.dlapi.app/spotify/download?id=${trackId}`
    ];

    const results = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };

    for (const url of endpoints) {
        try {
            const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { }
            results.push({ url, status: r.status, response: json || text.substring(0, 300), hasDownload: !!(json?.data?.download || json?.link || json?.url) });
        } catch (e) {
            results.push({ url, error: e.message });
        }
    }
    res.json({ trackId, results });
});

// Helper: Download Image
async function downloadImage(url) {
    if (!url) return null;
    try {
        const response = await axios({ url, responseType: 'arraybuffer' });
        return response.data;
    } catch (e) { return null; }
}

// Helper: Download file from URL
async function downloadFile(url, outputPath) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fallo al descargar archivo: ${response.statusText}`);
    const buffer = await response.buffer();
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

// Helper: Download via dlapi.app (API confiable verificada)
async function downloadWithDlapi(trackId, outputPath) {
    // NOTA: api.dlapi.app tarda >15s en responder desde Render, usar timeout de 60s
    const endpoints = [
        `https://api.dlapi.app/spotify/track?id=${trackId}`,
        `https://api.dlapi.app/spotify?trackid=${trackId}`,
        `https://api.dlapi.app/spotify?id=${trackId}`
    ];

    for (const url of endpoints) {
        try {
            log(`[dlapi] Intentando: ${url} (timeout: 60s)`);
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(60000) // 60 segundos - la API es lenta pero responde
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // Formato: { status: true, data: { download: '...', title: '...', author: '...' } }
            const downloadUrl = data?.data?.download || data?.link || data?.url || data?.download;
            if (downloadUrl) {
                log(`[dlapi] ¡Link obtenido! Descargando MP3...`);
                await downloadFile(downloadUrl, outputPath);
                return true;
            }
            log(`[dlapi] Respuesta recibida pero sin link: ${JSON.stringify(data).substring(0, 150)}`);
        } catch (e) {
            log(`[dlapi Error] ${url}: ${e.message}`);
        }
    }
    return false;
}

// Motor principal de descarga
async function downloadAudio(trackId, trackName, trackArtist, outputPath) {
    const query = `${trackArtist} - ${trackName} audio`;

    // NIVEL 1: dlapi.app (API confiable verificada por el usuario)
    log(`[Motor] Intentando dlapi.app para ID: ${trackId}...`);
    const ok = await downloadWithDlapi(trackId, outputPath);
    if (ok) {
        log(`[Motor] ¡Éxito! Descargado vía dlapi.app`);
        return outputPath;
    }

    // NIVEL 2: yt-dlp con cookies (fallback final)
    log(`[Motor] dlapi.app falló. Usando fallback yt-dlp...`);
    return await downloadAudioFallback(query, outputPath);
}

// Fallback: yt-dlp con cliente iOS (no requiere PO Token) + SoundCloud
async function downloadAudioFallback(query, outputPath) {
    const cookiesPath = (() => {
        const paths = [
            path.join(__dirname, 'cookies.txt'),
            path.join(__dirname, 'docs', 'www.youtube.com_cookies.txt'),
            path.join(__dirname, 'docs', 'cookies.txt')
        ];
        for (const p of paths) { if (fs.existsSync(p)) return p; }
        return null;
    })();

    if (cookiesPath) log(`[Cookies] Usando: ${cookiesPath}`);
    else log('[Cookies] Sin cookies');

    const baseOpts = {
        extractAudio: true, audioFormat: 'mp3', audioQuality: 0,
        ffmpegLocation: path.dirname(ffmpegPath),
        output: outputPath,
        noCheckCertificates: true, noWarnings: true, preferFreeFormats: true,
        addHeader: [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language: es-ES,es;q=0.9,en;q=0.8'
        ]
    };
    if (cookiesPath) baseOpts.cookies = cookiesPath;

    // INTENTO 1: SoundCloud (no bloquea IPs de datacenter)
    try {
        log(`[SC] Buscando en SoundCloud: ${query}`);
        const scOpts = { ...baseOpts, noPlaylist: true };
        await ytDlp(`scsearch1:${query}`, scOpts);
        if (fs.existsSync(outputPath)) {
            log('[SC] ¡Éxito! Descargado desde SoundCloud');
            return outputPath;
        }
    } catch (e) {
        log(`[SC Error] ${e.message.substring(0, 120)}`);
    }

    // INTENTO 2: YouTube con cliente iOS (no requiere PO Token desde datacenter)
    try {
        log(`[YT-iOS] Intentando YouTube con cliente iOS...`);
        const iosOpts = {
            ...baseOpts,
            extractorArgs: 'youtube:player_client=ios',
            noPlaylist: true
        };
        await ytDlp(`ytsearch1:${query}`, iosOpts);
        if (fs.existsSync(outputPath)) {
            log('[YT-iOS] ¡Éxito! Descargado desde YouTube vía cliente iOS');
            return outputPath;
        }
    } catch (e) {
        log(`[YT-iOS Error] ${e.message.substring(0, 120)}`);
    }

    // INTENTO 3: YouTube con cliente TV Embedded (alternativa)
    try {
        log(`[YT-TV] Intentando YouTube con cliente TV Embedded...`);
        const tvOpts = {
            ...baseOpts,
            extractorArgs: 'youtube:player_client=tv_embedded',
            noPlaylist: true
        };
        await ytDlp(`ytsearch1:${query}`, tvOpts);
        if (fs.existsSync(outputPath)) {
            log('[YT-TV] ¡Éxito! Descargado desde YouTube vía TV Embedded');
            return outputPath;
        }
    } catch (e) {
        log(`[YT-TV Error] ${e.message.substring(0, 120)}`);
    }

    throw new Error('Todos los métodos fallaron: SoundCloud, iOS y TV Embedded');
}

// Track download sessions (in-memory)
const trackSessions = {};

// Endpoint: Start Track Download
app.post('/api/start-track-download', async (req, res) => {
    try {
        const { id, name, artist, image } = req.body;
        if (!id || !name || !artist) throw new Error('Missing track data (id, name, or artist)');

        const sessionId = 'trk_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        log(`[Track] Starting session ${sessionId} for "${name}" by "${artist}" (ID: ${id})`);

        trackSessions[sessionId] = {
            id, name, artist, image, status: 'downloading',
            filePath: null, error: null
        };

        // Start processing in background
        processTrack(sessionId);

        res.json({ sessionId });
    } catch (e) {
        log(`Track Start Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Background track processing
async function processTrack(sessionId) {
    const session = trackSessions[sessionId];
    if (!session) return;

    try {
        const safeName = session.name.replace(/[^a-z0-9]/gi, '_');
        const tempFile = path.join(TEMP_DIR, `${sessionId}_${safeName}.mp3`);

        await downloadAudio(session.id, session.name, session.artist, tempFile);

        const cover = await downloadImage(session.image);
        NodeID3.write({ title: session.name, artist: session.artist, APIC: cover }, tempFile);

        session.filePath = tempFile;
        session.status = 'done';
        log(`[Track] ${sessionId} Ready`);
    } catch (e) {
        session.error = e.message;
        session.status = 'error';
        log(`[Track] ${sessionId} Error: ${e.message}`);
    }
}

// SSE: Track Progress Stream
app.get('/api/track-progress/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = trackSessions[sessionId];

    if (!session) return res.status(404).json({ error: 'Session not found' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const interval = setInterval(() => {
        if (session.status === 'done' || session.status === 'error') {
            res.write(`data: ${JSON.stringify({ status: session.status, error: session.error })}\n\n`);
            clearInterval(interval);
            res.end();
        } else {
            // Heartbeat against Render's 100s timeout
            res.write(`data: ${JSON.stringify({ status: 'downloading' })}\n\n`);
        }
    }, 1500);

    req.on('close', () => clearInterval(interval));
});

// Download the generated track
app.get('/api/download-track-file/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = trackSessions[sessionId];

    if (!session || session.status !== 'done') return res.status(404).send('File not ready');

    res.download(session.filePath, `${session.name}.mp3`, (err) => {
        setTimeout(() => {
            try { if (fs.existsSync(session.filePath)) fs.unlinkSync(session.filePath); } catch (e) { }
            delete trackSessions[sessionId];
        }, 5000);
    });
});

// Album download sessions (in-memory)
const albumSessions = {};

// Helper: Download multiple tracks in parallel (concurrency limit)
async function downloadParallel(tasks, concurrency, onProgress) {
    const results = [];
    let currentIndex = 0;

    async function worker() {
        while (currentIndex < tasks.length) {
            const idx = currentIndex++;
            try {
                const result = await tasks[idx]();
                results[idx] = { success: true, result };
                onProgress(idx, true);
            } catch (e) {
                results[idx] = { success: false, error: e.message };
                onProgress(idx, false, e.message);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

// Endpoint: Start Album Download (returns session ID)
app.post('/api/start-album-download', async (req, res) => {
    try {
        const { name: albumName, tracks, image: albumCover } = req.body;
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        log(`[Album] Starting session ${sessionId} for "${albumName}" (${tracks.length} tracks)`);

        albumSessions[sessionId] = {
            albumName,
            tracks,
            albumCover,
            status: 'downloading',
            progress: [],
            completed: 0,
            total: tracks.length,
            createdFiles: [],
            zipReady: false,
            zipPath: null
        };

        // Start download in background
        processAlbum(sessionId);

        res.json({ sessionId, total: tracks.length });
    } catch (e) {
        log(`Album Start Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Background album processing
async function processAlbum(sessionId) {
    const session = albumSessions[sessionId];
    if (!session) return;

    const { albumName, tracks, albumCover } = session;
    const cover = await downloadImage(albumCover);
    const folderName = albumName.replace(/[^a-z0-9 ]/gi, '').trim();

    // Create download tasks
    const tasks = tracks.map((track, i) => {
        return async () => {
            const safeName = track.name.replace(/[^a-z0-9 ]/gi, '').trim();
            const tempFile = path.join(TEMP_DIR, `${sessionId}_${i}_${safeName}.mp3`);

            log(`[Album ${sessionId}] Downloading ${i + 1}/${tracks.length}: ${track.name} (ID: ${track.id})`);
            await downloadAudio(track.id, track.name, track.artist, tempFile);

            NodeID3.write({
                title: track.name,
                artist: track.artist,
                album: albumName,
                trackNumber: `${i + 1}/${tracks.length}`,
                APIC: cover
            }, tempFile);

            session.createdFiles.push({ path: tempFile, name: `${folderName}/${track.name}.mp3` });
            return tempFile;
        };
    });

    // Run 2 concurrent downloads
    await downloadParallel(tasks, 2, (idx, success, errMsg) => {
        session.completed++;
        session.progress.push({
            index: idx,
            name: tracks[idx].name,
            success,
            error: errMsg || null
        });
        log(`[Album ${sessionId}] Progress: ${session.completed}/${session.total}`);
    });

    // Create ZIP
    try {
        const zipPath = path.join(TEMP_DIR, `${sessionId}_${folderName}.zip`);
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 6 } }); // level 6 for speed

            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);

            session.createdFiles.forEach(f => {
                if (fs.existsSync(f.path)) {
                    archive.file(f.path, { name: f.name });
                }
            });

            archive.finalize();
        });

        session.zipPath = zipPath;
        session.zipReady = true;
        session.status = 'done';
        log(`[Album ${sessionId}] ZIP ready: ${zipPath}`);
    } catch (e) {
        session.status = 'error';
        log(`[Album ${sessionId}] ZIP Error: ${e.message}`);
    }
}

// SSE: Album Progress Stream
app.get('/api/album-progress/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = albumSessions[sessionId];

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    let lastSent = 0;

    const interval = setInterval(() => {
        // Send new progress events
        while (lastSent < session.progress.length) {
            const p = session.progress[lastSent];
            res.write(`data: ${JSON.stringify({ type: 'track', ...p, completed: lastSent + 1, total: session.total })}\n\n`);
            lastSent++;
        }

        // Check if done
        if (session.status === 'done' || session.status === 'error') {
            res.write(`data: ${JSON.stringify({ type: 'done', status: session.status, completed: session.completed, total: session.total })}\n\n`);
            clearInterval(interval);
            res.end();
        }
    }, 500);

    req.on('close', () => clearInterval(interval));
});

// Download the generated ZIP
app.get('/api/download-album-zip/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = albumSessions[sessionId];

    if (!session || !session.zipReady) {
        return res.status(404).send('ZIP not ready');
    }

    res.download(session.zipPath, `${session.albumName}.zip`, (err) => {
        // Cleanup after download
        setTimeout(() => {
            session.createdFiles.forEach(f => {
                try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) { }
            });
            try { if (fs.existsSync(session.zipPath)) fs.unlinkSync(session.zipPath); } catch (e) { }
            delete albumSessions[sessionId];
        }, 5000);
    });
});

// Info Endpoint
app.get('/api/info', async (req, res) => {
    try {
        const { url } = req.query;
        log(`[Info] ${url}`);

        // Determine type from URL
        const isAlbum = url.includes('/album/');
        const isPlaylist = url.includes('/playlist/');
        const type = isAlbum ? 'album' : (isPlaylist ? 'playlist' : 'track');
        log(`[Info] Detected type: ${type}`);

        // Step 1: Get preview for basic info
        let name = 'Unknown', artist = 'Unknown', image = '', id = '';
        try {
            const preview = await getPreview(url);
            name = preview.title || 'Unknown';
            artist = preview.artist || preview.description || 'Unknown';
            image = preview.image || '';
            // Extract ID from URL for single tracks
            if (type === 'track') {
                const parts = url.split('/');
                id = parts[parts.length - 1].split('?')[0];
            }
            log(`[Info] Preview OK: ${name} by ${artist} (ID: ${id})`);
        } catch (previewErr) {
            log(`[Info] getPreview error: ${previewErr.message}`);
            console.error('getPreview error:', previewErr);
        }

        // Step 2: Get tracks for albums/playlists
        let tracks = [];
        if (type === 'album' || type === 'playlist') {
            log(`[Info] Fetching tracks for ${type}...`);

            // Method 1: getTracks (returns clean data)
            try {
                const trackList = await getTracks(url);
                log(`[Info] getTracks returned ${trackList.length} tracks`);
                tracks = trackList.map(t => {
                    // Extract ID from URI (spotify:track:ID)
                    const trackId = t.uri ? t.uri.split(':').pop() : '';
                    return {
                        id: trackId,
                        name: t.name || 'Unknown',
                        artist: t.artist || 'Unknown',
                        image: image
                    };
                });
            } catch (tracksErr) {
                log(`[Info] getTracks failed: ${tracksErr.message}`);
                console.error('getTracks error:', tracksErr);
            }

            // Method 2: Fallback to getData.trackList
            if (tracks.length === 0) {
                log(`[Info] Trying getData fallback...`);
                try {
                    const data = await getData(url);
                    const rawTracks = data.trackList || [];
                    log(`[Info] getData.trackList has ${rawTracks.length} items`);
                    tracks = rawTracks.map(t => {
                        const trackId = t.id || (t.uri ? t.uri.split(':').pop() : '');
                        return {
                            id: trackId,
                            name: t.title || t.name || 'Unknown',
                            artist: t.subtitle || artist || 'Unknown',
                            image: image
                        };
                    });
                } catch (dataErr) {
                    log(`[Info] getData fallback failed: ${dataErr.message}`);
                    console.error('getData error:', dataErr);
                }
            }
        }

        const result = { type, name, artist, image, id, tracks };
        log(`[Info] Returning: type=${type}, name=${name}, tracks=${tracks.length}`);
        res.json(result);
    } catch (e) {
        log(`[Info] FATAL Error: ${e.message}`);
        console.error('Info FATAL:', e);
        res.status(500).json({ error: e.message });
    }
});

// Bind to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    log(`Server listening on http://0.0.0.0:${PORT}`);

    // Get local network IP and show QR
    const os = require('os');
    const qrcode = require('qrcode-terminal');
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
    }

    const url = `http://${localIP}:${PORT}`;
    console.log('\n========================================');
    console.log(`  🌐 Local:   http://localhost:${PORT}`);
    console.log(`  📱 Red:     ${url}`);
    console.log('========================================');
    console.log('\n📱 Escanea el QR con tu teléfono:\n');
    qrcode.generate(url, { small: true });
    console.log('');
});
