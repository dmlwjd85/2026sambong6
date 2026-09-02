import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHOOL_WEATHER_NAVER_ID,
    parseOpenMeteoWeather,
    wmoToScene,
    weatherSceneMeta,
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
