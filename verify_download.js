const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const outputPath = path.join(TEMP_DIR, 'verify_test.mp3');
if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

const args = [
    'ytsearch1:Enjambre - Enemigo Noches de Salón audio',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--ffmpeg-location', path.dirname(ffmpegPath),
    '-o', outputPath
];

console.log('Running execFile...');
execFile(YTDLP_PATH, args, (error, stdout, stderr) => {
    console.log('--- STDOUT ---');
    console.log(stdout);
    console.log('--- STDERR ---');
    console.log(stderr);

    if (error) {
        console.log(`Error Code: ${error.code}`);
        console.log(`Error Message: ${error.message}`);
    } else {
        console.log('Success (Exit Code 0)');
    }

    if (fs.existsSync(outputPath)) {
        console.log('VERIFICATION SUCCESS: File created successfully!');
        const stats = fs.statSync(outputPath);
        console.log(`File size: ${stats.size} bytes`);
    } else {
        console.log('VERIFICATION FAILED: File not created.');
    }
});
