import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHOOL_WEATHER_NAVER_ID,
    extractWeatherJson,
    isSharedWeatherFresh,
    parseOpenMeteoWeather,
    parseGeocodeResults,
    sanitizeWeatherRegion,
    sharedWeatherMatchesRegion,
    wmoToScene,
    weatherRegionKey,
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

    it('공유 캐시와 프록시 JSON을 같은 지역에만 쓴다', () => {
        const region = sanitizeWeatherRegion({ label: '당진시 석문면', lat: 36.981918, lon: 126.590825 });
        const shared = {
            ok: true,
            temp: 18,
            text: '맑음',
            scene: 'sunny',
            regionLabel: region.label,
            regionKey: weatherRegionKey(region),
            fetchedAt: 1000,
        };
        assert.equal(sharedWeatherMatchesRegion(shared, region), true);
        assert.equal(sharedWeatherMatchesRegion(shared, { label: '서울 종로구', lat: 37.57, lon: 126.98 }), false);
        assert.equal(isSharedWeatherFresh(shared, 1000 + 10 * 60 * 1000), true);
        assert.equal(isSharedWeatherFresh(shared, 1000 + 60 * 60 * 1000), false);
        const wrapped = extractWeatherJson('Title\n\n{"current":{"temperature_2m":20,"weather_code":0,"is_day":1,"time":"2026-09-02T10:00"},"daily":{"temperature_2m_max":[22],"temperature_2m_min":[14]}}');
        assert.equal(wrapped.current.temperature_2m, 20);
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
