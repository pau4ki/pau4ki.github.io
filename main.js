// ── CONFIG ──────────────────────────────────────────────
const DB_FILE = 'https://raw.githubusercontent.com/pau4ki/pau4ki.github.io/main/spiders.db';

// ── THEME ───────────────────────────────────────────────
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(themeMode) {
  let actualTheme;
  
  if (themeMode === 'auto') {
    actualTheme = getSystemTheme();
  } else {
    actualTheme = themeMode;
  }
  
  document.documentElement.setAttribute('data-theme', actualTheme);
  
  // Обновляем иконку переключателя
  const themeToggle = document.getElementById('theme-toggle');
  const lightIcon = themeToggle.querySelector('.light-icon');
  const darkIcon = themeToggle.querySelector('.dark-icon');
  const autoIcon = themeToggle.querySelector('.auto-icon');
  
  // Скрываем все иконки
  lightIcon.style.opacity = '0';
  lightIcon.style.transform = 'rotate(180deg) scale(0.8)';
  darkIcon.style.opacity = '0';
  darkIcon.style.transform = 'rotate(180deg) scale(0.8)';
  autoIcon.style.opacity = '0';
  autoIcon.style.transform = 'rotate(180deg) scale(0.8)';
  
  // Показываем нужную иконку
  setTimeout(() => {
    if (themeMode === 'light') {
      lightIcon.style.opacity = '1';
      lightIcon.style.transform = 'rotate(0deg) scale(1)';
    } else if (themeMode === 'dark') {
      darkIcon.style.opacity = '1';
      darkIcon.style.transform = 'rotate(0deg) scale(1)';
    } else {
      autoIcon.style.opacity = '1';
      autoIcon.style.transform = 'rotate(0deg) scale(1)';
    }
  }, 150);
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'auto';
  applyTheme(savedTheme);
  
  // Слушаем изменения системной темы
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    if (currentTheme === 'auto') {
      applyTheme('auto');
      // Обновляем маркеры при изменении системной темы
      if (map && allSpiders.length > 0) {
        updateMapMarkers();
      }
    }
  });
  
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    let newTheme;
    
    // Циклическое переключение: auto -> light -> dark -> auto
    if (currentTheme === 'auto') {
      newTheme = 'light';
    } else if (currentTheme === 'light') {
      newTheme = 'dark';
    } else {
      newTheme = 'auto';
    }
    
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
    
    // Обновляем маркеры при смене темы
    if (map && allSpiders.length > 0) {
      updateMapMarkers();
    }
  });
}

// ── STATE ───────────────────────────────────────────────
let allSpiders = [];
let activeRegion = 'all';
let searchQuery  = '';
let map = null;
let markers = [];
let markerClusterGroup = null;

// ── DOM REFS ────────────────────────────────────────────
const searchInput = document.getElementById('search');
const countLabel  = document.getElementById('count-label');
const totalLabel  = document.getElementById('total-label');
const filterGroup = document.querySelector('.filter-group');
const regionSelect = document.getElementById('region-select');
const modal       = document.getElementById('modal');
const modalOverlay = document.getElementById('modal-overlay');

// ── LOAD DATA ───────────────────────────────────────────
async function loadData() {
  try {
    // Инициализация SQL.js
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    // Загрузка базы данных
    const res = await fetch(DB_FILE);
    if (!res.ok) throw new Error('Ошибка загрузки базы данных');
    
    const buf = await res.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buf));

    // Выполнение запроса
    const result = db.exec('SELECT * FROM spiders ORDER BY id');
    
    if (result.length === 0) {
      throw new Error('Таблица spiders пуста или не найдена');
    }

    // Преобразование результата в массив объектов
    const columns = result[0].columns;
    const values = result[0].values;
    
    allSpiders = values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });

    db.close();
    
    initMap();
    setDynamicBounds(); // Устанавливаем динамические границы
    buildRegionFilters();
    updateTotal();
    updateMapMarkers();
  } catch (e) {
    document.getElementById('map').innerHTML = `<div style="padding:40px;color:#f48771;font-family:'Consolas',monospace;font-size:12px;text-align:center;">
      Ошибка: не удалось загрузить ${DB_FILE}<br><br>
      <span style="color:#909399">${e.message}</span>
    </div>`;
    console.error('Ошибка загрузки:', e);
  }
}

