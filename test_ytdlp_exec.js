const ytDlp = require('yt-dlp-exec');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

async function test() {
    try {
        console.log("Starting yt-dlp-exec test...");
        const outPath = path.join(__dirname, 'temp', 'test_ytdlp_exec.mp3');
        await ytDlp(`ytsearch1:Scandalo al sole`, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            ffmpegLocation: path.dirname(ffmpegPath),
            output: outPath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });
        console.log("SUCCESS");
    } catch (e) {
        console.error("ERROR CAUGHT:");
        console.error(e);
    }
}
test();
