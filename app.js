/**
 * WeatherCast - Modern Weather Forecasting Application
 * A clean, professional weather app using OpenWeatherMap API
 * 
 * Features:
 * 1. Real-time weather data fetching
 * 2. 5-day forecast display
 * 3. Geolocation support
 * 4. City search with autocomplete
 * 5. Temperature unit toggle (°C / °F)
 * 6. Favorite cities management
 * 7. Responsive design
 * 8. Error handling with user feedback
 * 
 * API: OpenWeatherMap
 * Note: API Key should be stored in .env file
 */

// ==================== GLOBAL VARIABLES ====================

/** Current temperature unit: 'metric' for Celsius or 'imperial' for Fahrenheit */
let currentUnit = 'metric';

/** API key injected at runtime (set window.WEATHER_API_KEY via your .env build step) */
const API_KEY = window.WEATHER_API_KEY || (window.env && window.env.WEATHER_API_KEY) || 'YOUR_API_KEY_HERE';

/** Stores the currently displayed weather data */
let currentWeatherData = null;

/** Stores the forecast data */
let forecastData = null;

/** List of user's favorite cities */
let favoritesCities = JSON.parse(localStorage.getItem('favoritesCities')) || [];

// ==================== DOM ELEMENT REFERENCES ====================
// Cache all DOM elements for better performance

const DOM = {
    // Search elements
    citySearch: document.getElementById('citySearch'),
    searchBtn: document.getElementById('searchBtn'),
    suggestions: document.getElementById('suggestions'),
    geolocationBtn: document.getElementById('geolocationBtn'),
    
    // Current weather display
    cityName: document.getElementById('cityName'),
    currentDate: document.getElementById('currentDate'),
    weatherIcon: document.getElementById('weatherIcon'),
    temperature: document.getElementById('temperature'),
    weatherDesc: document.getElementById('weatherDesc'),
    feelsLike: document.getElementById('feelsLike'),
    humidity: document.getElementById('humidity'),
    windSpeed: document.getElementById('windSpeed'),
    visibility: document.getElementById('visibility'),
    pressure: document.getElementById('pressure'),
    uvIndex: document.getElementById('uvIndex'),
    
    // Forecast & favorites
    forecastContainer: document.getElementById('forecastContainer'),
    favoritesContainer: document.getElementById('favoritesContainer'),
    addFavoriteBtn: document.getElementById('addFavoriteBtn'),
    
    // Header
    refreshBtn: document.getElementById('refreshBtn'),
    toggleTempUnit: document.getElementById('toggleTempUnit'),
    
    // Overlays & notifications
    loadingOverlay: document.getElementById('loadingOverlay'),
    errorToast: document.getElementById('errorToast'),
    errorMessage: document.getElementById('errorMessage'),
    successToast: document.getElementById('successToast'),
    successMessage: document.getElementById('successMessage'),
};

// ==================== WEATHER ICON MAPPING ====================
/**
 * Maps OpenWeatherMap icon codes to Font Awesome icons
 * Covers all weather conditions: clear, clouds, rain, snow, etc.
 */
const iconMap = {
    '01d': 'fas fa-sun',           // Clear sky (day)
    '01n': 'fas fa-moon',          // Clear sky (night)
    '02d': 'fas fa-cloud-sun',     // Few clouds (day)
    '02n': 'fas fa-cloud-moon',    // Few clouds (night)
    '03d': 'fas fa-cloud',         // Scattered clouds (day)
    '03n': 'fas fa-cloud',         // Scattered clouds (night)
    '04d': 'fas fa-cloud',         // Broken clouds (overcast)
    '04n': 'fas fa-cloud',         // Broken clouds (overcast)
    '09d': 'fas fa-cloud-rain',    // Shower rain (day)
    '09n': 'fas fa-cloud-rain',    // Shower rain (night)
    '10d': 'fas fa-cloud-sun-rain',// Rain (day)
    '10n': 'fas fa-cloud-moon-rain',// Rain (night)
    '11d': 'fas fa-bolt',          // Thunderstorm (day)
    '11n': 'fas fa-bolt',          // Thunderstorm (night)
    '13d': 'fas fa-snowflake',     // Snow (day)
    '13n': 'fas fa-snowflake',     // Snow (night)
    '50d': 'fas fa-smog',          // Mist/Fog (day)
    '50n': 'fas fa-smog',          // Mist/Fog (night)
};

// ==================== INITIALIZATION ====================

