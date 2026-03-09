const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

async function init() {
    try {
        console.log('Downloading yt-dlp binary...');
        await YTDlpWrap.downloadFromGithub(
            path.join(__dirname, 'yt-dlp.exe')
        );
        console.log('Downloaded to yt-dlp.exe');

        const ytDlpWrap = new YTDlpWrap(path.join(__dirname, 'yt-dlp.exe'));
        const version = await ytDlpWrap.execPromise(['--version']);
        console.log('yt-dlp version:', version);

    } catch (e) {
        console.error('Init Error:', e);
    }
}

init();
