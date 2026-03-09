// Script de prueba para dlapi.app
const trackId = '7FxaIJrCTlq2mHhcIdq3pA'; // José José - Amar Sin Ser Amado

const endpoints = [
    `https://api.dlapi.app/spotify/track?id=${trackId}`,
    `https://api.dlapi.app/spotify?trackid=${trackId}`,
    `https://api.dlapi.app/spotify/download?id=${trackId}`,
    `https://api.dlapi.app/download?url=https://open.spotify.com/track/${trackId}`,
    `https://api.dlapi.app/spotify?id=${trackId}`,
    `https://api.dlapi.app/track?id=${trackId}`,
];

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

async function testEndpoint(url) {
    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        console.log(`\n✅ URL: ${url}`);
        console.log(`   Status: ${res.status}`);
        try {
            const json = JSON.parse(text);
            const dl = json?.data?.download || json?.link || json?.url || json?.download;
            console.log(`   Download link: ${dl || 'NO ENCONTRADO'}`);
            console.log(`   Respuesta: ${JSON.stringify(json).substring(0, 200)}`);
        } catch {
            console.log(`   Respuesta texto: ${text.substring(0, 300)}`);
        }
    } catch (e) {
        console.log(`\n❌ URL: ${url}`);
        console.log(`   Error: ${e.message}`);
    }
}

(async () => {
    console.log('=== Prueba de endpoints dlapi.app ===');
    console.log(`Track ID: ${trackId}\n`);
    for (const url of endpoints) {
        await testEndpoint(url);
    }
    console.log('\n=== Fin de prueba ===');
})();