// ── FILTERS ─────────────────────────────────────────────
function buildRegionFilters() {
  const regions = ['all', ...new Set(allSpiders.map(s => s.region).filter(Boolean))];

  // Заполняем кнопки для десктопа
  filterGroup.innerHTML = regions.map(r => `
    <button class="filter-btn ${r === 'all' ? 'active' : ''}"
            data-region="${r}">
      ${r === 'all' ? 'Все регионы' : r}
    </button>
  `).join('');

  filterGroup.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeRegion = btn.dataset.region;
      filterGroup.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateMapMarkers();
    });
  });

  // Заполняем select для мобильных
  regionSelect.innerHTML = regions.map(r => `
    <option value="${r}" ${r === 'all' ? 'selected' : ''}>
      ${r === 'all' ? 'Все регионы' : r}
    </option>
  `).join('');

  regionSelect.addEventListener('change', (e) => {
    activeRegion = e.target.value;
    updateMapMarkers();
  });
}

function updateTotal() {
  totalLabel.textContent = allSpiders.length;
}

// ── FILTER + SEARCH ─────────────────────────────────────
function getFiltered() {
  return allSpiders.filter(s => {
    const matchRegion = activeRegion === 'all' || s.region === activeRegion;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || [s.name, s.name_ru, s.family, s.finder, s.location, s.region, s.habitat, s.notes]
      .some(f => f && f.toLowerCase().includes(q));
    return matchRegion && matchSearch;
  });
}

// ── RENDER ──────────────────────────────────────────────
function updateCount() {
  const filtered = getFiltered();
  countLabel.textContent = filtered.length;
}

// ── MODAL ───────────────────────────────────────────────
function openModal(id) {
  const s = allSpiders.find(x => x.id === id);
  if (!s) return;

  document.getElementById('m-number').textContent   = `ЗАПИСЬ №${String(s.id).padStart(3,'0')}`;
  document.getElementById('m-name').textContent     = s.name;
  document.getElementById('m-name-ru').textContent  = s.name_ru || '';

  setField('m-family',   s.family);
  setField('m-finder',   s.finder);
  setField('m-location', s.location);
  setField('m-region',   s.region);
  setField('m-date',     s.date);
  setField('m-habitat',  s.habitat);
  setField('m-notes',    s.notes);

  const srcEl = document.getElementById('m-source');
  srcEl.textContent = s.source || 'источник не указан';
  srcEl.className = 'modal-source' + (s.source ? '' : ' empty');

  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function setField(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val) {
    el.textContent = val;
    el.className = 'modal-field-value';
  } else {
    el.textContent = 'не указано';
    el.className = 'modal-field-value empty';
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── MAP ─────────────────────────────────────────────────
function initMap() {
  const loader = document.getElementById('map-loader');
  
  map = L.map('map', {
    center: [58.5, 59.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: 15,
    attributionControl: false,
    preferCanvas: true,
    zoomControl: true,
    maxBoundsViscosity: 0.8 // Делаем границы более мягкими
  });
  
  // Используем тайлы с кэшированием
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    keepBuffer: 8,
    updateWhenIdle: true,
    updateWhenZooming: false
  }).addTo(map);
  
  // Скрываем загрузчик когда тайлы загружены
  tileLayer.on('load', () => {
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 300);
    }
  });
  
  // Обработка открытия popup - временно расширяем границы
  map.on('popupopen', function(e) {
    const popup = e.popup;
    const px = map.project(popup.getLatLng());
    const popupHeight = 250; // Примерная высота popup
    const popupWidth = 250; // Примерная ширина popup
    
    // Проверяем, не выходит ли popup за границы экрана
    const mapSize = map.getSize();
    const point = map.latLngToContainerPoint(popup.getLatLng());
    
    // Если popup близко к краю, временно расширяем границы
    if (point.y < popupHeight || point.x < popupWidth/2 || 
        point.x > mapSize.x - popupWidth/2 || point.y > mapSize.y - 100) {
      
      // Сохраняем текущие границы
      const currentBounds = map.options.maxBounds;
      
      // Временно расширяем границы
      if (currentBounds) {
        const expandedBounds = currentBounds.pad(0.3);
        map.setMaxBounds(expandedBounds);
      }
      
      // Панорамируем к маркеру с отступом для popup
      map.panTo(popup.getLatLng(), {
        animate: true,
        duration: 0.3,
        paddingTopLeft: [popupWidth/2, popupHeight]
      });
    }
  });
  
  // При закрытии popup восстанавливаем границы
  map.on('popupclose', function() {
    // Восстанавливаем исходные границы через небольшую задержку
    setTimeout(() => {
      const { bounds } = calculateDynamicBounds();
      map.setMaxBounds(bounds.pad(0.2));
    }, 300);
  });
}