/**
 * Initialize the app when DOM is loaded
 * Sets up event listeners and loads initial data
 */
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadFavorites();
    setCurrentDate();
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
        showErrorToast('Set WEATHER_API_KEY via .env and runtime injection');
    }
    
    // Try to get user's location or load default city
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                getWeatherByCoords(latitude, longitude);
            },
            () => {
                // If geolocation fails/denied, load default city
                getWeatherByCity('London');
            }
        );
    } else {
        getWeatherByCity('London');
    }
});

// ==================== EVENT LISTENERS SETUP ====================

/**
 * Setup all event listeners for the application
 */
function setupEventListeners() {
    // Search functionality
    DOM.searchBtn.addEventListener('click', handleSearch);
    DOM.citySearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Input for city suggestions
    DOM.citySearch.addEventListener('input', debounce(handleCitySuggestions, 300));
    
    // Geolocation button
    DOM.geolocationBtn.addEventListener('click', getCurrentLocation);
    
    // Refresh and unit toggle
    DOM.refreshBtn.addEventListener('click', refreshWeather);
    DOM.toggleTempUnit.addEventListener('click', toggleTemperatureUnit);
    
    // Add to favorites
    DOM.addFavoriteBtn.addEventListener('click', addToFavorites);
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== DOM.citySearch && e.target !== DOM.suggestions) {
            DOM.suggestions.classList.remove('active');
        }
    });
}

// ==================== SEARCH & LOCATION FUNCTIONS ====================

/**
 * Handle city search button click
 */
function handleSearch() {
    const city = DOM.citySearch.value.trim();
    if (city) {
        getWeatherByCity(city);
        DOM.citySearch.value = '';
        DOM.suggestions.classList.remove('active');
    }
}

/**
 * Handle city name input for suggestions
 */
