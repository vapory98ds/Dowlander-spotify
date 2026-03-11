const API_BASE = ''; // Relative path for same-origin

let currentData = null;

async function fetchInfo() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return alert('Por favor ingresa un enlace.');

    const loader = document.getElementById('loader');
    const card = document.getElementById('resultCard');
    const btn = document.getElementById('searchBtn');

    loader.classList.remove('hidden');
    card.classList.add('hidden');
    card.classList.remove('show');
    btn.disabled = true;

    // Reset progress visual
    const visualColumn = document.getElementById('visualStatusColumn');
    if (visualColumn) {
        visualColumn.classList.add('hidden');
        visualColumn.style.display = 'none';
    }
    const visualDownloading = document.getElementById('visualDownloading');
    if (visualDownloading) visualDownloading.style.display = 'none';
    const visualFinished = document.getElementById('visualFinished');
    if (visualFinished) visualFinished.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);

        if (!response.ok) {
            throw new Error(`Server Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        currentData = data;
        renderData(data);
    } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
    } finally {
        loader.classList.add('hidden');
        btn.disabled = false;
    }
}

function renderData(data) {
    const card = document.getElementById('resultCard');

    document.getElementById('albumArt').src = data.image || '';
    document.getElementById('trackTitle').innerText = data.name;
    document.getElementById('artistName').innerText = data.artist;
    document.getElementById('typeBadge').innerText = data.type.toUpperCase();

    const trackListContainer = document.getElementById('trackListContainer');
    const downloadBtn = document.getElementById('downloadBtn');

    if (data.type === 'album' || data.type === 'playlist') {
        trackListContainer.classList.remove('hidden');
        document.getElementById('trackCount').innerText = data.tracks.length;

        const ul = document.getElementById('trackList');
        ul.innerHTML = '';
        data.tracks.forEach((t, index) => {
            const li = document.createElement('li');
            li.id = `track-${index}`;
            li.innerHTML = `
                <span>${index + 1}. ${t.name} <span style="opacity:0.5; font-size:0.8em">${t.artist}</span></span>
                <span class="track-status pending" id="status-${index}">⏳</span>
            `;
            ul.appendChild(li);
        });

        downloadBtn.innerHTML = `📦 Descargar Álbum Completo (ZIP)`;
    } else {
        trackListContainer.classList.add('hidden');
        downloadBtn.innerHTML = `⬇️ Descargar Canción`;
    }

    card.classList.remove('hidden');
    setTimeout(() => card.classList.add('show'), 100);
}

async function startDownload() {
    if (!currentData) return;

    const statusMsg = document.getElementById('statusMsg');
    const downloadBtn = document.getElementById('downloadBtn');

    downloadBtn.disabled = true;
    statusMsg.className = 'status';
    statusMsg.innerText = "Conectando al servidor...";

    try {
        if (currentData.type === 'track') {
            await downloadTrack();
        } else {
            await downloadAlbum();
        }
    } catch (e) {
        console.error(e);
        statusMsg.innerText = "Error: " + e.message;
        statusMsg.className = 'status error';
    } finally {
        downloadBtn.disabled = false;
    }
}

async function downloadTrack() {
    const statusMsg = document.getElementById('statusMsg');
    statusMsg.innerText = "⏳ Inicializando descarga...";
    statusMsg.className = 'status';

    const visualColumn = document.getElementById('visualStatusColumn');
    const visualDownloading = document.getElementById('visualDownloading');
    const visualFinished = document.getElementById('visualFinished');
    const visualPercent = document.getElementById('visualPercent');
    const walkingImage = document.getElementById('walkingImage');
    const walkingFill = document.getElementById('walkingFill');

    visualColumn.classList.remove('hidden');
    visualColumn.style.display = 'block';
    visualDownloading.style.display = 'flex';
    visualFinished.style.display = 'none';
    visualPercent.innerText = 'Iniciando conexión...';
    if (walkingImage) walkingImage.style.right = '100%';
    if (walkingFill) walkingFill.style.width = '0%';

    let dynamicProgress = 0;
    
    // Función para avanzar la barra progresivamente
    const advanceProgress = (amount, max) => {
        if (dynamicProgress < max) {
            dynamicProgress += amount;
            if (dynamicProgress > max) dynamicProgress = max;
            if (walkingImage) walkingImage.style.right = `${100 - dynamicProgress}%`;
            if (walkingFill) walkingFill.style.width = `${dynamicProgress}%`;
        }
    };

    try {
        const startResponse = await fetch(`${API_BASE}/api/start-track-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: currentData.id,
                name: currentData.name,
                artist: currentData.artist,
                image: currentData.image || ''
            })
        });

        if (!startResponse.ok) {
            const errText = await startResponse.text();
            throw new Error(`Error al iniciar descarga: ${errText}`);
        }

        const { sessionId } = await startResponse.json();
        statusMsg.innerText = "🎶 Conectando al servidor...";

        // Listen for progress via SSE
        await new Promise((resolve, reject) => {
            const eventSource = new EventSource(`${API_BASE}/api/track-progress/${sessionId}`);

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.status === 'downloading') {
                    visualPercent.innerText = data.message || 'Descargando...';
                    // Avanzar la barra en función del texto recibido.
                    // Esto da una sensación de avance real sin depender de un set interval ciego.
                    if (data.message.includes('SoundCloud')) advanceProgress(25, 30);
                    else if (data.message.includes('Audiomack')) advanceProgress(25, 30);
                    else if (data.message.includes('Turbo')) advanceProgress(40, 70);
                    else if (data.message.includes('metadatos')) advanceProgress(20, 95);
                    else advanceProgress(5, 95); // Heartbeat genérico
                } else if (data.status === 'done') {
                    eventSource.close();
                    resolve();
                } else if (data.status === 'error') {
                    eventSource.close();
                    reject(new Error(data.error || 'Error procesando pista'));
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                reject(new Error('Conexión perdida con el servidor de descargas'));
            };
        });

        statusMsg.innerText = "✅ ¡Listo! Empaquetando archivo final...";

        const fileResponse = await fetch(`${API_BASE}/api/download-track-file/${sessionId}`);
        if (!fileResponse.ok) throw new Error('Error al obtener el MP3 final');

        const blob = await fileResponse.blob();
        triggerDownload(blob, `${currentData.name}.mp3`);

        if (walkingImage) walkingImage.style.right = '0%';
        if (walkingFill) walkingFill.style.width = '100%';

        visualDownloading.style.display = 'none';
        visualFinished.style.display = 'flex';

        statusMsg.innerText = "✅ ¡Canción descargada con éxito!";
        statusMsg.className = 'status success';
    } catch (e) {
        console.error(e);
        statusMsg.innerText = "Error: " + e.message;
        statusMsg.className = 'status error';
    }
}

