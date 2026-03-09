const { spawn } = require('child_process');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');

const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const TEMP_DIR = path.join(__dirname, 'temp');

// Log manually to file to avoid console mess
const logFile = fs.createWriteStream('debug_final.log');
function log(msg) {
    console.log(msg);
    logFile.write(msg + '\n');
}

function downloadAudio(query, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            `ytsearch1:${query}`,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--ffmpeg-location', `"${path.dirname(ffmpegPath)}"`,
            '-o', `"${outputPath}"`,
            '--verbose' // Add verify
        ];

        log(`Spawning (shell): "${YTDLP_PATH}" ${args.join(' ')}`);

        // Use shell: true
        // INHERIT STDIO to see if pipe was the issue
        const child = spawn(`"${YTDLP_PATH}"`, args, {
            shell: true,
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                log('Success: Exit Code 0');
                resolve(outputPath);
            } else {
                log(`Failed with code ${code}`);
                reject(new Error(`Exit code ${code}`));
            }
        });

        child.on('error', (err) => {
            log(`Spawn Error: ${err.message}`);
            reject(err);
        });
    });
}

downloadAudio('Enjambre - Enemigo Noches de Salón audio', path.join(TEMP_DIR, 'debug_final.mp3'))
    .catch(err => log(`Catch: ${err.message}`));
