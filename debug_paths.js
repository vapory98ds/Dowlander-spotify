const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');

console.log('--- PATH DEBUG ---');
console.log('__dirname:', __dirname);
console.log('ffmpegPath:', ffmpegPath);
console.log('ffmpeg exists:', fs.existsSync(ffmpegPath));

const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
console.log('yt-dlp path:', ytdlpPath);
console.log('yt-dlp exists:', fs.existsSync(ytdlpPath));

const tempDir = path.join(__dirname, 'temp');
console.log('temp dir:', tempDir);
console.log('temp dir exists:', fs.existsSync(tempDir));
