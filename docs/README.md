# 🎵 Spotify Downloader - Documentación

## Descripción
Aplicación web local para descargar música de Spotify en formato MP3.
- **Canciones individuales**: Se descargan como `.mp3` con metadatos (título, artista, carátula).
- **Álbumes completos**: Se descargan como `.zip` con una carpeta que contiene todas las canciones.

---

## Requisitos Previos

| Requisito | Versión Mínima | Verificar con |
|-----------|---------------|---------------|
| **Node.js** | v16+ | `node -v` |
| **npm** | v8+ | `npm -v` |
| **Windows** | 10/11 | — |

---

## Librerías (Dependencias npm)

### Principales
| Librería | Función |
|----------|---------|
| `express` | Servidor web HTTP |
| `spotify-url-info` | Obtiene metadatos de Spotify (nombre, artista, canciones del álbum) |
| `node-fetch` | Requerido por `spotify-url-info` para hacer peticiones HTTP |
| `@ffmpeg-installer/ffmpeg` | Instala FFmpeg automáticamente (convierte audio a MP3) |
| `node-id3` | Escribe metadatos ID3 en archivos MP3 (título, artista, carátula) |
| `archiver` | Crea archivos ZIP para álbumes |
| `axios` | Descarga imágenes de carátula |
| `cors` | Permite peticiones entre diferentes puertos (desarrollo) |

### Binario externo
| Herramienta | Función |
|-------------|---------|
| `yt-dlp` | Busca y descarga audio de YouTube. Se descarga como `yt-dlp.exe` en la raíz del proyecto |

> **Nota**: `yt-dlp.exe` se descarga ejecutando `node init_ytdlp.js` (incluido en el proyecto).

---

## Instalación Paso a Paso

```bash
# 1. Clonar o copiar el proyecto
cd "spotify dowland"

# 2. Instalar todas las dependencias de Node.js
npm install

# 3. Descargar el binario yt-dlp (solo la primera vez)
node init_ytdlp.js

# 4. Iniciar el servidor
node server.js
```

## Uso

1. Abrir el navegador en: **http://localhost:3000**
2. Pegar un enlace de Spotify (canción o álbum)
3. Hacer clic en **Buscar**
4. Hacer clic en **Descargar**

---

## Estructura del Proyecto

```
spotify dowland/
├── server.js              # Servidor Express (backend)
├── init_ytdlp.js          # Script para descargar yt-dlp.exe
├── yt-dlp.exe             # Binario de yt-dlp (se genera con init_ytdlp.js)
├── package.json           # Dependencias del proyecto
├── docs/                  # Esta documentación
│   └── README.md
├── public/                # Frontend (interfaz web)
│   ├── index.html         # Página principal
│   ├── style.css          # Estilos
│   └── script.js          # Lógica del frontend
└── temp/                  # Archivos temporales de descarga (se limpian automáticamente)
```

---

## Comando Rápido (Instalar Todo)

```bash
npm install express spotify-url-info node-fetch@2 @ffmpeg-installer/ffmpeg node-id3 archiver axios cors
```

---

## Solución de Problemas

| Problema | Solución |
|----------|----------|
| `Server Error` al descargar | Verificar que `yt-dlp.exe` existe en la raíz del proyecto |
| `Failed to fetch` | Usar `http://localhost:3000` (NO usar Live Server puerto 5500) |
| `Canciones (0)` en álbumes | Reiniciar el servidor: cerrar terminal y ejecutar `node server.js` de nuevo |
| Descarga lenta | Normal, `yt-dlp` busca y convierte el audio. Una canción tarda ~30-60 segundos |
