// WMO weather code → icon mapping
const WMO_ICONS = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  56: "🌧️", 57: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "🌧️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const WMO_DESCRIPTIONS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

function formatHour(isoString) {
  // Parse the hour from the ISO string directly (already in target timezone)
  const h = parseInt(isoString.split("T")[1].split(":")[0], 10);
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function getCurrentHourInTimezone(tz) {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false });
  return parseInt(timeStr, 10);
}

// Cache weather for 30 minutes — Open-Meteo free tier is 10k req/day
let weatherCache = { data: null, ts: 0, key: "" };
const CACHE_TTL = 30 * 60 * 1000; // 30 min

export async function fetchWeather(lat, lng) {
  const cacheKey = `${lat},${lng}`;
  if (weatherCache.key === cacheKey && Date.now() - weatherCache.ts < CACHE_TTL && weatherCache.data) {
    return weatherCache.data;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lng);
  url.searchParams.set("hourly", "temperature_2m,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "America/Los_Angeles");
  url.searchParams.set("forecast_days", "2");

  const res = await fetch(url);
  if (!res.ok) {
    // If rate-limited and we have cached data, return stale cache
    if (res.status === 429 && weatherCache.data) {
      console.warn("Weather API rate-limited, returning cached data");
      return weatherCache.data;
    }
    const text = await res.text();
    throw new Error(`Open-Meteo error: ${res.status} ${text}`);
  }
  const data = await res.json();

  if (!data.hourly?.temperature_2m) {
    throw new Error("Open-Meteo returned unexpected data shape");
  }

  const currentHourIndex = getCurrentHourInTimezone("America/Los_Angeles");

  // Build hourly array — every 2 hours from current hour, wrapping into tomorrow
  const hourly = [];
  for (let i = currentHourIndex; hourly.length < 8; i += 2) {
    if (i >= data.hourly.time.length) break;
    const code = data.hourly.weather_code?.[i] ?? data.hourly.weathercode?.[i];
    hourly.push({
      time: formatHour(data.hourly.time[i]),
      temp: Math.round(data.hourly.temperature_2m[i]),
      icon: WMO_ICONS[code] || "☀️",
    });
  }

  const currentCode = data.hourly.weather_code?.[currentHourIndex] ?? data.hourly.weathercode?.[currentHourIndex] ?? 0;
  const description = WMO_DESCRIPTIONS[currentCode] || "Clear";

  const result = {
    temp: Math.round(data.hourly.temperature_2m[currentHourIndex]),
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    summary: `${description}. High of ${Math.round(data.daily.temperature_2m_max[0])}°F, low of ${Math.round(data.daily.temperature_2m_min[0])}°F.`,
    hourly,
  };

  weatherCache = { data: result, ts: Date.now(), key: cacheKey };
  return result;
}

// Geocode a city name to lat/lng using Open-Meteo's geocoding API
export async function geocodeLocation(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json();

  if (!data.results?.length) {
    throw new Error(`No results found for "${query}"`);
  }

  return data.results.map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
  }));
}
