const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');

async function test() {
    try {
        console.log('Testing yt-dlp-wrap...');
        const ytDlpWrap = new YTDlpWrap(path.join(__dirname, 'yt-dlp.exe'));

        console.log('Getting version...');
        const version = await ytDlpWrap.execPromise(['--version']);
        console.log('Version:', version);

        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        console.log(`Downloading audio from ${url}...`);

        // Stream to file
        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        console.log('FFmpeg Path:', ffmpegPath);

        const readableStream = ytDlpWrap.execStream([
            url,
            '-f', 'bestaudio',
            '--ffmpeg-location', path.dirname(ffmpegPath) // Pass folder
        ]);

        readableStream.pipe(require('fs').createWriteStream('test_ytdlp.webm'));

        readableStream.on('close', () => {
            console.log('Download finished!');
        });

        readableStream.on('error', (err) => {
            console.error('Stream Error:', err);
        });

    } catch (e) {
        console.error('Test Error:', e);
    }
}

test();
