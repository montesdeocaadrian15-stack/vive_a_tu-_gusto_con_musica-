const audio = document.getElementById('audioPlayer');
const fileInput = document.getElementById('trackInput');
const playlistElement = document.getElementById('playlist');
const playButton = document.getElementById('playButton');
const playerStatus = document.getElementById('playerStatus');
const audioStatus = document.getElementById('audioStatus');
const canvas = document.getElementById('audioCanvas');
const canvasContext = canvas.getContext('2d');
const tracks = [];

let currentTrackIndex = -1;
let audioContext;
let bassFilter;
let midFilter;
let trebleFilter;
let analyser;
let masterGain;
let leftChannelGain;
let rightChannelGain;
let stereoPanner;
let animationFrame;
let spatialPanFrame;
let spatialEffectEnabled = localStorage.getItem('neonWave8d') === 'on';

let sfxContext;
let sfxEnabled = localStorage.getItem('neonWaveSfx') !== 'off';
let toastTimeout;

function getSfxContext() {
    if (!sfxEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sfxContext) sfxContext = new AudioContextClass();
    if (sfxContext.state === 'suspended') sfxContext.resume();
    return sfxContext;
}

function playTone(frequency, startOffset, duration, volume = 0.025, type = 'sine') {
    const context = getSfxContext();
    if (!context) return;

    const start = context.currentTime + startOffset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
}

function playSfx(name) {
    const profiles = {
        click: () => playTone(620, 0, 0.055, 0.018, 'triangle'),
        hover: () => playTone(420, 0, 0.035, 0.008, 'sine'),
        play: () => {
            playTone(330, 0, 0.11, 0.022, 'sine');
            playTone(495, 0.08, 0.14, 0.018, 'sine');
        },
        pause: () => {
            playTone(440, 0, 0.09, 0.018, 'triangle');
            playTone(330, 0.055, 0.11, 0.014, 'triangle');
        },
        next: () => {
            playTone(520, 0, 0.07, 0.018, 'triangle');
            playTone(700, 0.06, 0.09, 0.018, 'triangle');
        },
        previous: () => {
            playTone(700, 0, 0.07, 0.018, 'triangle');
            playTone(520, 0.06, 0.09, 0.018, 'triangle');
        },
        added: () => {
            playTone(440, 0, 0.09, 0.018, 'sine');
            playTone(660, 0.08, 0.10, 0.018, 'sine');
            playTone(880, 0.16, 0.13, 0.016, 'sine');
        },
        preset: () => {
            playTone(550, 0, 0.08, 0.018, 'triangle');
            playTone(825, 0.07, 0.11, 0.018, 'triangle');
        },
        selected: () => {
            playTone(740, 0, 0.08, 0.015, 'triangle');
            playTone(990, 0.05, 0.11, 0.012, 'triangle');
        },
        error: () => {
            playTone(180, 0, 0.16, 0.025, 'sawtooth');
            playTone(135, 0.12, 0.18, 0.022, 'sawtooth');
        }
    };
    profiles[name]?.();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function updateSfxToggle() {
    const toggle = document.getElementById('sfxToggle');
    toggle.setAttribute('aria-pressed', String(sfxEnabled));
    toggle.textContent = sfxEnabled ? '🔊 EFECTOS ON' : '🔇 EFECTOS OFF';
}

const equalizerControls = {
    bass: document.getElementById('bassSlider'),
    mid: document.getElementById('midSlider'),
    treble: document.getElementById('trebleSlider')
};

const channelControls = {
    left: document.getElementById('leftVolumeSlider'),
    right: document.getElementById('rightVolumeSlider')
};

const presets = {
    balanced: [0, 0, 0],
    bass: [6, 1, 0],
    vocal: [-2, 4, 3]
};

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}

function setPlayerStatus(message, isError = false) {
    playerStatus.textContent = message;
    playerStatus.style.color = isError ? '#ff007f' : '';
}

function updateChannelGain(channel) {
    const control = channelControls[channel];
    const volume = Number(control.value) / 100;
    document.getElementById(`${channel}VolumeValue`).textContent = `${control.value}%`;
    const gainNode = channel === 'left' ? leftChannelGain : rightChannelGain;
    if (gainNode && audioContext) {
        gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.02);
    }
}

