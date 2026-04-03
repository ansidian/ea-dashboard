const PIRATE_WEATHER_API_KEY = process.env.PIRATE_WEATHER_API_KEY;

// Pirate Weather (Dark Sky-compatible) icon → emoji mapping
const ICON_MAP = {
  "clear-day": "☀️",
  "clear-night": "🌙",
  "rain": "🌧️",
  "snow": "🌨️",
  "sleet": "🌨️",
  "wind": "💨",
  "fog": "🌫️",
  "cloudy": "☁️",
  "partly-cloudy-day": "⛅",
  "partly-cloudy-night": "☁️",
  "hail": "🌨️",
  "thunderstorm": "⛈️",
  "tornado": "🌪️",
};

function getIcon(iconStr) {
  return ICON_MAP[iconStr] || "☀️";
}

function formatHour(unixTime, timezone) {
  const d = new Date(unixTime * 1000);
  const h = parseInt(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: timezone }), 10);
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Cache weather for 30 minutes
let weatherCache = { data: null, ts: 0, key: "" };
const CACHE_TTL = 30 * 60 * 1000;

export async function fetchWeather(lat, lng) {
  if (!PIRATE_WEATHER_API_KEY) throw new Error("PIRATE_WEATHER_API_KEY not set");

  const cacheKey = `${lat},${lng}`;
  if (weatherCache.key === cacheKey && Date.now() - weatherCache.ts < CACHE_TTL && weatherCache.data) {
    return weatherCache.data;
  }

  const url = `https://api.pirateweather.net/forecast/${PIRATE_WEATHER_API_KEY}/${lat},${lng}?exclude=minutely,flags&units=us`;

  const res = await fetch(url);
  if (!res.ok) {
    if (weatherCache.data) {
      console.warn("Pirate Weather error, returning cached data");
      return weatherCache.data;
    }
    const text = await res.text();
    throw new Error(`Pirate Weather error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const current = data.currently;
  const today = data.daily?.data?.[0];
  const timezone = data.timezone;

  // Build hourly — every 2 hours starting from the next future hour
  const nowUnix = current.time;
  const hourly = [];
  const hours = data.hourly?.data || [];
  const startIdx = hours.findIndex((h) => h.time > nowUnix);
  for (let i = startIdx; i >= 0 && i < hours.length && hourly.length < 8; i += 2) {
    const h = hours[i];
    hourly.push({
      time: formatHour(h.time, timezone),
      temp: Math.round(h.temperature),
      icon: getIcon(h.icon),
    });
  }

  const result = {
    temp: Math.round(current.temperature),
    high: today ? Math.round(today.temperatureHigh) : Math.round(current.temperature),
    low: today ? Math.round(today.temperatureLow) : Math.round(current.temperature),
    summary: `${current.summary || ""}. High of ${today ? Math.round(today.temperatureHigh) : Math.round(current.temperature)}°F, low of ${today ? Math.round(today.temperatureLow) : Math.round(current.temperature)}°F.`,
    hourly,
  };

  weatherCache = { data: result, ts: Date.now(), key: cacheKey };
  return result;
}

// Geocode using OpenStreetMap Nominatim (free, no key required)
export async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "EA-Dashboard/1.0" },
  });
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json();

  if (!data.length) {
    throw new Error(`No results found for "${query}"`);
  }

  return data.map((r) => ({
    name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}