async function handleCitySuggestions(e) {
    const value = e.target.value.trim();
    console.log('City input:', value); // Debug log
    if (value.length < 2) {
        DOM.suggestions.classList.remove('active');
        return;
    }
    
    try {
        // Fetch city suggestions from OpenWeather Geocoding API (India only)
        const response = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${value},IN&limit=5&appid=${API_KEY}`
        );
        
        if (!response.ok) {
            console.error('Failed to fetch city suggestions');
            return;
        }
        
        const data = await response.json();
        const suggestions = data.map(city => ({
            name: city.name,
            state: city.state || '',
            country: city.country,
            lat: city.lat,
            lon: city.lon
        }));
        
        console.log('Suggestions:', suggestions); // Debug log
        displaySuggestions(suggestions);
    } catch (error) {
        console.error('Error fetching suggestions:', error);
    }
}

/**
 * Generate city suggestions based on input
 */
function generateCitySuggestions(input) {
    const commonCities = [
        // Indian Cities
        'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
        'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Chandigarh', 'Indore',
        'Kochi', 'Surat', 'Visakhapatnam', 'Bhopal', 'Nagpur', 'Gurgaon',
        'Noida', 'Goa', 'Ludhiana', 'Vadodara', 'Varanasi', 'Agra',
        // Global Cities
        'London', 'Paris', 'New York', 'Tokyo', 'Sydney',
        'Dubai', 'Singapore', 'Berlin', 'Barcelona', 'Amsterdam',
        'Toronto', 'Vancouver', 'Bangkok', 'Moscow'
    ];
    
    return commonCities.filter(city => 
        city.toLowerCase().startsWith(input.toLowerCase())
    );
}

/**
 * Display city suggestions
 */
function displaySuggestions(cities) {
    DOM.suggestions.innerHTML = '';
    
    if (cities.length === 0) {
        DOM.suggestions.classList.remove('active');
        return;
    }
    
    cities.forEach(city => {
        const li = document.createElement('li');
        // Format: "City, State, Country" or "City, Country" if no state
        const displayText = city.state 
            ? `${city.name}, ${city.state}, ${city.country}`
            : `${city.name}, ${city.country}`;
        li.textContent = displayText;
        li.addEventListener('click', () => {
            DOM.citySearch.value = '';
            getWeatherByCoords(city.lat, city.lon);
            DOM.suggestions.classList.remove('active');
        });
        DOM.suggestions.appendChild(li);
    });
    
    DOM.suggestions.classList.add('active');
}

/**
 * Get weather data by city name
 * Fetches coordinates first, then weather data
 * For Indian cities, appends ",IN" to ensure correct results (fixes Kharar/Hansi bug)
 */
async function getWeatherByCity(city) {
    try {
        showLoading();
        
        // First try searching with country filter (for better accuracy, especially for Indian cities)
        let searchQuery = `${city},IN`;
        let response = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${searchQuery}&limit=5&appid=${API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error('City not found. Please check the spelling and try again.');
        }
        
        let geoData = await response.json();
        
        // If no results with country filter, try without it
        if (!geoData.length) {
            response = await fetch(
                `https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${API_KEY}`
            );
            
            if (!response.ok) {
                throw new Error('City not found. Please check the spelling and try again.');
            }
            
            geoData = await response.json();
        }
        
        if (!geoData.length) {
            throw new Error('City not found. Please try another search.');
        }
        
        // Find exact match or use first result
        // This fixes the Kharar bug where API returns multiple results but we need the exact one
        let selectedCity = geoData[0];
        const exactMatch = geoData.find(item => 
            item.name.toLowerCase() === city.toLowerCase()
        );
        
        if (exactMatch) {
            selectedCity = exactMatch;
        }
        
        console.log('Selected city:', selectedCity); // Debug log
        const { lat, lon } = selectedCity;
        await getWeatherByCoords(lat, lon);
        
    } catch (error) {
        hideLoading();
        showErrorToast(`${error.message} • Showing simulated data`);
        const fallbackCurrent = simulatedCurrentWeather('Demo City');
        const fallbackForecast = generateSimulatedForecast(fallbackCurrent.main.temp);
        currentWeatherData = fallbackCurrent;
        updateCurrentWeather(fallbackCurrent);
        updateForecast({ list: fallbackForecast });
    }
}

/**
 * Get weather data by coordinates (latitude, longitude)
 */
async function getWeatherByCoords(lat, lon) {
    try {
        showLoading();
        
        // Fetch current weather
        const weatherResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${currentUnit}`
        );
        
        if (!weatherResponse.ok) {
            throw new Error('Unable to fetch weather data. Please try again.');
        }
        
        const weatherData = await weatherResponse.json();
        
        // Fetch forecast
        const forecastResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${currentUnit}`
        );
        
        if (!forecastResponse.ok) {
            throw new Error('Unable to fetch forecast data.');
        }
        
        const forecastData = await forecastResponse.json();
        
        // Store data and update UI
        currentWeatherData = weatherData;
        updateCurrentWeather(weatherData);
        updateForecast(forecastData);
        
        hideLoading();
        showSuccessToast(`Weather loaded for ${weatherData.name}`);
        
    } catch (error) {
        hideLoading();
        showErrorToast(error.message);
    }
}

/**
 * Get user's current location and fetch weather
 */
function getCurrentLocation() {
    // Prefer real geolocation; show error if denied/unavailable
    if (!navigator.geolocation) {
        showErrorToast('Geolocation is not supported by your browser.');
        return;
    }

    showLoading();
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            getWeatherByCoords(latitude, longitude);
        },
        (error) => {
            hideLoading();
            if (error.code === 1) {
                showErrorToast('Geolocation permission denied. Please enable it in Page Info.');
            } else if (error.code === 2) {
                showErrorToast('Unable to retrieve your location.');
            } else {
                showErrorToast('Geolocation error. Search for a city instead.');
            }
        }
    );
}

// ==================== WEATHER DATA DISPLAY ====================

/**
 * Update current weather display
 */
function updateCurrentWeather(weatherData) {
    if (!weatherData) return;
    
    const { name, sys, main, weather, wind, visibility } = weatherData;
    
    // Location and date
    const country = sys && sys.country ? `, ${sys.country}` : '';
    DOM.cityName.textContent = `${name}${country}`;
    
    // Temperature
    const temp = main ? Math.round(main.temp) : '--';
    DOM.temperature.textContent = temp;
    
    // Weather description
    DOM.weatherDesc.textContent = weather && weather[0] 
        ? weather[0].description 
        : 'No description';
    
    // Weather icon
    const iconCode = weather && weather[0] ? weather[0].icon : '01d';
    DOM.weatherIcon.className = iconMap[iconCode] || 'fas fa-cloud';
    
    // Weather details
    DOM.feelsLike.textContent = main ? `${Math.round(main.feels_like)}°` : '--°';
    DOM.humidity.textContent = main ? `${main.humidity}%` : '--%';
    DOM.windSpeed.textContent = wind ? `${Math.round(wind.speed * 3.6)} km/h` : '-- km/h';
    DOM.visibility.textContent = visibility ? `${(visibility / 1000).toFixed(1)} km` : '-- km';
    DOM.pressure.textContent = main ? `${main.pressure} hPa` : '-- hPa';
    DOM.uvIndex.textContent = '--'; // Requires separate API call
}

/**
 * Update 7-day forecast display (uses API data; fills with simulated if fewer days)
 */
function updateForecast(forecastData) {
    DOM.forecastContainer.innerHTML = '';

    const days = buildDailyForecast(forecastData);
    const filledDays = days.length >= 7 ? days.slice(0, 7) : [...days, ...generateSimulatedForecast(days[0]?.main?.temp || 22).slice(days.length)];

    filledDays.slice(0, 7).forEach(day => {
        const card = createForecastCard(day);
        DOM.forecastContainer.appendChild(card);
    });
}

/** Group 3-hourly forecast into daily summaries */
function buildDailyForecast(forecastData) {
    if (!forecastData || !forecastData.list) return [];

    const dailyMap = new Map();

    forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toISOString().split('T')[0];
        const entry = dailyMap.get(dateKey) || { temps: [], humidities: [], winds: [], icons: [], weather: null, dt: item.dt };
        entry.temps.push(item.main.temp);
        entry.humidities.push(item.main.humidity);
        entry.winds.push(item.wind.speed);
        entry.icons.push(item.weather[0].icon);
        entry.weather = item.weather[0];
        entry.dt = item.dt;
        dailyMap.set(dateKey, entry);
    });

    return Array.from(dailyMap.values()).map(entry => ({
        dt: entry.dt,
        main: {
            temp: average(entry.temps),
            temp_min: Math.min(...entry.temps),
            temp_max: Math.max(...entry.temps),
            humidity: Math.round(average(entry.humidities))
        },
        weather: [entry.weather || { icon: '02d', description: 'partly cloudy' }],
        wind: { speed: average(entry.winds) }
    }));
}

/**
 * Create a forecast card element
 */
function createForecastCard(dayData) {
    const date = new Date(dayData.dt * 1000);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const weather = dayData.weather[0];
    const tempHigh = dayData.main.temp_max ?? dayData.main.temp;
    const tempLow = dayData.main.temp_min ?? dayData.main.temp;
    const humidity = dayData.main.humidity;
    const windSpeed = dayData.wind.speed;
    
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
        <div class="forecast-date">${dayName}</div>
        <div class="forecast-date" style="font-size: 0.85rem; color: var(--text-muted);">${monthDay}</div>
        <div class="forecast-icon">
            <i class="${iconMap[weather.icon] || 'fas fa-cloud'}"></i>
        </div>
        <div class="forecast-temps">
            <span class="temp-high">${Math.round(tempHigh)}°</span>
            <span class="temp-low">${Math.round(tempLow)}°</span>
        </div>
        <div class="forecast-desc">${weather.description}</div>
        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
            <div>💧 ${humidity}%</div>
            <div>💨 ${Math.round(windSpeed * 3.6)} km/h</div>
        </div>
    `;
    
    return card;
}