function updateSpatialToggle() {
    const toggle = document.getElementById('spatialToggle');
    toggle.setAttribute('aria-pressed', String(spatialEffectEnabled));
    toggle.textContent = spatialEffectEnabled ? '8D ACTIVADO' : '8D DESACTIVADO';
}

function animateSpatialPan() {
    if (!spatialEffectEnabled || audio.paused || !stereoPanner || !audioContext) return;

    const cycle = 8000;
    const pan = Math.sin((performance.now() / cycle) * Math.PI * 2);
    stereoPanner.pan.value = pan;
    spatialPanFrame = requestAnimationFrame(animateSpatialPan);
}

function stopSpatialPan() {
    cancelAnimationFrame(spatialPanFrame);
    spatialPanFrame = undefined;
    if (stereoPanner && audioContext) {
        stereoPanner.pan.setTargetAtTime(0, audioContext.currentTime, 0.08);
    }
}

function updatePlaylist() {
    playlistElement.replaceChildren();

    if (tracks.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'library-empty';
        emptyMessage.textContent = 'Tus canciones añadidas aparecerán aquí.';
        playlistElement.appendChild(emptyMessage);
        return;
    }

    tracks.forEach((track, index) => {
        const button = document.createElement('button');
        button.className = 'library-track';
        button.type = 'button';
        button.textContent = `${String(index + 1).padStart(2, '0')}  ${track.name}`;
        button.setAttribute('aria-current', String(index === currentTrackIndex));
        button.addEventListener('click', () => {
            playSfx('selected');
            playTrack(index, true);
        });
        playlistElement.appendChild(button);
    });
}

function loadTrack(index) {
    currentTrackIndex = index;
    const track = tracks[index];
    audio.src = track.url;
    audio.load();
    document.getElementById('trackTitle').textContent = track.name;
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('duration').textContent = '0:00';
    document.getElementById('seekSlider').value = '0';
    playButton.disabled = false;
    updatePlaylist();
}

function setupAudioGraph() {
    if (audioContext) return true;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        audioStatus.textContent = 'Tu navegador no admite el ecualizador de audio.';
        return false;
    }

    try {
        audioContext = new AudioContextClass();
        const source = audioContext.createMediaElementSource(audio);

        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 150;

        midFilter = audioContext.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 0.8;

        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 5000;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;

        masterGain = audioContext.createGain();
        masterGain.gain.value = Number(document.getElementById('volumeSlider').value) / 100;

        leftChannelGain = audioContext.createGain();
        rightChannelGain = audioContext.createGain();
        leftChannelGain.gain.value = Number(channelControls.left.value) / 100;
        rightChannelGain.gain.value = Number(channelControls.right.value) / 100;

        const channelSplitter = audioContext.createChannelSplitter(2);
        const channelMerger = audioContext.createChannelMerger(2);
        if (typeof audioContext.createStereoPanner === 'function') {
            stereoPanner = audioContext.createStereoPanner();
            stereoPanner.pan.value = 0;
            masterGain.connect(stereoPanner);
            stereoPanner.connect(channelSplitter);
        } else {
            masterGain.connect(channelSplitter);
        }

        channelSplitter.connect(leftChannelGain, 0);
        channelSplitter.connect(rightChannelGain, 1);
        leftChannelGain.connect(channelMerger, 0, 0);
        rightChannelGain.connect(channelMerger, 0, 1);
        channelMerger.connect(audioContext.destination);

        source
            .connect(bassFilter)
            .connect(midFilter)
            .connect(trebleFilter)
            .connect(analyser)
            .connect(masterGain);

        Object.entries(equalizerControls).forEach(([band, control]) => {
            const filter = { bass: bassFilter, mid: midFilter, treble: trebleFilter }[band];
            filter.gain.value = Number(control.value);
        });
        return true;
    } catch (error) {
        audioContext = undefined;
        audioStatus.textContent = 'No se pudo inicializar el procesamiento de audio.';
        console.error('Error al configurar el audio:', error);
        return false;
    }
}

