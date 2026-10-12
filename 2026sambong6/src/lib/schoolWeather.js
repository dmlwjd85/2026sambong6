/**
 * 학교 지역 날씨 — 기본은 네이버 날씨 당진시 석문면(15270320)입니다.
 * 지역명은 검색으로 바꿀 수 있고, 브라우저는 같은 좌표의 공개 예보를 씁니다.
 */

export const SCHOOL_WEATHER_NAVER_ID = '15270320';
export const SCHOOL_WEATHER_NAVER_URL = `https://weather.naver.com/today/${SCHOOL_WEATHER_NAVER_ID}`;
export const SCHOOL_WEATHER_REGION_LABEL = '당진시 석문면';
export const SCHOOL_WEATHER_LAT = 36.981918;
export const SCHOOL_WEATHER_LON = 126.590825;

export const DEFAULT_WEATHER_REGION = Object.freeze({
    label: SCHOOL_WEATHER_REGION_LABEL,
    lat: SCHOOL_WEATHER_LAT,
    lon: SCHOOL_WEATHER_LON,
    naverId: SCHOOL_WEATHER_NAVER_ID,
});

export const WEATHER_SCENES = Object.freeze(['sunny', 'cloudy', 'rain', 'snow', 'storm', 'night']);

const SCENE_META = Object.freeze({
    sunny: { label: '맑음', emoji: '☀️', img: 'weather/scene-sunny.webp' },
    cloudy: { label: '흐림', emoji: '☁️', img: 'weather/scene-cloudy.webp' },
    rain: { label: '비', emoji: '🌧️', img: 'weather/scene-rain.webp' },
    snow: { label: '눈', emoji: '❄️', img: 'weather/scene-snow.webp' },
    storm: { label: '뇌우', emoji: '⛈️', img: 'weather/scene-storm.webp' },
    night: { label: '밤', emoji: '🌙', img: 'weather/scene-night.webp' },
});

export function weatherSceneMeta(scene) {
    const key = WEATHER_SCENES.includes(scene) ? scene : 'cloudy';
    return { id: key, ...SCENE_META[key] };
}

/** WMO 기상 코드 → 홈 그래픽 장면 */
export function wmoToScene(code, isNight = false) {
    const n = Math.floor(Number(code));
    if (!Number.isFinite(n)) return isNight ? 'night' : 'cloudy';
    if (n === 0) return isNight ? 'night' : 'sunny';
    if (n === 1 || n === 2) return isNight ? 'night' : 'sunny';
    if (n === 3 || n === 45 || n === 48) return 'cloudy';
    if (n >= 71 && n <= 77) return 'snow';
    if (n >= 85 && n <= 86) return 'snow';
    if (n >= 95 && n <= 99) return 'storm';
    if (n >= 51 && n <= 67) return 'rain';
    if (n >= 80 && n <= 82) return 'rain';
    return isNight ? 'night' : 'cloudy';
}

export function isNightHour(hour, isDayFlag) {
    if (isDayFlag === 0 || isDayFlag === false) return true;
    if (isDayFlag === 1 || isDayFlag === true) return false;
    const h = Math.floor(Number(hour));
    if (!Number.isFinite(h)) return false;
    return h < 6 || h >= 19;
}

export function sanitizeWeatherRegion(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const lat = Number(src.lat);
    const lon = Number(src.lon);
    const label = String(src.label || src.name || '').trim().slice(0, 40);
    const naverId = String(src.naverId || '').replace(/\D/g, '').slice(0, 12);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) {
        return { ...DEFAULT_WEATHER_REGION };
    }
    return {
        label,
        lat: Math.max(-90, Math.min(90, lat)),
        lon: Math.max(-180, Math.min(180, lon)),
        naverId: naverId || '',
    };
}

export function weatherSourceUrl(region) {
    const r = sanitizeWeatherRegion(region);
    if (r.naverId) return `https://weather.naver.com/today/${r.naverId}`;
    return `https://search.naver.com/search.naver?query=${encodeURIComponent(r.label + ' 날씨')}`;
}

