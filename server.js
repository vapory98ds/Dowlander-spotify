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

// Helper: Download Image
async function downloadImage(url) {
    if (!url) return null;
    try {
        const response = await axios({ url, responseType: 'arraybuffer' });
        return response.data;
    } catch (e) { return null; }
}

// Helper: Run yt-dlp via yt-dlp-exec
async function downloadAudio(query, outputPath) {
    try {
        log(`Executing yt-dlp-exec for: ${query}`);
        await ytDlp(`ytsearch1:${query}`, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            ffmpegLocation: path.dirname(ffmpegPath),
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        if (fs.existsSync(outputPath)) {
            log(`Success: File created at ${outputPath}`);
            return outputPath;
        } else {
            throw new Error('yt-dlp sub-process completed but output file is missing.');
        }
    } catch (error) {
        log(`yt-dlp Error: ${error.message}`);
        throw error;
    }
}

// Track download sessions (in-memory)
const trackSessions = {};

// Endpoint: Start Track Download
app.post('/api/start-track-download', async (req, res) => {
    try {
        const { name, artist, image } = req.body;
        if (!name || !artist) throw new Error('Missing name or artist');

        const sessionId = 'trk_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        log(`[Track] Starting session ${sessionId} for "${name}" by "${artist}"`);

        trackSessions[sessionId] = {
            name, artist, image, status: 'downloading',
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
        const query = `${session.artist} - ${session.name} audio`;
        const safeName = session.name.replace(/[^a-z0-9]/gi, '_');
        const tempFile = path.join(TEMP_DIR, `${sessionId}_${safeName}.mp3`);

        await downloadAudio(query, tempFile);

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
            const query = `${track.artist} - ${track.name} audio`;
            const safeName = track.name.replace(/[^a-z0-9 ]/gi, '').trim();
            const tempFile = path.join(TEMP_DIR, `${sessionId}_${i}_${safeName}.mp3`);

            log(`[Album ${sessionId}] Downloading ${i + 1}/${tracks.length}: ${track.name}`);
            await downloadAudio(query, tempFile);

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
        let name = 'Unknown', artist = 'Unknown', image = '';
        try {
            const preview = await getPreview(url);
            name = preview.title || 'Unknown';
            artist = preview.artist || preview.description || 'Unknown';
            image = preview.image || '';
            log(`[Info] Preview OK: ${name} by ${artist}`);
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
                tracks = trackList.map(t => ({
                    name: t.name || 'Unknown',
                    artist: t.artist || 'Unknown',
                    image: image
                }));
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
                    tracks = rawTracks.map(t => ({
                        name: t.title || t.name || 'Unknown',
                        artist: t.subtitle || artist || 'Unknown',
                        image: image
                    }));
                } catch (dataErr) {
                    log(`[Info] getData fallback failed: ${dataErr.message}`);
                    console.error('getData error:', dataErr);
                }
            }
        }

        const result = { type, name, artist, image, tracks };
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
