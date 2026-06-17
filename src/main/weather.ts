// ============================================================
// PixelPal — Daily weather (IP geolocation + open-meteo)
// ============================================================
// Both services are free and need no API key:
//   geo:     http://ip-api.com/json   → city + lat/lon from public IP
//   weather: https://api.open-meteo.com/v1/forecast
// The pet reports the weather + a clothing tip once per day on the
// first run.  Every step fails gracefully (returns null) so a missing
// network never blocks startup.
// ============================================================

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

import type { WeatherInfo } from '../shared/types';
import { WEATHER_CODE_MAP } from '../shared/constants';

function getJson(urlStr: string, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'PixelPal/0.1' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

/** Compose a clothing tip from temperature + weather code. */
function clothingAdvice(tempMax: number, tempMin: number, code: number): string {
  const tips: string[] = [];
  const t = Math.min(tempMax, (tempMax + tempMin) / 2 + 2);

  if (t <= 0) tips.push('羽绒服、厚围巾和手套都安排上吧，别冻着啦');
  else if (t <= 7) tips.push('穿厚外套或羽绒服，注意保暖哦');
  else if (t <= 15) tips.push('外套加毛衣比较合适');
  else if (t <= 22) tips.push('薄外套或长袖刚刚好');
  else if (t <= 27) tips.push('短袖就够啦，很舒服的天气');
  else tips.push('天气很热，穿清凉点，记得多喝水防晒');

  // Rain / snow codes → bring umbrella
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95)) {
    tips.push('记得带把伞☂️');
  } else if (code >= 71 && code <= 86) {
    tips.push('外面在下雪，路滑当心脚下❄️');
  }

  return tips.join('，') + '~';
}

/**
 * Fetch today's weather for the user's approximate location.
 * Returns null on any failure.
 */
export async function fetchDailyWeather(): Promise<WeatherInfo | null> {
  try {
    // 1) Geolocate via public IP
    const geo = await getJson(
      'https://ip-api.com/json/?lang=zh-CN&fields=status,city,regionName,lat,lon',
    );
    if (!geo || geo.status !== 'success' || typeof geo.lat !== 'number') {
      return null;
    }
    const city: string = geo.city || geo.regionName || '你所在的城市';

    // 2) Fetch current + daily weather
    const wx = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&timezone=auto&forecast_days=1`,
    );
    if (!wx || !wx.daily) return null;

    const code: number =
      (wx.daily.weather_code && wx.daily.weather_code[0]) ??
      (wx.current && wx.current.weather_code) ??
      0;
    const tempMax = Math.round(wx.daily.temperature_2m_max?.[0] ?? 0);
    const tempMin = Math.round(wx.daily.temperature_2m_min?.[0] ?? 0);
    const tempNow = Math.round(wx.current?.temperature_2m ?? tempMax);

    const codeInfo = WEATHER_CODE_MAP[code] || { desc: '天气', icon: '🌈' };
    const advice = clothingAdvice(tempMax, tempMin, code);

    const message =
      `${codeInfo.icon} ${city}今天${codeInfo.desc}，` +
      `${tempMin}~${tempMax}℃。${advice}`;

    return {
      city,
      description: codeInfo.desc,
      tempMin,
      tempMax,
      tempNow,
      advice,
      message,
      icon: codeInfo.icon,
    };
  } catch {
    return null;
  }
}

/** Local YYYY-MM-DD for the daily-dedup check. */
export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
