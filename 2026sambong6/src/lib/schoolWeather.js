/**
 * 학교 지역 날씨 — 네이버 날씨 당진시 석문면(15270320) 좌표를 항상 씁니다.
 * 브라우저는 네이버 페이지를 직접 읽지 못하므로, 같은 위치의 공개 예보로 화면을 채웁니다.
 */

export const SCHOOL_WEATHER_NAVER_ID = '15270320';
export const SCHOOL_WEATHER_NAVER_URL = `https://weather.naver.com/today/${SCHOOL_WEATHER_NAVER_ID}`;
export const SCHOOL_WEATHER_REGION_LABEL = '당진시 석문면';
export const SCHOOL_WEATHER_LAT = 36.981918;
export const SCHOOL_WEATHER_LON = 126.590825;

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
        regionLabel: String(src.regionLabel || SCHOOL_WEATHER_REGION_LABEL),
        sourceUrl: String(src.sourceUrl || SCHOOL_WEATHER_NAVER_URL),
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

export function parseOpenMeteoWeather(json, nowMs = Date.now()) {
    const cur = json && json.current ? json.current : {};
    const daily = json && json.daily ? json.daily : {};
    const hour = Number(String(cur.time || '').slice(11, 13));
    const night = isNightHour(hour, cur.is_day);
    const scene = wmoToScene(cur.weather_code, night);
    const meta = weatherSceneMeta(scene);
    return sanitizeSchoolWeather({
        ok: true,
        regionLabel: SCHOOL_WEATHER_REGION_LABEL,
        sourceUrl: SCHOOL_WEATHER_NAVER_URL,
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

export function openMeteoSchoolUrl() {
    const params = new URLSearchParams({
        latitude: String(SCHOOL_WEATHER_LAT),
        longitude: String(SCHOOL_WEATHER_LON),
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day',
        daily: 'temperature_2m_max,temperature_2m_min',
        timezone: 'Asia/Seoul',
        forecast_days: '1',
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}
