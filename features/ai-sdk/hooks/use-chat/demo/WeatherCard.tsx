import { WeatherData } from "../types";

// 天气图标映射
const getWeatherIcon = (icon: string) => {
  const iconMap: Record<string, string> = {
    sun: "☀️",
    "cloud-sun": "⛅",
    cloud: "☁️",
    "cloud-rain": "🌧️",
    "cloud-fog": "🌫️",
    "cloud-snow": "❄️",
    thunderstorm: "⛈️",
  };
  return iconMap[icon] || "🌡️";
};

interface WeatherCardProps {
  data: WeatherData;
}

export function WeatherCard({ data }: WeatherCardProps) {
  return (
    <div className="bg-linear-to-br from-blue-500 to-indigo-600 text-white rounded-2xl p-5 shadow-xl max-w-md">
      {/* 头部：位置和当前天气 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium opacity-90">📍 {data.location}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-5xl font-light">{data.temperature}°</span>
            <div className="text-sm opacity-80">
              <div>↑ {data.temperatureHigh}°</div>
              <div>↓ {data.temperatureLow}°</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-5xl">{getWeatherIcon(data.condition.icon)}</span>
          <p className="text-sm mt-1 opacity-90">{data.condition.text}</p>
        </div>
      </div>

      {/* 详细信息 */}
      <div className="flex gap-6 mb-4 py-3 border-t border-white/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">💧</span>
          <div>
            <p className="text-xs opacity-70">Humidity</p>
            <p className="font-medium">{data.humidity}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">💨</span>
          <div>
            <p className="text-xs opacity-70">Wind</p>
            <p className="font-medium">{data.windSpeed} km/h</p>
          </div>
        </div>
      </div>

      {/* 5日预报 */}
      <div className="border-t border-white/20 pt-3">
        <p className="text-xs opacity-70 mb-2">5-Day Forecast</p>
        <div className="flex justify-between">
          {data.dailyForecast.map((day) => (
            <div key={day.day} className="text-center">
              <p className="text-xs opacity-80">{day.day}</p>
              <p className="text-xl my-1">{getWeatherIcon(day.condition.icon)}</p>
              <p className="text-xs">
                <span className="font-medium">{day.high}°</span>
                <span className="opacity-60 ml-1">{day.low}°</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
