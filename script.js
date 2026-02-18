// --- 常量与状态 ---
const AUDIO = document.getElementById('audio-player');
const PLAY_PAUSE_BTN = document.getElementById('play-pause-btn');
const NEXT_BTN = document.getElementById('next-btn');
const PREV_BTN = document.getElementById('prev-btn');
const PROGRESS_BAR = document.getElementById('progress-bar');
const CURRENT_TIME = document.getElementById('current-time');
const DURATION = document.getElementById('duration');
const CURRENT_TITLE = document.getElementById('current-title');
const CURRENT_ARTIST = document.getElementById('current-artist');
const ALBUM_COVER = document.getElementById('album-cover');
const LIST_TOGGLE_BTN = document.getElementById('list-toggle-btn');
const PLAYLIST_DIV = document.getElementById('playlist');
const SONG_LIST_UL = document.getElementById('song-list');
const MODE_BTN = document.getElementById('mode-btn');
const ALBUM_ART_DIV = document.querySelector('.album-art');
const ERROR_MESSAGE_DIV = document.getElementById('error-message');
const SEARCH_INPUT = document.getElementById('search-input');
const STORAGE_KEY = 'music_player_state_v1';

let playlist = [];
let currentSongIndex = -1;
let isPlaying = false;
let playMode = 'loop';
let wasPlayingBeforeDrag = false;
let dragInProgress = false;          // 新增：标记拖动中
let startX = 0;
const swipeThreshold = 50;

// --- 工具函数 ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// --- 骨架屏和错误处理工具函数 ---
function toggleSkeleton(isLoading) {
    [CURRENT_TITLE, CURRENT_ARTIST, ALBUM_ART_DIV].forEach(el => {
        if (isLoading) {
            el.classList.add('skeleton');
        } else {
            el.classList.remove('skeleton', 'skeleton-text', 'skeleton-text-small', 'skeleton-img');
        }
    });
    ALBUM_COVER.style.display = isLoading ? 'none' : 'block';
}

function showError(message) {
    ERROR_MESSAGE_DIV.textContent = message;
    ERROR_MESSAGE_DIV.classList.add('show');
    if (isPlaying) pauseSong();
}

function hideError() {
    ERROR_MESSAGE_DIV.classList.remove('show');
}