export function openMeteoGeocodeUrl(name) {
    const q = String(name || '').trim().slice(0, 40);
    const params = new URLSearchParams({
        name: q,
        count: '8',
        language: 'ko',
        format: 'json',
    });
    return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export function parseGeocodeResults(json) {
    const rows = json && Array.isArray(json.results) ? json.results : [];
    const out = [];
    rows.forEach((r) => {
        const lat = Number(r && r.latitude);
        const lon = Number(r && r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const bits = [r.admin1, r.admin2, r.name].map((x) => String(x || '').trim()).filter(Boolean);
        const label = (bits.join(' ') || String(r.name || '')).slice(0, 40);
        if (!label) return;
        out.push({
            label,
            name: String(r.name || label).slice(0, 40),
            lat,
            lon,
            country: String(r.country || ''),
        });
    });
    return out;
}

export function sanitizeSchoolWeather(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const temp = Number(src.temp);
    const tMax = Number(src.tempMax);
    const tMin = Number(src.tempMin);
    const humidity = Number(src.humidity);
    const wind = Number(src.wind);
    const precip = Number(src.precip);
    const scene = WEATHER_SCENES.includes(src.scene) ? src.scene : 'cloudy';
    const meta = weatherSceneMeta(scene);
    return {
        ok: src.ok !== false,
        regionLabel: String(src.regionLabel || DEFAULT_WEATHER_REGION.label),
        sourceUrl: String(src.sourceUrl || weatherSourceUrl(src)),
        temp: Number.isFinite(temp) ? Math.round(temp * 10) / 10 : null,
        tempMax: Number.isFinite(tMax) ? Math.round(tMax) : null,
        tempMin: Number.isFinite(tMin) ? Math.round(tMin) : null,
        humidity: Number.isFinite(humidity) ? Math.max(0, Math.min(100, Math.round(humidity))) : null,
        wind: Number.isFinite(wind) ? Math.round(wind * 10) / 10 : null,
        precip: Number.isFinite(precip) ? Math.round(precip * 10) / 10 : null,
        text: String(src.text || meta.label).slice(0, 20),
        scene,
        fetchedAt: Number.isFinite(Number(src.fetchedAt)) ? Number(src.fetchedAt) : 0,
    };
}

export function parseOpenMeteoWeather(json, nowMs = Date.now(), region) {
    const cur = json && json.current ? json.current : {};
    const daily = json && json.daily ? json.daily : {};
    const hour = Number(String(cur.time || '').slice(11, 13));
    const night = isNightHour(hour, cur.is_day);
    const scene = wmoToScene(cur.weather_code, night);
    const meta = weatherSceneMeta(scene);
    const place = sanitizeWeatherRegion(region);
    return sanitizeSchoolWeather({
        ok: true,
        regionLabel: place.label,
        sourceUrl: weatherSourceUrl(place),
        naverId: place.naverId,
        temp: cur.temperature_2m,
        tempMax: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
        tempMin: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null,
        humidity: cur.relative_humidity_2m,
        wind: cur.wind_speed_10m,
        precip: cur.precipitation,
        text: meta.label,
        scene,
        fetchedAt: nowMs,
    });
}

export function openMeteoSchoolUrl(region) {
    const place = sanitizeWeatherRegion(region);
    const params = new URLSearchParams({
        latitude: String(place.lat),
        longitude: String(place.lon),
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day',
        daily: 'temperature_2m_max,temperature_2m_min',
        timezone: 'Asia/Seoul',
        forecast_days: '1',
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/** 학급 날씨는 1시간마다 다시 읽습니다. */
export const WEATHER_REFRESH_MS = 60 * 60 * 1000;
/** 공유·로컬 캐시가 이 시간보다 짧으면 네트워크를 다시 치지 않습니다. */
export const WEATHER_CACHE_TTL_MS = 50 * 60 * 1000;

/** 학교망에서 Open-Meteo가 막힐 때를 위한 읽기 전용 프록시 */
export function openMeteoSchoolProxyUrl(region) {
    return `https://r.jina.ai/${openMeteoSchoolUrl(region).replace('https://', 'http://')}`;
}

/** 프록시 응답에서 JSON 본문만 잘라 냅니다. */
export function extractWeatherJson(text) {
    const raw = String(text || '');
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        const start = raw.indexOf('{"current"') >= 0 ? raw.indexOf('{"current"') : raw.indexOf('{');
        if (start < 0) return null;
        const sliced = raw.slice(start);
        try {
            return JSON.parse(sliced);
        } catch (e2) {
            const end = sliced.lastIndexOf('}');
            if (end < 1) return null;
            try {
                return JSON.parse(sliced.slice(0, end + 1));
            } catch (e3) {
                return null;
            }
        }
    }
}

export function weatherRegionKey(region) {
    const r = sanitizeWeatherRegion(region);
    return `${r.label}|${r.lat}|${r.lon}`;
}

/** 공유 캐시가 지금 보고 있는 지역과 같은지 */
export function sharedWeatherMatchesRegion(shared, region) {
    const src = shared && typeof shared === 'object' ? shared : null;
    if (!src) return false;
    const weather = sanitizeSchoolWeather(src);
    if (!weather.ok || weather.temp == null) return false;
    const r = sanitizeWeatherRegion(region);
    const key = String(src.regionKey || '');
    if (key) return key === weatherRegionKey(r);
    return weather.regionLabel === r.label;
}

export function isSharedWeatherFresh(shared, nowMs, ttlMs = WEATHER_CACHE_TTL_MS) {
    const fetchedAt = Number(shared && shared.fetchedAt) || 0;
    return fetchedAt > 0 && (Number(nowMs) || 0) - fetchedAt < (Number(ttlMs) || WEATHER_CACHE_TTL_MS);
}