// Вычисляем динамические границы на основе координат пауков
function calculateDynamicBounds() {
  const spidersWithCoords = allSpiders.filter(s => s.latitude && s.longitude);
  
  if (spidersWithCoords.length === 0) {
    // Если нет координат, возвращаем границы Урала по умолчанию
    return {
      bounds: L.latLngBounds([54.0, 54.0], [66.0, 66.0]),
      center: [58.5, 59.5],
      zoom: 6
    };
  }
  
  // Находим минимальные и максимальные координаты
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  spidersWithCoords.forEach(s => {
    minLat = Math.min(minLat, s.latitude);
    maxLat = Math.max(maxLat, s.latitude);
    minLng = Math.min(minLng, s.longitude);
    maxLng = Math.max(maxLng, s.longitude);
  });
  
  // Добавляем отступ 10% от размера области
  const latPadding = (maxLat - minLat) * 0.1;
  const lngPadding = (maxLng - minLng) * 0.1;
  
  const bounds = L.latLngBounds(
    [minLat - latPadding, minLng - lngPadding],
    [maxLat + latPadding, maxLng + lngPadding]
  );
  
  const center = bounds.getCenter();
  
  return { bounds, center };
}

// Устанавливаем динамические границы карты
function setDynamicBounds() {
  const { bounds, center } = calculateDynamicBounds();
  
  // Устанавливаем максимальные границы
  map.setMaxBounds(bounds.pad(0.2)); // Добавляем 20% буфер для прокрутки
  
  // Рисуем границу области с пауками
  if (window.boundaryPolygon) {
    map.removeLayer(window.boundaryPolygon);
  }
  
  window.boundaryPolygon = L.rectangle(bounds, {
    color: '#569cd6',
    weight: 2,
    opacity: 0.5,
    fillOpacity: 0,
    dashArray: '5, 10'
  }).addTo(map);
}

