const fetch = require('node-fetch');
const { getData } = require('spotify-url-info')(fetch);

async function test() {
    // A known Album URL (e.g., Enjambre - Noches de Salon)
    const url = 'https://open.spotify.com/album/5uM8a6q9QzXqWec1kG2Q9s?si=example';
    console.log(`Testing URL: ${url}`);

    try {
        const data = await getData(url);
        console.log('--- TYPE ---');
        console.log(data.type);
        console.log('--- TRACKS STRUCTURE ---');

        if (data.tracks) {
            if (Array.isArray(data.tracks)) {
                console.log(`data.tracks is Array (len ${data.tracks.length})`);
                console.log(data.tracks[0]);
            } else if (data.tracks.items) {
                console.log(`data.tracks.items is Array (len ${data.tracks.items.length})`);
                console.log(data.tracks.items[0]);
            } else {
                console.log('data.tracks structure unknown:', Object.keys(data.tracks));
            }
        } else {
            console.log('data.tracks is MISSING');
            console.log('Keys:', Object.keys(data));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
