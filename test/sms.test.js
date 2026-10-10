import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, smsHref, cleanNumber } from '../src/lib/sms.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  pixel: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

test('detecta iOS, incluido iPadOS que se anuncia como Mac táctil', () => {
  assert.equal(detectPlatform({ userAgent: UA.iphone }), 'ios');
  assert.equal(detectPlatform({ userAgent: UA.ipadOld }), 'ios');
  assert.equal(detectPlatform({ userAgent: UA.ipadOS, maxTouchPoints: 5 }), 'ios');
});

test('un Mac de escritorio (sin pantalla táctil) no es iOS', () => {
  assert.equal(detectPlatform({ userAgent: UA.ipadOS, maxTouchPoints: 0 }), 'other');
});

test('detecta Android, incluido Samsung Internet', () => {
  assert.equal(detectPlatform({ userAgent: UA.samsung, maxTouchPoints: 5 }), 'android');
  assert.equal(detectPlatform({ userAgent: UA.pixel }), 'android');
});

test('escritorio y desconocidos → other', () => {
  assert.equal(detectPlatform({ userAgent: UA.windows }), 'other');
  assert.equal(detectPlatform({}), 'other');
});

test('formato del enlace por plataforma', () => {
  assert.equal(smsHref('+17375291720', 'Hola', 'ios'), 'sms:+17375291720&body=Hola');
  assert.equal(smsHref('+17375291720', 'Hola', 'android'), 'sms:+17375291720?body=Hola');
  assert.equal(smsHref('+17375291720', 'Hola', 'other'), 'sms:+17375291720');
  assert.equal(smsHref('+17375291720', '', 'ios'), 'sms:+17375291720');
});

test('codifica acentos, & y saltos de línea', () => {
  const body = '¡Hola! Recogida & destino:\nAeropuerto (AUS) — 7:30';
  const enc = encodeURIComponent(body);
  assert.equal(smsHref('+17375291720', body, 'ios'), `sms:+17375291720&body=${enc}`);
  assert.equal(smsHref('+17375291720', body, 'android'), `sms:+17375291720?body=${enc}`);
  const href = smsHref('+17375291720', body, 'ios');
  assert.ok(!href.includes('\n') && !href.includes(' ') && !href.includes('&destino'));
  assert.ok(href.includes('%C2%A1Hola') && href.includes('%26') && href.includes('%0A'));
  assert.equal(decodeURIComponent(href.split('&body=')[1]), body);
});

test('limpia el número', () => {
  assert.equal(cleanNumber('+1 (737) 529-1720'), '+17375291720');
  assert.equal(cleanNumber('737.529.1720'), '7375291720');
});
