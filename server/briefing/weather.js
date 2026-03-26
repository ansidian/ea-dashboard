const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

// WeatherAPI condition code → emoji mapping (day / night variants)
const CONDITION_ICONS = {
  1000: ["☀️", "🌙"],    // Sunny / Clear
  1003: ["⛅", "☁️"],    // Partly cloudy
  1006: ["☁️", "☁️"],    // Cloudy
  1009: ["☁️", "☁️"],    // Overcast
  1030: ["☁️", "☁️"],    // Mist
  1063: ["🌦️", "🌧️"],  // Patchy rain possible
  1066: ["🌨️", "🌨️"],  // Patchy snow possible
  1069: ["🌨️", "🌨️"],  // Patchy sleet possible
  1072: ["🌧️", "🌧️"],  // Patchy freezing drizzle
  1087: ["⛈️", "⛈️"],    // Thundery outbreaks possible
  1114: ["🌨️", "🌨️"],  // Blowing snow
  1117: ["🌨️", "🌨️"],  // Blizzard
  1135: ["☁️", "☁️"],    // Fog
  1147: ["☁️", "☁️"],    // Freezing fog
  1150: ["🌦️", "🌧️"],  // Patchy light drizzle
  1153: ["🌦️", "🌧️"],  // Light drizzle
  1168: ["🌧️", "🌧️"],  // Freezing drizzle
  1171: ["🌧️", "🌧️"],  // Heavy freezing drizzle
  1180: ["🌦️", "🌧️"],  // Patchy light rain
  1183: ["🌧️", "🌧️"],  // Light rain
  1186: ["🌧️", "🌧️"],  // Moderate rain at times
  1189: ["🌧️", "🌧️"],  // Moderate rain
  1192: ["🌧️", "🌧️"],  // Heavy rain at times
  1195: ["🌧️", "🌧️"],  // Heavy rain
  1198: ["🌧️", "🌧️"],  // Light freezing rain
  1201: ["🌧️", "🌧️"],  // Moderate/heavy freezing rain
  1204: ["🌨️", "🌨️"],  // Light sleet
  1207: ["🌨️", "🌨️"],  // Moderate/heavy sleet
  1210: ["🌨️", "🌨️"],  // Patchy light snow
  1213: ["🌨️", "🌨️"],  // Light snow
  1216: ["🌨️", "🌨️"],  // Patchy moderate snow
  1219: ["🌨️", "🌨️"],  // Moderate snow
  1222: ["🌨️", "🌨️"],  // Patchy heavy snow
  1225: ["🌨️", "🌨️"],  // Heavy snow
  1237: ["🌨️", "🌨️"],  // Ice pellets
  1240: ["🌦️", "🌧️"],  // Light rain shower
  1243: ["🌧️", "🌧️"],  // Moderate/heavy rain shower
  1246: ["🌧️", "🌧️"],  // Torrential rain shower
  1249: ["🌨️", "🌨️"],  // Light sleet showers
  1252: ["🌨️", "🌨️"],  // Moderate/heavy sleet showers
  1255: ["🌨️", "🌨️"],  // Light snow showers
  1258: ["🌨️", "🌨️"],  // Moderate/heavy snow showers
  1261: ["🌨️", "🌨️"],  // Light showers of ice pellets
  1264: ["🌨️", "🌨️"],  // Moderate/heavy showers of ice pellets
  1273: ["⛈️", "⛈️"],    // Patchy light rain with thunder
  1276: ["⛈️", "⛈️"],    // Moderate/heavy rain with thunder
  1279: ["⛈️", "⛈️"],    // Patchy light snow with thunder
  1282: ["⛈️", "⛈️"],    // Moderate/heavy snow with thunder
};

function getIcon(code, isDay) {
  const pair = CONDITION_ICONS[code] || ["☀️", "🌙"];
  return pair[isDay ? 0 : 1];
}

function formatHour(timeStr) {
  // timeStr is "2026-03-25 14:00" from WeatherAPI
  const h = parseInt(timeStr.split(" ")[1].split(":")[0], 10);
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Cache weather for 30 minutes
let weatherCache = { data: null, ts: 0, key: "" };
const CACHE_TTL = 30 * 60 * 1000;

export async function fetchWeather(lat, lng) {
  if (!WEATHER_API_KEY) throw new Error("WEATHER_API_KEY not set");

  const cacheKey = `${lat},${lng}`;
  if (weatherCache.key === cacheKey && Date.now() - weatherCache.ts < CACHE_TTL && weatherCache.data) {
    return weatherCache.data;
  }

  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lng}&days=2&aqi=no&alerts=no`;

  const res = await fetch(url);
  if (!res.ok) {
    if (weatherCache.data) {
      console.warn("WeatherAPI error, returning cached data");
      return weatherCache.data;
    }
    const text = await res.text();
    throw new Error(`WeatherAPI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const current = data.current;
  const today = data.forecast.forecastday[0];
  const tomorrow = data.forecast.forecastday[1];

  // Build hourly — every 2 hours from next hour, wrapping into tomorrow
  const lastUpdated = new Date(current.last_updated);
  const nowHour = lastUpdated.getMinutes() > 0 ? lastUpdated.getHours() + 1 : lastUpdated.getHours();
  const allHours = [...today.hour, ...(tomorrow?.hour || [])];
  const hourly = [];
  for (let i = nowHour; hourly.length < 8; i += 2) {
    if (i >= allHours.length) break;
    const h = allHours[i];
    hourly.push({
      time: formatHour(h.time),
      temp: Math.round(h.temp_f),
      icon: getIcon(h.condition.code, h.is_day),
    });
  }

  const result = {
    temp: Math.round(current.temp_f),
    high: Math.round(today.day.maxtemp_f),
    low: Math.round(today.day.mintemp_f),
    summary: `${current.condition.text}. High of ${Math.round(today.day.maxtemp_f)}°F, low of ${Math.round(today.day.mintemp_f)}°F.`,
    hourly,
  };

  weatherCache = { data: result, ts: Date.now(), key: cacheKey };
  return result;
}

// Geocode using WeatherAPI's search/autocomplete
export async function geocodeLocation(query) {
  if (!WEATHER_API_KEY) throw new Error("WEATHER_API_KEY not set");

  const url = `https://api.weatherapi.com/v1/search.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json();

  if (!data.length) {
    throw new Error(`No results found for "${query}"`);
  }

  return data.map((r) => ({
    name: [r.name, r.region, r.country].filter(Boolean).join(", "),
    lat: r.lat,
    lng: r.lon,
  }));
}
