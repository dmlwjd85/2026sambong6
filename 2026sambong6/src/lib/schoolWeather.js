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

const ADMIN_NAME_SUFFIX = /[시군구읍면동리가]$/;
const PLACE_OSM_KEYS = new Set(['place', 'boundary']);
const PLACE_OSM_VALUES = new Set([
    'quarter', 'suburb', 'neighbourhood', 'neighborhood', 'village', 'town',
    'city', 'hamlet', 'municipality', 'county', 'district', 'legal',
    'isolated_dwelling', 'city_district', 'borough', 'administrative',
]);
const QUERY_NAME_SUFFIXES = ['동', '면', '읍', '리'];

function textBit(v) {
    return String(v == null ? '' : v).trim();
}

function uniqueBits(parts) {
    const seen = new Set();
    const out = [];
    parts.forEach((p) => {
        const s = textBit(p);
        if (!s || seen.has(s)) return;
        seen.add(s);
        out.push(s);
    });
    return out;
}

function isKoreaCountry(country, countryCode) {
    const cc = String(countryCode || '').toUpperCase();
    if (cc === 'KR') return true;
    const c = textBit(country);
    return c === '대한민국' || c === 'South Korea' || c === 'Korea' || c === 'Republic of Korea';
}

function looksLikeAdminPlace(name) {
    return /[시군구읍면동]$/.test(textBit(name));
}

/**
 * 동만 적어도 검색되도록 보조 질의어를 붙입니다.
 * @param {string} raw
 * @returns {string[]}
 */
export function expandWeatherSearchQueries(raw) {
    const q = textBit(raw).replace(/\s+/g, ' ').slice(0, 40);
    if (!q) return [];
    const out = [q];
    // 동만 적어도 법정동·행정동이 잡히도록, 접미가 없으면 동·면·읍을 이어서 다시 찾습니다.
    if (!ADMIN_NAME_SUFFIX.test(q) && /[가-힣]/.test(q)) {
        QUERY_NAME_SUFFIXES.forEach((sfx) => out.push(`${q}${sfx}`));
    }
    return out;
}

/** OSM Photon — 한국 읍·면·동 검색용 (Open-Meteo GeoNames는 동이 거의 없음) */
export function photonGeocodeUrl(name) {
    const q = textBit(name).slice(0, 40);
    const params = new URLSearchParams({
        q,
        limit: '12',
        lat: '36.5',
        lon: '127.8',
    });
    // 식당·정류장·바위 같은 장소는 빼고, 행정구역만 받습니다.
    params.append('osm_tag', 'place');
    params.append('osm_tag', 'boundary');
    return `https://photon.komoot.io/api/?${params.toString()}`;
}

