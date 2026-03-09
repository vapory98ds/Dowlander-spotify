const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function test() {
    try {
        console.log('Testing @distube/ytdl-core...');
        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

        console.log(`Getting info for ${url}...`);
        const info = await ytdl.getBasicInfo(url);
        console.log(`Title: ${info.videoDetails.title}`);

        console.log('Streaming to test_ytdl.mp3...');
        ytdl(url, { quality: 'highestaudio' })
            .pipe(fs.createWriteStream('test_ytdl.mp3'))
            .on('finish', () => console.log('Download complete!'))
            .on('error', (err) => console.error('Stream Error:', err));

    } catch (e) {
        console.error('YTDL Error:', e);
    }
}

test();
