const fetch = require('node-fetch');
const spotifyInfo = require('spotify-url-info')(fetch);

const url = 'https://open.spotify.com/intl-es/album/0M56ul1MNAOoEvW6tvpar4?si=ibkA_fMgQ9u1pJabrz9TMg';

async function test() {
    console.log('=== Testing getPreview ===');
    try {
        const preview = await spotifyInfo.getPreview(url);
        console.log('Preview:', JSON.stringify(preview, null, 2));
    } catch (e) {
        console.log('getPreview FAILED:', e.message);
    }

    console.log('\n=== Testing getTracks ===');
    try {
        const tracks = await spotifyInfo.getTracks(url);
        console.log(`getTracks returned ${tracks.length} tracks`);
        if (tracks.length > 0) {
            console.log('First track:', JSON.stringify(tracks[0], null, 2));
            console.log('Track keys:', Object.keys(tracks[0]));
        }
    } catch (e) {
        console.log('getTracks FAILED:', e.message);
    }

    console.log('\n=== Testing getData ===');
    try {
        const data = await spotifyInfo.getData(url);
        console.log('Type:', data.type);
        console.log('Name:', data.name);
        console.log('Top keys:', Object.keys(data));
        if (data.trackList) {
            console.log(`trackList: ${data.trackList.length} items`);
            console.log('First:', JSON.stringify(data.trackList[0], null, 2));
        }
        if (data.tracks) {
            console.log('tracks keys:', Object.keys(data.tracks));
            if (data.tracks.items) {
                console.log(`tracks.items: ${data.tracks.items.length}`);
                console.log('First:', JSON.stringify(data.tracks.items[0], null, 2));
            }
        }
    } catch (e) {
        console.log('getData FAILED:', e.message);
    }
}

test();