export function nominatimGeocodeUrl(name) {
    const q = textBit(name).slice(0, 40);
    const params = new URLSearchParams({
        q,
        countrycodes: 'kr',
        format: 'json',
        addressdetails: '1',
        limit: '8',
        'accept-language': 'ko',
    });
    return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

export function openMeteoGeocodeUrl(name) {
    const q = textBit(name).slice(0, 40);
    const params = new URLSearchParams({
        name: q,
        count: '8',
        language: 'ko',
        format: 'json',
        countryCode: 'KR',
    });
    return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

function buildAdminLabel(parts, name) {
    const bits = uniqueBits(parts);
    const n = textBit(name);
    if (n && !bits.includes(n)) bits.push(n);
    return bits.join(' ').slice(0, 40);
}

export function parsePhotonResults(json) {
    const feats = json && Array.isArray(json.features) ? json.features : [];
    const out = [];
    feats.forEach((f) => {
        const p = f && f.properties ? f.properties : {};
        const geom = f && f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : [];
        const lon = Number(geom[0]);
        const lat = Number(geom[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (!isKoreaCountry(p.country, p.countrycode || p.countryCode)) return;
        const key = textBit(p.osm_key);
        const val = textBit(p.osm_value);
        const name = textBit(p.name);
        if (!name) return;
        const preferred = PLACE_OSM_KEYS.has(key) || PLACE_OSM_VALUES.has(val) || looksLikeAdminPlace(name);
        if (!preferred) return;
        const district = textBit(p.district);
        const skipAdminDong = /동$/.test(name) && /[0-9]*동$/.test(district);
        const label = buildAdminLabel(
            [p.state, p.city, p.county, skipAdminDong ? '' : district],
            name
        );
        out.push({
            label: label || name,
            name,
            lat,
            lon,
            country: '대한민국',
            kind: val || key || 'place',
        });
    });
    return out;
}

export function parseNominatimResults(json) {
    const rows = Array.isArray(json) ? json : [];
    const out = [];
    rows.forEach((r) => {
        const lat = Number(r && r.lat);
        const lon = Number(r && r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const addr = r && r.address && typeof r.address === 'object' ? r.address : {};
        if (!isKoreaCountry(addr.country || r.display_name, addr.country_code)) return;
        const cls = textBit(r.class || r.addresstype);
        const typ = textBit(r.type || r.addresstype);
        const name = textBit(
            r.name
            || addr.quarter
            || addr.suburb
            || addr.town
            || addr.village
            || addr.city
            || addr.county
        );
        if (!name) return;
        const preferred = PLACE_OSM_KEYS.has(cls) || PLACE_OSM_VALUES.has(typ) || looksLikeAdminPlace(name);
        if (!preferred) return;
        const label = buildAdminLabel([
            addr.state,
            addr.province,
            addr.city,
            addr.borough,
            addr.county,
            addr.suburb,
        ], name);
        out.push({
            label: label || name,
            name,
            lat,
            lon,
            country: '대한민국',
            kind: typ || cls || 'place',
        });
    });
    return out;
}

export function parseGeocodeResults(json) {
    const rows = json && Array.isArray(json.results) ? json.results : [];
    const out = [];
    rows.forEach((r) => {
        const lat = Number(r && r.latitude);
        const lon = Number(r && r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (r.country || r.country_code) {
            if (!isKoreaCountry(r.country, r.country_code)) return;
        }
        const name = textBit(r.name);
        const bits = uniqueBits([r.admin2, r.admin3, name]);
        const label = (bits.join(' ') || name).slice(0, 40);
        if (!label) return;
        out.push({
            label,
            name: name || label,
            lat,
            lon,
            country: '대한민국',
            kind: 'geocode',
        });
    });
    return out;
}

export function dedupeWeatherPlaces(hits) {
    const seen = new Set();
    const out = [];
    (hits || []).forEach((h) => {
        if (!h) return;
        const lat = Math.round(Number(h.lat) * 1000) / 1000;
        const lon = Math.round(Number(h.lon) * 1000) / 1000;
        const key = `${textBit(h.name)}|${lat}|${lon}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(h);
    });
    return out;
}

function weatherPlaceScore(hit, query) {
    const q = textBit(query).replace(/\s+/g, '');
    const name = textBit(hit && hit.name).replace(/\s+/g, '');
    const label = textBit(hit && hit.label).replace(/\s+/g, '');
    if (!q || !name) return 0;
    let score = 0;
    if (name === q) score += 120;
    else if (QUERY_NAME_SUFFIXES.some((sfx) => name === `${q}${sfx}`)) score += 110;
    else if (name.startsWith(q) || q.startsWith(name)) score += 80;
    else if (name.includes(q) || q.includes(name)) score += 55;
    else if (label.includes(q)) score += 35;
    else return 0;
    if (looksLikeAdminPlace(name)) score += 15;
    const kind = textBit(hit && hit.kind);
    if (['city', 'borough', 'town', 'quarter', 'legal', 'suburb', 'city_district'].includes(kind)) score += 10;
    else if (kind === 'administrative') score += 6;
    else if (PLACE_OSM_VALUES.has(kind)) score += 3;
    if (kind === 'geocode') score -= 20;
    return score;
}

export function rankWeatherPlaces(hits, query) {
    return dedupeWeatherPlaces(hits)
        .map((h) => ({ ...h, _score: weatherPlaceScore(h, query) }))
        .filter((h) => h._score > 0)
        .sort((a, b) => b._score - a._score || a.label.localeCompare(b.label, 'ko'))
        .map(({ _score, ...rest }) => rest)
        .slice(0, 8);
}

export function collectWeatherRegionHits(sources, query) {
    const src = sources && typeof sources === 'object' ? sources : {};
    const merged = [
        ...parsePhotonResults(src.photon),
        ...parseNominatimResults(src.nominatim),
        ...parseGeocodeResults(src.openMeteo),
    ];
    return rankWeatherPlaces(merged, query);
}

async function readJsonSafe(fetchImpl, url, headers) {
    const res = await fetchImpl(url, headers ? { headers } : undefined);
    if (!res) return null;
    if (typeof res.ok === 'boolean' && !res.ok) return null;
    if (typeof res.json === 'function') return res.json();
    return res;
}

/**
 * 동·읍·면 이름을 Photon(OSM)에서 찾고, 비면 Nominatim → Open-Meteo 순으로 보조합니다.
 * @param {string} query
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchWeatherRegionHits(query, fetchImpl = fetch) {
    const q0 = textBit(query);
    const queries = expandWeatherSearchQueries(q0);
    if (!queries.length) return [];
    const photonBag = { features: [] };
    for (const q of queries) {
        try {
            const json = await readJsonSafe(fetchImpl, photonGeocodeUrl(q));
            if (json && Array.isArray(json.features)) photonBag.features.push(...json.features);
        } catch (e) {
            /* 다음 소스 */
        }
    }
    let hits = collectWeatherRegionHits({ photon: photonBag }, q0);
    if (hits.length) return hits;
    const nominatimBag = [];
    for (const q of queries) {
        try {
            const nominatim = await readJsonSafe(fetchImpl, nominatimGeocodeUrl(q), {
                'Accept-Language': 'ko',
            });
            if (Array.isArray(nominatim)) nominatimBag.push(...nominatim);
        } catch (e) {
            /* 다음 소스 */
        }
    }
    hits = collectWeatherRegionHits({ nominatim: nominatimBag }, q0);
    if (hits.length) return hits;
    try {
        const openMeteo = await readJsonSafe(fetchImpl, openMeteoGeocodeUrl(queries[0]));
        return collectWeatherRegionHits({ openMeteo }, q0);
    } catch (e) {
        return [];
    }
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