async function playTrack(index, shouldPlay) {
    if (index !== currentTrackIndex) loadTrack(index);
    if (!shouldPlay) return;

    const hasAudioGraph = setupAudioGraph();
    if (!hasAudioGraph) {
        audio.volume = Number(document.getElementById('volumeSlider').value) / 100;
    }

    try {
        if (audioContext?.state === 'suspended') {
            await audioContext.resume();
        }
        await audio.play();
    } catch (error) {
        setPlayerStatus('No se pudo reproducir este archivo. Prueba con otro formato de audio.', true);
        audioStatus.textContent = 'No se pudo iniciar la reproducción.';
        console.error('Error al reproducir la pista:', error);
    }
}

function updateEqualizer(band) {
    const control = equalizerControls[band];
    const value = Number(control.value);
    document.getElementById(`${band}Value`).textContent = `${value > 0 ? '+' : ''}${value} dB`;

    if (audioContext) {
        const filter = { bass: bassFilter, mid: midFilter, treble: trebleFilter }[band];
        filter.gain.setTargetAtTime(value, audioContext.currentTime, 0.02);
    }

    document.querySelectorAll('.preset-button').forEach((button) => {
        button.setAttribute('aria-pressed', 'false');
    });
}

function applyPreset(name) {
    presets[name].forEach((value, index) => {
        const band = ['bass', 'mid', 'treble'][index];
        equalizerControls[band].value = String(value);
        updateEqualizer(band);
    });
    document.querySelector(`[data-preset="${name}"]`).setAttribute('aria-pressed', 'true');
}

function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    canvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (audio.paused) drawIdleVisualizer();
}

function drawIdleVisualizer() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvasContext.clearRect(0, 0, width, height);
    canvasContext.fillStyle = 'rgba(0, 5, 15, 0.8)';
    canvasContext.fillRect(0, 0, width, height);
    canvasContext.strokeStyle = 'rgba(0, 240, 255, 0.22)';
    canvasContext.beginPath();
    canvasContext.moveTo(0, height / 2);
    canvasContext.lineTo(width, height / 2);
    canvasContext.stroke();
}

function renderVisualizer() {
    if (audio.paused || !analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvasContext.fillStyle = 'rgba(0, 5, 15, 0.28)';
    canvasContext.fillRect(0, 0, width, height);

    const gap = 4;
    const barWidth = Math.max(1, (width - gap * data.length) / data.length);
    const gradient = canvasContext.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#0088ff');
    gradient.addColorStop(0.55, '#00f0ff');
    gradient.addColorStop(1, '#ff007f');
    canvasContext.fillStyle = gradient;

    data.forEach((value, index) => {
        const barHeight = Math.max(2, (value / 255) * height);
        canvasContext.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
    });

    animationFrame = requestAnimationFrame(renderVisualizer);
}

fileInput.addEventListener('change', () => {
    const newFiles = Array.from(fileInput.files || []);
    newFiles.forEach((file) => {
        tracks.push({ name: file.name, url: URL.createObjectURL(file) });
    });

    if (newFiles.length > 0) {
        updatePlaylist();
        if (currentTrackIndex === -1) {
            loadTrack(0);
            setPlayerStatus('Canción lista. Pulsa reproducir cuando quieras.');
            showToast(`${newFiles.length} ${newFiles.length === 1 ? 'canción añadida' : 'canciones añadidas'} a tu biblioteca`);
        } else {
            setPlayerStatus(`${newFiles.length} ${newFiles.length === 1 ? 'canción añadida' : 'canciones añadidas'} a tu cola.`);
            showToast(`${newFiles.length} ${newFiles.length === 1 ? 'canción añadida' : 'canciones añadidas'} a tu cola`);
        }
        playSfx('added');
    }

    fileInput.value = '';
});

playButton.addEventListener('click', () => {
    if (audio.paused) {
        playTrack(currentTrackIndex, true);
    } else {
        audio.pause();
    }
});

document.getElementById('previousButton').addEventListener('click', () => {
    if (tracks.length > 0) {
        playSfx('previous');
        playTrack((currentTrackIndex - 1 + tracks.length) % tracks.length, true);
    }
});

document.getElementById('nextButton').addEventListener('click', () => {
    if (tracks.length > 0) {
        playSfx('next');
        playTrack((currentTrackIndex + 1) % tracks.length, true);
    }
});

document.getElementById('seekSlider').addEventListener('input', (event) => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    }
});