async function downloadAlbum() {
    const statusMsg = document.getElementById('statusMsg');

    const visualColumn = document.getElementById('visualStatusColumn');
    const visualDownloading = document.getElementById('visualDownloading');
    const visualFinished = document.getElementById('visualFinished');
    const visualPercent = document.getElementById('visualPercent');
    const walkingImage = document.getElementById('walkingImage');
    const walkingFill = document.getElementById('walkingFill');

    visualColumn.classList.remove('hidden');
    visualColumn.style.display = 'block';
    visualDownloading.style.display = 'flex';
    visualFinished.style.display = 'none';
    visualPercent.innerText = '0%';
    if (walkingImage) walkingImage.style.right = '100%';
    if (walkingFill) walkingFill.style.width = '0%';

    // Step 1: Start album download (get session ID)
    const startResponse = await fetch(`${API_BASE}/api/start-album-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentData)
    });

    if (!startResponse.ok) {
        throw new Error('Error al iniciar descarga del álbum');
    }

    const { sessionId, total } = await startResponse.json();
    progressText.innerText = `Descargando 0 de ${total} canciones...`;

    // Step 2: Listen for progress via SSE
    await new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${API_BASE}/api/album-progress/${sessionId}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'track') {
                // Update track status
                const li = document.getElementById(`track-${data.index}`);
                const statusIcon = document.getElementById(`status-${data.index}`);

                if (li && statusIcon) {
                    if (data.success) {
                        li.classList.add('downloaded');
                        statusIcon.className = 'track-status success';
                        statusIcon.innerText = '✅';
                    } else {
                        li.classList.add('failed');
                        statusIcon.className = 'track-status error';
                        statusIcon.innerText = '❌';
                    }
                }

                // Update progress bar
                const percent = Math.round((data.completed / data.total) * 100);
                progressFill.style.width = `${percent}%`;
                progressPercent.innerText = `${percent}%`;
                progressText.innerText = `Descargando ${data.completed} de ${data.total} canciones...`;
                
                visualPercent.innerText = `${percent}%`;
                if (walkingImage) walkingImage.style.right = `${100 - percent}%`;
                if (walkingFill) walkingFill.style.width = `${percent}%`;

                // Scroll to track
                if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            if (data.type === 'done') {
                eventSource.close();

                if (data.status === 'done') {
                    visualPercent.innerText = '100%';
                    if (walkingImage) walkingImage.style.right = '0%';
                    if (walkingFill) walkingFill.style.width = '100%';
                    resolve();
                } else {
                    reject(new Error('Error procesando álbum'));
                }
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            reject(new Error('Conexión perdida con el servidor'));
        };
    });

    // Step 3: Download the ZIP
    statusMsg.innerText = 'Descargando archivo ZIP...';

    const zipResponse = await fetch(`${API_BASE}/api/download-album-zip/${sessionId}`);
    if (!zipResponse.ok) throw new Error('Error descargando ZIP');

    const blob = await zipResponse.blob();
    triggerDownload(blob, `${currentData.name}.zip`);

    visualDownloading.style.display = 'none';
    visualFinished.style.display = 'flex';

    progressText.innerText = '🎉 ¡Álbum descargado con éxito!';
    statusMsg.innerText = '✅ ¡Descarga completada!';
    statusMsg.className = 'status success';
}

function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}
