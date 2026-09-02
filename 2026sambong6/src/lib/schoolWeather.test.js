import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHOOL_WEATHER_NAVER_ID,
    collectWeatherRegionHits,
    expandWeatherSearchQueries,
    fetchWeatherRegionHits,
    openMeteoGeocodeUrl,
    parseOpenMeteoWeather,
    parseGeocodeResults,
    parsePhotonResults,
    photonGeocodeUrl,
    sanitizeWeatherRegion,
    wmoToScene,
    weatherSceneMeta,
    weatherSourceUrl,
} from './schoolWeather.js';
import { applyBankTransfer, canBankTransfer, sanitizeBankTransferFee } from './bankTransfer.js';

describe('학교 날씨', () => {
    it('네이버 지역 코드와 맑음·비 장면을 맞춘다', () => {
        assert.equal(SCHOOL_WEATHER_NAVER_ID, '15270320');
        assert.equal(wmoToScene(0, false), 'sunny');
        assert.equal(wmoToScene(61, false), 'rain');
        assert.equal(wmoToScene(73, false), 'snow');
        assert.equal(wmoToScene(95, false), 'storm');
        assert.equal(weatherSceneMeta('rain').label, '비');
        const parsed = parseOpenMeteoWeather({
            current: { temperature_2m: 21.7, relative_humidity_2m: 70, weather_code: 2, wind_speed_10m: 1.2, precipitation: 0, is_day: 1, time: '2026-09-02T14:00' },
            daily: { temperature_2m_max: [25], temperature_2m_min: [16] },
        }, 1);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.temp, 21.7);
        assert.equal(parsed.scene, 'sunny');
        assert.equal(parsed.tempMax, 25);
        assert.equal(parsed.regionLabel, '당진시 석문면');
    });

    it('지역 검색 결과와 좌표 저장본을 맞춘다', () => {
        const hits = parseGeocodeResults({
            results: [
                { name: '석문면', admin1: '충청남도', admin2: '당진시', latitude: 36.98, longitude: 126.59, country: '대한민국' },
            ],
        });
        assert.equal(hits.length, 1);
        assert.match(hits[0].label, /석문면/);
        const seoul = sanitizeWeatherRegion({ label: '서울 종로구', lat: 37.57, lon: 126.98 });
        assert.equal(seoul.label, '서울 종로구');
        assert.match(decodeURIComponent(weatherSourceUrl(seoul)), /종로구/);
        assert.equal(SCHOOL_WEATHER_NAVER_ID, '15270320');
    });

    it('한국이 아닌 Open-Meteo 결과는 버린다', () => {
        const hits = parseGeocodeResults({
            results: [
                { name: 'Seokmun', admin1: 'Chungcheongnam-do', latitude: 36.98, longitude: 126.59, country: '대한민국', country_code: 'KR' },
                { name: 'Seokmun', admin1: 'Elsewhere', latitude: 10, longitude: 10, country: 'China', country_code: 'CN' },
            ],
        });
        assert.equal(hits.length, 1);
        assert.equal(hits[0].country, '대한민국');
    });

    it('동만 적어도 동·면 보조 검색어를 붙인다', () => {
        assert.deepEqual(expandWeatherSearchQueries('행당'), ['행당', '행당동', '행당면', '행당읍', '행당리']);
        assert.deepEqual(expandWeatherSearchQueries('행당동'), ['행당동']);
        assert.deepEqual(expandWeatherSearchQueries('석문면'), ['석문면']);
    });

    it('Photon URL은 한글을 인코딩하고 행정구역만 받는다', () => {
        const url = photonGeocodeUrl('행당동');
        assert.match(url, /q=%ED%96%89%EB%8B%B9%EB%8F%99/);
        assert.match(url, /osm_tag=place/);
        assert.match(url, /osm_tag=boundary/);
        assert.match(openMeteoGeocodeUrl('석문면'), /countryCode=KR/);
    });

    it('동 이름 Photon 결과에서 식당·정류장은 빼고 행정동을 앞에 둔다', () => {
        const photon = {
            features: [
                {
                    properties: {
                        osm_key: 'amenity', osm_value: 'restaurant', name: '행당동부리',
                        city: '서울특별시', district: '행당1동', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [127.036, 37.558] },
                },
                {
                    properties: {
                        osm_key: 'place', osm_value: 'quarter', name: '행당동',
                        city: '서울특별시', district: '행당1동', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [127.03571, 37.55783] },
                },
                {
                    properties: {
                        osm_key: 'amenity', osm_value: 'bicycle_rental', name: '행당동 삼부APT후문',
                        city: '서울특별시', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [127.038, 37.559] },
                },
            ],
        };
        const parsed = parsePhotonResults(photon);
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].name, '행당동');
        assert.equal(parsed[0].label, '서울특별시 행당동');
        const ranked = collectWeatherRegionHits({ photon }, '행당동');
        assert.equal(ranked[0].name, '행당동');
    });

    it('석문면은 바위·관광지 석문보다 앞에 둔다', () => {
        const photon = {
            features: [
                {
                    properties: {
                        osm_key: 'historic', osm_value: 'monument', name: '석문',
                        city: '상주시', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [127.87, 36.54] },
                },
                {
                    properties: {
                        osm_key: 'place', osm_value: 'town', name: '석문면',
                        city: '당진시', state: '충청남도', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [126.53523, 37.00826] },
                },
            ],
        };
        const openMeteo = {
            results: [
                { name: '석문', admin1: '충청북도', admin2: '충주시', latitude: 36.97, longitude: 127.92, country: '대한민국', country_code: 'KR' },
            ],
        };
        const hits = collectWeatherRegionHits({ photon, openMeteo }, '석문면');
        assert.ok(hits.length >= 1);
        assert.equal(hits[0].name, '석문면');
        assert.match(hits[0].label, /당진시/);
    });

    it('석문만 쳐도 면·동 행정구역이 나오고 면이 앞에 온다', () => {
        const photon = {
            features: [
                {
                    properties: {
                        osm_key: 'place', osm_value: 'hamlet', name: '석문동',
                        city: '남양리', county: '울릉군', state: '경상북도', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [130.86, 37.49] },
                },
                {
                    properties: {
                        osm_key: 'place', osm_value: 'town', name: '석문면',
                        city: '당진시', state: '충청남도', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [126.53523, 37.00826] },
                },
            ],
        };
        const hits = collectWeatherRegionHits({ photon }, '석문');
        assert.equal(hits[0].name, '석문면');
        assert.equal(hits[1].name, '석문동');
    });

    it('대치동 법정동 경계를 행정구역으로 받는다', () => {
        const hits = parsePhotonResults({
            features: [
                {
                    properties: {
                        osm_key: 'boundary', osm_value: 'legal', name: '대치동',
                        city: '서울특별시', district: '강남구', country: '대한민국', countrycode: 'KR',
                    },
                    geometry: { coordinates: [127.057, 37.499] },
                },
            ],
        });
        assert.equal(hits.length, 1);
        assert.equal(hits[0].name, '대치동');
        assert.match(hits[0].label, /강남구/);
    });

    it('Photon이 비면 Nominatim 동 결과를 쓴다', async () => {
        const hits = await fetchWeatherRegionHits('행당동', async (url) => {
            if (String(url).includes('photon.komoot.io')) {
                return { ok: true, json: async () => ({ features: [] }) };
            }
            if (String(url).includes('nominatim.openstreetmap.org')) {
                return {
                    ok: true,
                    json: async () => ([
                        {
                            lat: '37.55783',
                            lon: '127.03571',
                            name: '행당동',
                            class: 'place',
                            type: 'quarter',
                            address: {
                                quarter: '행당동',
                                city: '서울특별시',
                                borough: '성동구',
                                country: '대한민국',
                                country_code: 'kr',
                            },
                        },
                    ]),
                };
            }
            throw new Error('unexpected url ' + url);
        });
        assert.equal(hits[0].name, '행당동');
        assert.match(hits[0].label, /행당동/);
    });
});

describe('계좌이체', () => {
    it('수수료를 포함해 보내고 자기 자신에게는 못 보낸다', () => {
        assert.equal(sanitizeBankTransferFee(3), 3);
        const blocked = canBankTransfer({ fromId: '12', toId: '12', amount: 10, fee: 1, fromBong: 100 });
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'self');
        const poor = canBankTransfer({ fromId: '12', toId: '1', amount: 10, fee: 2, fromBong: 11 });
        assert.equal(poor.ok, false);
        const ok = applyBankTransfer({ fromBong: 100, toBong: 5, amount: 10, fee: 2 });
        assert.equal(ok.ok, true);
        assert.equal(ok.fromBong, 88);
        assert.equal(ok.toBong, 15);
        assert.equal(ok.fee, 2);
    });
});