function updateMapMarkers() {
  // Очищаем старые маркеры
  if (markerClusterGroup) {
    map.removeLayer(markerClusterGroup);
  }
  
  // Определяем тему один раз для всей функции
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const markerFill = isDark ? '#2a2a2a' : '#ffffff';
  const markerStroke = '#7f7f8a';
  const popupBg = isDark ? '#2a2a2a' : '#ffffff';
  const textPrimary = isDark ? '#f3f4f6' : '#1a1a1a';
  const textSecondary = isDark ? '#a1a1aa' : '#5c5c64';
  const textMuted = isDark ? '#71717a' : '#7f7f8a';
  
  // Создаем новую группу кластеров
  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      
      let size = 'small';
      if (count > 10) size = 'large';
      else if (count > 5) size = 'medium';
      
      return L.divIcon({
        html: `<div class="cluster-icon-wrapper" style="position: relative;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">
                   <g fill="${markerFill}" stroke="${markerStroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                     <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                     <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
                   </g>
                 </svg>
                 <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: ${markerStroke}; font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; pointer-events: none;">${count}</div>
               </div>`,
        className: 'custom-cluster',
        iconSize: L.point(40, 40)
      });
    }
  });

  const filtered = getFiltered();
  const spidersWithCoords = filtered.filter(s => s.latitude && s.longitude);
  
  updateCount();
  markers = [];

  spidersWithCoords.forEach(s => {
    // Создаем кастомную иконку для маркера
    const customIcon = L.divIcon({
      className: 'custom-marker',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));">
               <g fill="${markerFill}" stroke="${markerStroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                 <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/>
                 <circle cx="12" cy="10" r="3"/>
               </g>
             </svg>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
    
    const marker = L.marker([s.latitude, s.longitude], {
      icon: customIcon,
      autoPanOnFocus: true
    });

    const sourceUrl = s.source || 'https://example.com';

    const popupOptions = {
      maxWidth: 280,
      minWidth: 240,
      autoPan: true,
      autoPanPaddingTopLeft: [10, 80],
      autoPanPaddingBottomRight: [10, 10],
      closeButton: true,
      autoClose: true,
      closeOnClick: false
    };

    marker.bindPopup(`
      <div style="font-family:'Inter',sans-serif;min-width:240px;background:${popupBg};color:${textPrimary};padding:16px;border-radius:12px;">
        <div style="font-size:16px;font-weight:600;color:${textPrimary};margin-bottom:4px;">
          ${s.name}
        </div>
        <div style="font-size:13px;color:${textSecondary};margin-bottom:16px;font-style:italic;">
          ${s.name_ru || ''}
        </div>
        <div style="font-size:13px;color:${textPrimary};line-height:1.6;">
          <div style="margin-bottom:6px;"><span style="color:${textMuted};font-weight:500;">Координаты:</span> ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</div>
          <div style="margin-bottom:6px;"><span style="color:${textMuted};font-weight:500;">Место:</span> ${s.location || 'не указано'}</div>
          <div style="margin-bottom:6px;"><span style="color:${textMuted};font-weight:500;">Регион:</span> ${s.region || 'не указан'}</div>
          <div style="margin-bottom:6px;"><span style="color:${textMuted};font-weight:500;">Год:</span> ${s.date || '—'}</div>
        </div>
        <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer"
           style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;padding:10px 16px;background:#7f7f8a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;font-weight:500;transition:all 0.2s ease;">
          <span>Источник</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <path d="M15 3h6v6"/>
            <path d="M10 14L21 3"/>
          </svg>
        </a>
      </div>
    `, popupOptions);

    markerClusterGroup.addLayer(marker);
    markers.push(marker);
  });

  // Добавляем группу кластеров на карту
  map.addLayer(markerClusterGroup);

  // Подстраиваем вид под отфильтрованные маркеры
  if (spidersWithCoords.length > 0) {
    const bounds = markerClusterGroup.getBounds().pad(0.15);
    
    // Проверяем, что границы не выходят за максимальные
    const maxBounds = map.options.maxBounds;
    if (maxBounds && maxBounds.contains(bounds)) {
      map.fitBounds(bounds, { 
        padding: [30, 30],
        maxZoom: 12
      });
    } else {
      // Если выходят, подстраиваем к максимальным границам
      map.fitBounds(maxBounds, {
        padding: [30, 30]
      });
    }
  } else {
    // Если точек нет после фильтрации, показываем всю область
    const { bounds } = calculateDynamicBounds();
    map.fitBounds(bounds, {
      padding: [30, 30]
    });
  }
}

window.openSpiderModal = function(id) {
  map.closePopup();
  openModal(id);
};

window.openSpiderModal = function(id) {
  map.closePopup();
  openModal(id);
};

// ── EVENTS ──────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value;
  updateCount();
  updateMapMarkers();
});

document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── INIT ────────────────────────────────────────────────
// Инициализация темы
initTheme();

// Регистрация Service Worker для кэширования
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker зарегистрирован:', registration.scope);
      })
      .catch(error => {
        console.log('Ошибка регистрации Service Worker:', error);
      });
  });
}

loadData();