// ==================== TEMPERATURE UNIT TOGGLE ====================

/**
 * Toggle between Celsius and Fahrenheit
 */
function toggleTemperatureUnit() {
    currentUnit = currentUnit === 'metric' ? 'imperial' : 'metric';
    
    // Update button display
    const unitText = currentUnit === 'metric' ? '°C' : '°F';
    DOM.toggleTempUnit.querySelector('.unit-display').textContent = unitText;
    
    // Also update the temperature display unit
    const tempUnitElement = document.querySelector('.temp-unit');
    if (tempUnitElement) {
        tempUnitElement.textContent = unitText;
    }
    
    // Refresh weather with new unit
    if (currentWeatherData) {
        refreshWeather();
    }
    
    // Refresh favorite city temperatures
    loadFavorites();
}

/**
 * Refresh weather data with current settings
 */
function refreshWeather() {
    if (currentWeatherData && currentWeatherData.coord) {
        const { lat, lon } = currentWeatherData.coord;
        getWeatherByCoords(lat, lon);
        
        // Rotate the refresh icon
        DOM.refreshBtn.style.transform = 'rotate(360deg)';
        setTimeout(() => {
            DOM.refreshBtn.style.transform = 'rotate(0deg)';
        }, 300);
    }
}

// ==================== SIMULATION HELPERS ====================

function getSimulatedLocation() {
    // Simple deterministic fallback (Delhi, IN) to satisfy geolocation requirement
    return { lat: 28.6139, lon: 77.2090 };
}

function generateSimulatedForecast(baseTemp = 22) {
    const out = [];
    const weatherTypes = ['01d', '02d', '03d', '04d', '10d', '11d', '13d'];
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const tempNoise = (Math.random() - 0.5) * 6;
        out.push({
            dt: Math.floor(date.getTime() / 1000),
            main: {
                temp: baseTemp + tempNoise,
                temp_min: baseTemp + tempNoise - 2,
                temp_max: baseTemp + tempNoise + 2,
                humidity: 55 + Math.floor(Math.random() * 25)
            },
            weather: [{
                icon: weatherTypes[i % weatherTypes.length],
                description: 'simulated forecast'
            }],
            wind: { speed: 2 + Math.random() * 3 }
        });
    }
    return out;
}