// --- 播放列表加载逻辑 ---
async function loadPlaylist() {
    toggleSkeleton(true);
    hideError();

    try {
        const response = await fetch('music_library.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        playlist = await response.json();

        if (playlist.length > 0) {
            renderPlaylist();
            const savedState = loadPlaybackState();
            if (savedState && savedState.index < playlist.length) {
                currentSongIndex = savedState.index;
                playMode = savedState.mode || 'loop';
                applyPlayModeUI();
                loadSong(currentSongIndex, savedState.time || 0);
                if (savedState.volume !== undefined) AUDIO.volume = savedState.volume;
            } else {
                currentSongIndex = 0;
                loadSong(currentSongIndex);
                CURRENT_TITLE.textContent = playlist[0].title;
                CURRENT_ARTIST.textContent = playlist[0].artist;
            }
        } else {
            CURRENT_TITLE.textContent = '播放列表为空';
            showError('播放列表文件为空或格式错误。');
        }
    } catch (error) {
        console.error('加载音乐库失败:', error);
        CURRENT_TITLE.textContent = '加载失败';
        showError('无法加载音乐库，请检查网络。');
    } finally {
        toggleSkeleton(false);
    }
}

function renderPlaylist(filterText = '') {
    SONG_LIST_UL.innerHTML = '';
    const lowerFilter = filterText.toLowerCase();

    playlist.forEach((song, index) => {
        const match = !filterText ||
            song.title.toLowerCase().includes(lowerFilter) ||
            song.artist.toLowerCase().includes(lowerFilter);
        if (!match) return;

        const listItem = document.createElement('li');
        listItem.dataset.index = index;
        listItem.innerHTML = `
            <span>${song.title}</span>
            <span class="song-artist"> - ${song.artist}</span>
        `;

        // 【修复】点击时先清空搜索框再重新渲染，最后选中歌曲
        listItem.addEventListener('click', () => {
            if (filterText) {
                SEARCH_INPUT.value = '';
                renderPlaylist();               // 渲染完整列表
            }
            selectSong(index);                  // 播放选中歌曲
        });

        SONG_LIST_UL.appendChild(listItem);
    });
    updatePlaylistHighlight();
}

function updatePlaylistHighlight() {
    const listItems = SONG_LIST_UL.querySelectorAll('li');
    listItems.forEach((item, index) => {
        item.classList.remove('playing');
        if (index === currentSongIndex) item.classList.add('playing');
    });
}

// --- 核心播放控制逻辑 ---
function loadSong(index, seekTime = 0) {
    if (index < 0 || index >= playlist.length) return;

    currentSongIndex = index;
    const song = playlist[currentSongIndex];

    hideError();
    AUDIO.innerHTML = '';
    const opusFileName = song.fileName.replace(/\.mp3$/i, '.opus');
    const opusSource = document.createElement('source');
    opusSource.src = `songs/${opusFileName}`;
    opusSource.type = 'audio/ogg; codecs="opus"';
    AUDIO.appendChild(opusSource);

    CURRENT_TITLE.textContent = song.title;
    CURRENT_ARTIST.textContent = song.artist;
    ALBUM_COVER.src = 'cover.jpg';

    updatePlaylistHighlight();

    CURRENT_TIME.textContent = '0:00';
    DURATION.textContent = '0:00';
    PROGRESS_BAR.value = 0;

    AUDIO.loop = (playMode === 'single');
    AUDIO.load();

    if (seekTime > 0) {
        const onLoaded = () => {
            AUDIO.currentTime = seekTime;
            AUDIO.removeEventListener('loadedmetadata', onLoaded);
        };
        AUDIO.addEventListener('loadedmetadata', onLoaded);
    }

    if (isPlaying) playSong();
    updateMediaSessionMetadata();
    savePlaybackState();
}

function playSong() {
    if (currentSongIndex === -1 && playlist.length > 0) {
        currentSongIndex = 0;
        loadSong(currentSongIndex);
    }
    AUDIO.play().then(() => {
        isPlaying = true;
        PLAY_PAUSE_BTN.innerHTML = '<i class="fas fa-pause"></i>';
        PLAY_PAUSE_BTN.title = '暂停';
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    }).catch(error => {
        console.warn("自动播放被阻止，请点击播放按钮开始播放。", error);
        isPlaying = false;
        PLAY_PAUSE_BTN.innerHTML = '<i class="fas fa-play"></i>';
    });
}

function pauseSong() {
    AUDIO.pause();
    isPlaying = false;
    PLAY_PAUSE_BTN.innerHTML = '<i class="fas fa-play"></i>';
    PLAY_PAUSE_BTN.title = '播放';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

function togglePlayPause() {
    if (isPlaying) pauseSong();
    else playSong();
}

function selectSong(index) {
    if (index === currentSongIndex) {
        togglePlayPause();
    } else {
        loadSong(index);
        playSong();
    }
}

function nextSong() {
    let nextIndex;
    if (playMode === 'shuffle') {
        const len = playlist.length;
        if (len <= 1) nextIndex = currentSongIndex;
        else {
            do {
                nextIndex = Math.floor(Math.random() * len);
            } while (nextIndex === currentSongIndex);
        }
    } else {
        nextIndex = (currentSongIndex + 1) % playlist.length;
    }
    loadSong(nextIndex);
    if (!isPlaying) playSong();
}

function prevSong() {
    if (AUDIO.currentTime > 3) {
        AUDIO.currentTime = 0;
        playSong();
        return;
    }
    let prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    loadSong(prevIndex);
    if (!isPlaying) playSong();
}

function togglePlayMode() {
    switch (playMode) {
        case 'loop':
            playMode = 'single';
            MODE_BTN.innerHTML = '<i class="fas fa-redo-alt" style="color: #FF9500;"></i>';
            MODE_BTN.title = '单曲循环';
            AUDIO.loop = true;
            break;
        case 'single':
            playMode = 'shuffle';
            MODE_BTN.innerHTML = '<i class="fas fa-random" style="color: #FF3B30;"></i>';
            MODE_BTN.title = '随机播放';
            AUDIO.loop = false;
            break;
        case 'shuffle':
            playMode = 'loop';
            MODE_BTN.innerHTML = '<i class="fas fa-redo-alt"></i>';
            MODE_BTN.title = '列表循环';
            AUDIO.loop = false;
            break;
    }
}

// --- Media Session API ---
function updateMediaSessionMetadata() {
    if ('mediaSession' in navigator && currentSongIndex !== -1) {
        const song = playlist[currentSongIndex];
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: '本地音乐库',
            artwork: [{ src: 'cover.jpg', sizes: '150x150', type: 'image/jpeg' }]
        });
    }
}

function setupMediaSessionHandlers() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', playSong);
        navigator.mediaSession.setActionHandler('pause', pauseSong);
        navigator.mediaSession.setActionHandler('previoustrack', prevSong);
        navigator.mediaSession.setActionHandler('nexttrack', nextSong);
        try {
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                AUDIO.currentTime = Math.max(0, AUDIO.currentTime - (details.seekOffset || 10));
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                AUDIO.currentTime = Math.min(AUDIO.duration, AUDIO.currentTime + (details.seekOffset || 10));
            });
        } catch (error) {
            console.log('Seek handlers not supported or enabled.');
        }
        navigator.mediaSession.playbackState = 'paused';
    }
}

// --- 状态存储与恢复 ---
function savePlaybackState() {
    if (currentSongIndex === -1) return;
    const state = {
        index: currentSongIndex,
        time: AUDIO.currentTime,
        mode: playMode,
        volume: AUDIO.volume,
        playing: isPlaying      // 新增：保存播放状态
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { }
}

function loadPlaybackState() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}

