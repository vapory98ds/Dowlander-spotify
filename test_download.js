const play = require('play-dl');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

async function test() {
    try {
        // Test 1: Direct URL
        console.log('--- TEST 1: Direct URL ---');
        const knownUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Never Gonna Give You Up
        console.log(`Streaming: ${knownUrl}`);

        try {
            const streamInfo = await play.stream(knownUrl);
            console.log(`Stream Type: ${streamInfo.type}`);
            console.log('Direct URL Stream SUCCESS');
        } catch (e) {
            console.error('Direct URL Stream FAILED:', e);
        }

        // Test 2: Search
        console.log('\n--- TEST 2: Search ---');
        const query = 'Enjambre - Enemigo Noches de Salón audio';
        const results = await play.search(query, { limit: 1 });

        if (!results || results.length === 0) {
            console.error('No results found');
        } else {
            console.log(`Found: ${results[0].title}`);
            console.log(`URL: ${results[0].url}`); // Check if this is a valid URL

            try {
                const streamInfo2 = await play.stream(results[0].url);
                console.log('Search Result Stream SUCCESS');
            } catch (e) {
                console.error('Search Result Stream FAILED:', e);
            }
        }

    } catch (e) {
        console.error('Global Error:', e);
    }
}

test();