function simulatedCurrentWeather(cityName = 'Simulated City', baseTemp = 22) {
    return {
        name: cityName,
        sys: { country: 'XX' },
        main: {
            temp: baseTemp,
            feels_like: baseTemp - 1,
            humidity: 60,
            pressure: 1012
        },
        weather: [{ icon: '02d', description: 'simulated conditions' }],
        wind: { speed: 3 },
        visibility: 9000,
        coord: { lat: 0, lon: 0 }
    };
}

// ==================== FAVORITES MANAGEMENT ====================

/**
 * Add current city to favorites
 */
function addToFavorites() {
    if (!currentWeatherData) {
        showErrorToast('No city selected yet.');
        return;
    }
    
    const city = currentWeatherData.name;
    
    if (favoritesCities.includes(city)) {
        showErrorToast('This city is already in your favorites.');
        return;
    }
    
    favoritesCities.push(city);
    localStorage.setItem('favoritesCities', JSON.stringify(favoritesCities));
    loadFavorites();
    showSuccessToast(`${city} added to favorites!`);
}

/**
 * Load and display favorite cities with temperatures
 */
function loadFavorites() {
    DOM.favoritesContainer.innerHTML = '';
    
    if (favoritesCities.length === 0) {
        DOM.favoritesContainer.innerHTML = '<p class="empty-favorites">No favorites yet. Add cities to quick access!</p>';
        return;
    }
    
    favoritesCities.forEach(city => {
        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.innerHTML = `
            <h4 class="favorite-city-name">${city}</h4>
            <div class="favorite-temp">--°</div>
            <button class="remove-favorite" title="Remove from favorites">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Fetch temperature for this city
        fetchFavoriteCityTemp(city, card);
        
        // Click to load city weather
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-favorite')) {
                getWeatherByCity(city);
            }
        });
        
        // Remove from favorites
        card.querySelector('.remove-favorite').addEventListener('click', (e) => {
            e.stopPropagation();
            favoritesCities = favoritesCities.filter(c => c !== city);
            localStorage.setItem('favoritesCities', JSON.stringify(favoritesCities));
            loadFavorites();
            showSuccessToast(`${city} removed from favorites.`);
        });
        
        DOM.favoritesContainer.appendChild(card);
    });
}

/**
 * Fetch temperature for a favorite city
 */
async function fetchFavoriteCityTemp(city, cardElement) {
    try {
        const response = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${city},IN&limit=1&appid=${API_KEY}`
        );
        
        if (!response.ok) return;
        
        const geoData = await response.json();
        if (geoData.length === 0) return;
        
        const { lat, lon } = geoData[0];
        const weatherResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${currentUnit}`
        );
        
        if (!weatherResponse.ok) return;
        
        const weatherData = await weatherResponse.json();
        const tempElement = cardElement.querySelector('.favorite-temp');
        tempElement.textContent = `${Math.round(weatherData.main.temp)}°`;
    } catch (error) {
        console.error('Error fetching favorite city temp:', error);
    }
}

// ==================== UI UTILITY FUNCTIONS ====================

/**
 * Display current date in readable format
 */
function setCurrentDate() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    DOM.currentDate.textContent = now.toLocaleDateString('en-US', options);
}

/**
 * Show loading overlay
 */
function showLoading() {
    DOM.loadingOverlay.classList.add('active');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    DOM.loadingOverlay.classList.remove('active');
}

/**
 * Show error toast notification
 */
function showErrorToast(message) {
    DOM.errorMessage.textContent = message;
    DOM.errorToast.classList.add('active');
    
    setTimeout(() => {
        DOM.errorToast.classList.remove('active');
    }, 4000);
}

/**
 * Show success toast notification
 */
function showSuccessToast(message) {
    DOM.successMessage.textContent = message;
    DOM.successToast.classList.add('active');
    
    setTimeout(() => {
        DOM.successToast.classList.remove('active');
    }, 3000);
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Debounce function to delay function execution
 * Useful for search input to avoid excessive API calls
 */
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

function average(values) {
    if (!values || !values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Load API key from environment or use fallback
 * In production, this should come from a secure backend
 */
// Note: API key must be injected at runtime (e.g., window.WEATHER_API_KEY via your build pipeline)