document.getElementById('volumeSlider').addEventListener('input', (event) => {
    const volume = Number(event.target.value) / 100;
    document.getElementById('volumeValue').textContent = `${event.target.value}%`;
    if (masterGain && audioContext) {
        masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.02);
    } else {
        audio.volume = volume;
    }
});

Object.entries(channelControls).forEach(([channel, control]) => {
    control.addEventListener('input', () => updateChannelGain(channel));
});

Object.entries(equalizerControls).forEach(([band, control]) => {
    control.addEventListener('input', () => updateEqualizer(band));
});

document.querySelectorAll('.preset-button').forEach((button) => {
    button.addEventListener('click', () => {
        playSfx('preset');
        applyPreset(button.dataset.preset);
        showToast(`Preajuste ${button.textContent.trim()} aplicado`);
    });
});

document.getElementById('sfxToggle').addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('neonWaveSfx', sfxEnabled ? 'on' : 'off');
    updateSfxToggle();
    if (sfxEnabled) {
        playSfx('preset');
        showToast('Efectos de interfaz activados');
    } else {
        showToast('Efectos de interfaz desactivados');
    }
});

document.getElementById('spatialToggle').addEventListener('click', () => {
    spatialEffectEnabled = !spatialEffectEnabled;
    localStorage.setItem('neonWave8d', spatialEffectEnabled ? 'on' : 'off');
    updateSpatialToggle();
    if (spatialEffectEnabled) {
        if (stereoPanner) {
            animateSpatialPan();
        } else if (audioContext) {
            spatialEffectEnabled = false;
            localStorage.setItem('neonWave8d', 'off');
            updateSpatialToggle();
            showToast('El efecto 8D no está disponible en este navegador');
            return;
        }
        showToast('Efecto 8D activado');
    } else {
        stopSpatialPan();
        showToast('Efecto 8D desactivado');
    }
});

document.querySelectorAll('button, .file-picker').forEach((element) => {
    element.addEventListener('pointerenter', () => playSfx('hover'));
    element.addEventListener('pointerdown', () => playSfx('click'));
});

audio.addEventListener('loadedmetadata', () => {
    document.getElementById('duration').textContent = formatTime(audio.duration);
});

audio.addEventListener('timeupdate', () => {
    document.getElementById('currentTime').textContent = formatTime(audio.currentTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        document.getElementById('seekSlider').value = String((audio.currentTime / audio.duration) * 100);
    }
});

audio.addEventListener('play', () => {
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label', 'Pausar');
    playerStatus.textContent = 'Reproduciendo ahora.';
    playSfx('play');
    if (spatialEffectEnabled && stereoPanner) animateSpatialPan();
    audioStatus.textContent = analyser
        ? (spatialEffectEnabled && !stereoPanner
            ? 'Analizando el sonido en vivo. El efecto 8D no está disponible en este navegador.'
            : 'Analizando el sonido en vivo.')
        : 'El ecualizador, el visualizador y el efecto 8D no están disponibles en este navegador.';
    cancelAnimationFrame(animationFrame);
    renderVisualizer();
});

audio.addEventListener('pause', () => {
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', 'Reproducir');
    if (currentTrackIndex !== -1) playerStatus.textContent = 'Reproducción en pausa.';
    playSfx('pause');
    stopSpatialPan();
    audioStatus.textContent = 'El espectro aparecerá al reproducir una canción.';
    cancelAnimationFrame(animationFrame);
    drawIdleVisualizer();
});

audio.addEventListener('ended', () => {
    if (tracks.length > 1) playTrack((currentTrackIndex + 1) % tracks.length, true);
});

audio.addEventListener('error', () => {
    if (audio.error) {
        setPlayerStatus('No se pudo cargar el archivo de audio seleccionado.', true);
        playSfx('error');
        showToast('No se pudo cargar la pista');
    }
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => {
    tracks.forEach((track) => URL.revokeObjectURL(track.url));
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    if (sfxContext && sfxContext.state !== 'closed') sfxContext.close();
});

applyPreset('balanced');
updateSfxToggle();
updateSpatialToggle();
Object.keys(channelControls).forEach(updateChannelGain);
resizeCanvas();
