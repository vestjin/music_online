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
const ERROR_MESSAGE_DIV = document.getElementById('error-message'); // 错误提示 DOM

let playlist = [];
let currentSongIndex = -1;
let isPlaying = false;
let playMode = 'loop';

// --- 手势状态变量 ---
let startX = 0;
const swipeThreshold = 50; // 最小滑动距离 (px)

// --- 工具函数 ---

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// --- 骨架屏和错误处理工具函数 ---

/**
 * 切换骨架屏显示状态
 * @param {boolean} isLoading - 是否处于加载中状态
 */
function toggleSkeleton(isLoading) {
    [CURRENT_TITLE, CURRENT_ARTIST, ALBUM_ART_DIV].forEach(el => {
        if (isLoading) {
            el.classList.add('skeleton');
        } else {
            // 移除所有骨架屏相关的类
            el.classList.remove('skeleton', 'skeleton-text', 'skeleton-text-small', 'skeleton-img');
        }
    });

    // 切换图片显示，加载时隐藏，加载完成后显示
    ALBUM_COVER.style.display = isLoading ? 'none' : 'block';
}

/**
 * 显示错误信息
 * @param {string} message - 要显示的信息
 */
function showError(message) {
    ERROR_MESSAGE_DIV.textContent = message;
    ERROR_MESSAGE_DIV.classList.add('show');
    // 暂停播放 (如果正在播放)
    if (isPlaying) pauseSong();
}

/**
 * 隐藏错误信息
 */
function hideError() {
    ERROR_MESSAGE_DIV.classList.remove('show');
}


// --- 播放列表加载逻辑 ---

async function loadPlaylist() {
    toggleSkeleton(true); // 1. 开始加载，显示骨架屏
    hideError(); // 确保加载前隐藏任何旧错误

    try {
        const response = await fetch('music_library.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} (检查JSON文件路径)`);
        }
        playlist = await response.json();
        
        if (playlist.length > 0) {
            currentSongIndex = 0;
            loadSong(currentSongIndex);
            CURRENT_TITLE.textContent = playlist[0].title;
            CURRENT_ARTIST.textContent = playlist[0].artist;
            renderPlaylist();
        } else {
            CURRENT_TITLE.textContent = '播放列表为空';
            showError('播放列表文件为空或格式错误。');
        }
    } catch (error) {
        console.error('加载音乐库失败:', error);
        CURRENT_TITLE.textContent = '加载失败';
        showError('无法加载音乐库，请检查 music_library.json 文件和服务器。');
    } finally {
        toggleSkeleton(false); // 2. 加载结束，隐藏骨架屏
    }
}

function renderPlaylist() {
    SONG_LIST_UL.innerHTML = '';
    playlist.forEach((song, index) => {
        const listItem = document.createElement('li');
        listItem.dataset.index = index;
        listItem.innerHTML = `
            <span>${song.title}</span>
            <span class="song-artist"> - ${song.artist}</span>
        `;
        listItem.addEventListener('click', () => {
            selectSong(index);
        });
        SONG_LIST_UL.appendChild(listItem);
    });
    updatePlaylistHighlight();
}

function updatePlaylistHighlight() {
    const listItems = SONG_LIST_UL.querySelectorAll('li');
    listItems.forEach((item, index) => {
        item.classList.remove('playing');
        if (index === currentSongIndex) {
            item.classList.add('playing');
        }
    });
}

// --- 核心播放控制逻辑 ---

/**
 * 加载特定索引的歌曲 (OPUS 兼容性改进在此)
 */
function loadSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentSongIndex = index;
    const song = playlist[currentSongIndex];
    
    hideError(); // 尝试加载新歌时清除旧错误
    
    // 【OPUS 格式关键修改】: 必须使用 <source> 标签和明确的 MIME 类型
    AUDIO.innerHTML = ''; // 清空旧的源

    // 假设 JSON 中是 .mp3，但实际文件是 .opus
    const opusFileName = song.fileName.replace(/\.mp3$/i, '.opus'); 
    
    const opusSource = document.createElement('source');
    opusSource.src = `songs/${opusFileName}`;
    // 声明 MIME 类型
    opusSource.type = 'audio/ogg; codecs="opus"'; 
    
    AUDIO.appendChild(opusSource);
    
    // 更新 UI 文本
    CURRENT_TITLE.textContent = song.title;
    CURRENT_ARTIST.textContent = song.artist;
    ALBUM_COVER.src = 'cover.jpg';
    
    updatePlaylistHighlight();
    
    CURRENT_TIME.textContent = '0:00';
    DURATION.textContent = '0:00';
    PROGRESS_BAR.value = 0;
    
    AUDIO.loop = (playMode === 'single');
    
    // 强制加载新的源
    AUDIO.load(); 

    if (isPlaying) {
        playSong();
    } 
    updateMediaSessionMetadata();
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
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
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
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
    }
}

function togglePlayPause() {
    if (isPlaying) {
        pauseSong();
    } else {
        playSong();
    }
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
        if (len <= 1) { nextIndex = currentSongIndex; } 
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


// --- Media Session API 实现 ---

function updateMediaSessionMetadata() {
    if ('mediaSession' in navigator && currentSongIndex !== -1) {
        const song = playlist[currentSongIndex];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: '本地音乐库',
            artwork: [
                { src: 'cover.jpg', sizes: '150x150', type: 'image/jpeg' } 
            ]
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


// --- 封面图手势切换 ---

ALBUM_ART_DIV.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
});

ALBUM_ART_DIV.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX;
    
    if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) {
            // 向右滑动 -> 上一首
            prevSong();
        } else {
            // 向左滑动 -> 下一首
            nextSong();
        }
    }
});


// --- 事件监听器 ---

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

// 【关键错误处理】: 音频加载失败
AUDIO.addEventListener('error', (e) => {
    const error = e.target.error;
    let message = '音频加载失败。请检查文件名、路径或文件是否为有效的 OPUS 格式。';
    
    if (error) {
        // MediaError codes: 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
        if (error.code === 4) {
            message = '无法播放此音频格式。请确认 OPUS 文件封装在 Ogg 容器中，且服务器MIME类型正确。';
        } else if (error.code === 2) {
            message = '网络错误或文件路径不正确，请确保文件位于 songs/ 文件夹。';
        }
    }
    showError(message);
    CURRENT_TITLE.textContent = '播放错误';
    console.error('音频加载或播放出错:', error);
});

AUDIO.addEventListener('timeupdate', () => {
    if (!PROGRESS_BAR.hasAttribute('data-dragging') && !isNaN(AUDIO.duration)) {
        const percent = (AUDIO.currentTime / AUDIO.duration) * 100;
        PROGRESS_BAR.value = percent || 0;
        CURRENT_TIME.textContent = formatTime(AUDIO.currentTime);
    }
});

AUDIO.addEventListener('loadedmetadata', () => {
    DURATION.textContent = formatTime(AUDIO.duration);
    PROGRESS_BAR.max = 100;
});

AUDIO.addEventListener('ended', () => {
    if (playMode !== 'single') { 
        nextSong();
    }
});

// 进度条拖动逻辑
PROGRESS_BAR.addEventListener('mousedown', () => { PROGRESS_BAR.setAttribute('data-dragging', 'true'); pauseSong(); });
PROGRESS_BAR.addEventListener('touchstart', () => { PROGRESS_BAR.setAttribute('data-dragging', 'true'); pauseSong(); });

function handleSeekEnd() {
    PROGRESS_BAR.removeAttribute('data-dragging');
    const newTime = (PROGRESS_BAR.value / 100) * AUDIO.duration;
    AUDIO.currentTime = newTime;
    
    if (isPlaying) { 
        playSong();
    } else {
        pauseSong();
    }
}
PROGRESS_BAR.addEventListener('mouseup', handleSeekEnd);
PROGRESS_BAR.addEventListener('touchend', handleSeekEnd);
PROGRESS_BAR.addEventListener('touchcancel', handleSeekEnd);
PROGRESS_BAR.addEventListener('input', () => {
    const newTime = (PROGRESS_BAR.value / 100) * AUDIO.duration;
    CURRENT_TIME.textContent = formatTime(newTime);
});


// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    loadPlaylist();
    setupMediaSessionHandlers();
});