function applyPlayModeUI() {
    switch (playMode) {
        case 'single':
            MODE_BTN.innerHTML = '<i class="fas fa-redo-alt" style="color: #FF9500;"></i>';
            MODE_BTN.title = '单曲循环';
            AUDIO.loop = true;
            break;
        case 'shuffle':
            MODE_BTN.innerHTML = '<i class="fas fa-random" style="color: #FF3B30;"></i>';
            MODE_BTN.title = '随机播放';
            AUDIO.loop = false;
            break;
        case 'loop':
        default:
            MODE_BTN.innerHTML = '<i class="fas fa-redo-alt"></i>';
            MODE_BTN.title = '列表循环';
            AUDIO.loop = false;
            break;
    }
}

// --- 封面图手势切换 ---
ALBUM_ART_DIV.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
});
ALBUM_ART_DIV.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) prevSong();
        else nextSong();
    }
});

// --- 进度条拖动（修复：全局监听释放）---
function onDragStart(e) {
    e.preventDefault();                     // 阻止移动端滚动
    PROGRESS_BAR.setAttribute('data-dragging', 'true');
    wasPlayingBeforeDrag = isPlaying;
    pauseSong();
    dragInProgress = true;

    // 添加全局事件
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);
}

function onDragMove(e) {
    // 不需要额外处理，input 事件已经更新显示
}

function onDragEnd(e) {
    if (!dragInProgress) return;
    dragInProgress = false;
    PROGRESS_BAR.removeAttribute('data-dragging');

    const newTime = (PROGRESS_BAR.value / 100) * AUDIO.duration;
    if (!isNaN(newTime)) AUDIO.currentTime = newTime;

    if (wasPlayingBeforeDrag) playSong();

    // 移除全局事件
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchend', onDragEnd);
    document.removeEventListener('touchcancel', onDragEnd);
}

// 移除旧的监听器（通过重新绑定覆盖）
PROGRESS_BAR.removeEventListener('mousedown', onDragStart);
PROGRESS_BAR.removeEventListener('touchstart', onDragStart);
// 绑定新的拖动开始
PROGRESS_BAR.addEventListener('mousedown', onDragStart);
PROGRESS_BAR.addEventListener('touchstart', onDragStart, { passive: false });

// 进度条输入时更新当前时间
PROGRESS_BAR.addEventListener('input', () => {
    const newTime = (PROGRESS_BAR.value / 100) * AUDIO.duration;
    CURRENT_TIME.textContent = formatTime(newTime);
});

// --- 其他事件监听器 ---
PLAY_PAUSE_BTN.addEventListener('click', togglePlayPause);
NEXT_BTN.addEventListener('click', nextSong);
PREV_BTN.addEventListener('click', prevSong);
MODE_BTN.addEventListener('click', togglePlayMode);
LIST_TOGGLE_BTN.addEventListener('click', () => {
    PLAYLIST_DIV.classList.toggle('hidden');
    const icon = LIST_TOGGLE_BTN.querySelector('i');
    icon.classList.toggle('fa-list-ul');
    icon.classList.toggle('fa-times');
});
SEARCH_INPUT.addEventListener('input', (e) => {
    renderPlaylist(e.target.value.trim());
});

// 音频事件
AUDIO.addEventListener('error', (e) => {
    const error = e.target.error;
    let message = '音频加载失败。请检查文件名、路径或文件是否为有效的 OPUS 格式。';
    if (error) {
        if (error.code === 4) message = '无法播放此音频格式。请确认 OPUS 文件封装在 Ogg 容器中，且服务器MIME类型正确。';
        else if (error.code === 2) message = '网络错误或文件路径不正确，请确保文件位于 songs/ 文件夹。';
    }
    showError(message);
    CURRENT_TITLE.textContent = '播放错误';
    console.error('音频加载或播放出错:', error);
});

let lastSaveTime = 0;
AUDIO.addEventListener('timeupdate', () => {
    if (!PROGRESS_BAR.hasAttribute('data-dragging') && !isNaN(AUDIO.duration)) {
        const percent = (AUDIO.currentTime / AUDIO.duration) * 100;
        PROGRESS_BAR.value = percent || 0;
        CURRENT_TIME.textContent = formatTime(AUDIO.currentTime);
        if (AUDIO.currentTime - lastSaveTime > 5) {
            savePlaybackState();
            lastSaveTime = AUDIO.currentTime;
        }
    }
});

AUDIO.addEventListener('loadedmetadata', () => {
    DURATION.textContent = formatTime(AUDIO.duration);
    PROGRESS_BAR.max = 100;
});

AUDIO.addEventListener('ended', () => {
    if (playMode !== 'single') nextSong();
});

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    loadPlaylist();
    setupMediaSessionHandlers();
});