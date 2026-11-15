import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { koreanVoices, pickVoice, speechFallbackMs, speechText, voiceScore } from './mathSpeech.js';

describe('수학 개념 읽어 주기', () => {
    it('기호를 말로 바꿔요', () => {
        assert.equal(speechText('3 + 4 = 7'), '3 더하기 4 는 7');
        assert.equal(speechText('7 − 3 = 4'), '7 빼기 3 는 4');
        assert.equal(speechText('3/4 ÷ 2'), '4분의 3 나누기 2');
        assert.equal(speechText('6 × 4 = 24 cm²'), '6 곱하기 4 는 24 제곱센티미터');
        assert.equal(speechText('235 cm = 2 m 35 cm'), '235 센티미터 는 2 미터 35 센티미터');
        assert.equal(speechText('각은 60°예요.'), '각은 60도예요.');
        assert.ok(!/[()→"]/.test(speechText('그래서 "칠" (7) → 끝')));
    });
    it('자연스러운 한국어 목소리를 먼저 골라요', () => {
        const voices = [
            { name: 'Microsoft Heami - Korean (Korea)', lang: 'ko-KR', localService: true },
            { name: 'Microsoft SunHi Online (Natural) - Korean (Korea)', lang: 'ko-KR', localService: false },
            { name: 'Google 한국의', lang: 'ko-KR', localService: false },
            { name: 'Samantha', lang: 'en-US', localService: true },
        ];
        assert.equal(voiceScore(voices[3]), -1);
        assert.deepEqual(koreanVoices(voices).map((v) => v.name.split(' ')[1]), ['SunHi', '한국의', 'Heami']);
        assert.match(pickVoice(voices).name, /SunHi/);
        assert.equal(pickVoice(voices, 'Google 한국의').name, 'Google 한국의');
        assert.equal(pickVoice([voices[3]]), null);
    });
    it('안전장치 시간은 글이 길수록 길어요', () => {
        assert.ok(speechFallbackMs('가'.repeat(60)) > speechFallbackMs('가'.repeat(10)));
        assert.ok(speechFallbackMs('') >= 6000);
    });
});
