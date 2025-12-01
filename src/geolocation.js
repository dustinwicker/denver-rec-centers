/**
 * Geolocation and Distance Service
 * Uses browser geolocation + OSRM (free routing API) for dynamic distances
 */

const GeoService = (() => {
  const CACHE_KEY = 'denver_rec_geo_cache';
  const LOCATION_THRESHOLD_MILES = 0.25; // Recalculate if moved more than 0.25 miles
  const OSRM_BASE_URL = 'https://router.project-osrm.org/table/v1';
  
  // Recreation center coordinates (pre-computed from addresses)
  const REC_CENTERS = [
    { name: "Ashland", lat: 39.6789, lng: -104.9811, address: "1600 E 19th Ave, Denver, CO 80218" },
    { name: "Athmar", lat: 39.6833, lng: -105.0167, address: "1200 S Hazel Ct, Denver, CO 80219" },
    { name: "Barnum", lat: 39.7167, lng: -105.0333, address: "360 Hooker St, Denver, CO 80219" },
    { name: "Carla Madison", lat: 39.7311, lng: -104.9528, address: "2401 E Colfax Ave, Denver, CO 80206" },
    { name: "Central Park", lat: 39.7583, lng: -104.8833, address: "9651 E Martin Luther King Jr Blvd, Denver, CO 80238" },
    { name: "Cook Park", lat: 39.6500, lng: -104.9333, address: "7100 S Cherry Creek Dr, Denver, CO 80224" },
    { name: "Crestmoor Park", lat: 39.7000, lng: -104.9167, address: "700 Monaco Pkwy, Denver, CO 80220" },
    { name: "Dunham", lat: 39.7833, lng: -104.9833, address: "1355 Osceola St, Denver, CO 80204" },
    { name: "Eisenhower", lat: 39.7333, lng: -105.0000, address: "4300 W Dartmouth Ave, Denver, CO 80236" },
    { name: "Glenarm", lat: 39.7394, lng: -104.9847, address: "2800 Glenarm Pl, Denver, CO 80205" },
    { name: "Green Valley Ranch", lat: 39.8333, lng: -104.8000, address: "4890 Argonne St, Denver, CO 80249" },
    { name: "Hampden Heights", lat: 39.6500, lng: -104.8833, address: "5765 S Jasmine St, Denver, CO 80120" },
    { name: "Harvey Park", lat: 39.6833, lng: -105.0500, address: "2120 S Tennyson St, Denver, CO 80219" },
    { name: "Hiawatha Davis", lat: 39.7500, lng: -104.9500, address: "3334 Holly St, Denver, CO 80207" },
    { name: "Highland", lat: 39.7667, lng: -105.0167, address: "2880 Osceola St, Denver, CO 80212" },
    { name: "La Alma", lat: 39.7333, lng: -105.0000, address: "1325 W 11th Ave, Denver, CO 80204" },
    { name: "La Familia", lat: 39.7667, lng: -104.9667, address: "65 S Elati St, Denver, CO 80223" },
    { name: "Martin Luther King Jr", lat: 39.7500, lng: -104.9333, address: "3880 Newport St, Denver, CO 80207" },
    { name: "Montbello", lat: 39.7833, lng: -104.8333, address: "15555 E 53rd Ave, Denver, CO 80239" },
    { name: "Montclair", lat: 39.7167, lng: -104.9167, address: "729 Ulster Way, Denver, CO 80220" },
    { name: "Paco Sanchez", lat: 39.7167, lng: -105.0333, address: "4701 W 10th Ave, Denver, CO 80204" },
    { name: "Platt Park", lat: 39.6833, lng: -104.9833, address: "1500 S Grant St, Denver, CO 80210" },
    { name: "Rude", lat: 39.7500, lng: -104.9833, address: "2855 W Holden Pl, Denver, CO 80204" },
    { name: "Scheitler", lat: 39.6500, lng: -105.0167, address: "5031 W 46th Ave, Denver, CO 80212" },
    { name: "Sloan's Lake", lat: 39.7500, lng: -105.0333, address: "1700 N Quitman St, Denver, CO 80204" },
    { name: "St. Charles", lat: 39.7500, lng: -104.9500, address: "3777 Lafayette St, Denver, CO 80205" },
    { name: "Stapleton", lat: 39.7667, lng: -104.8833, address: "3815 N Magnolia St, Denver, CO 80207" },
    { name: "Twentieth Street", lat: 39.7500, lng: -104.9833, address: "1011 20th St, Denver, CO 80205" },
    { name: "Virginia Village", lat: 39.6833, lng: -104.9167, address: "2250 S Dahlia St, Denver, CO 80222" },
    { name: "Washington Park", lat: 39.6972, lng: -104.9722, address: "701 S Franklin St, Denver, CO 80209" },
    { name: "Wheat Ridge", lat: 39.7667, lng: -105.0833, address: "4005 Kipling St, Wheat Ridge, CO 80033" },
    { name: "Woodbury", lat: 39.7000, lng: -104.9000, address: "3101 S Grape St, Denver, CO 80222" }
  ];

  /**
   * Calculate distance between two coordinates in miles (Haversine formula)
   */
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Get user's current location via browser geolocation
   */
  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache position for 1 minute
        }
      );
    });
  }

  /**
   * Calculate distances using OSRM Table API
   * @param {number} userLat - User's latitude
   * @param {number} userLng - User's longitude
   * @param {string} profile - 'driving', 'cycling', or 'walking'
   */
  async function calculateDistancesOSRM(userLat, userLng, profile) {
    // OSRM profile names
    const osrmProfile = profile === 'biking' ? 'bike' : profile === 'driving' ? 'car' : 'foot';
    
    // Build coordinates string: user first, then all rec centers
    const coords = [[userLng, userLat], ...REC_CENTERS.map(c => [c.lng, c.lat])];
    const coordsStr = coords.map(c => c.join(',')).join(';');
    
    const url = `${OSRM_BASE_URL}/${osrmProfile}/${coordsStr}?sources=0&annotations=distance,duration`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('OSRM request failed');
      
      const data = await response.json();
      
      if (data.code !== 'Ok') {
        throw new Error('OSRM returned error: ' + data.code);
      }
      
      // Extract distances and durations from user (source 0) to all destinations
      const distances = data.distances[0].slice(1); // Skip first (user to user = 0)
      const durations = data.durations[0].slice(1);
      
      return REC_CENTERS.map((center, i) => ({
        name: center.name,
        address: center.address,
        lat: center.lat,
        lng: center.lng,
        [`${profile}_meters`]: distances[i],
        [`${profile}_miles`]: distances[i] ? (distances[i] / 1609.34).toFixed(1) : null,
        [`${profile}_seconds`]: durations[i],
        [`${profile}_minutes`]: durations[i] ? Math.round(durations[i] / 60) : null,
        [`${profile}_time`]: durations[i] ? formatDuration(durations[i]) : 'N/A'
      }));
    } catch (error) {
      console.error(`OSRM ${profile} calculation failed:`, error);
      return null;
    }
  }

  /**
   * Format seconds into human-readable duration
   */
  function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours} hr ${remainingMins} mins`;
  }

  /**
   * Calculate all distances (driving, biking, walking) for user location
   */
  async function calculateAllDistances(userLat, userLng, onProgress) {
    const results = {
      origin: { lat: userLat, lng: userLng },
      timestamp: Date.now(),
      centers: []
    };
    
    // Initialize centers with basic info
    results.centers = REC_CENTERS.map(c => ({
      name: c.name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      straight_line_miles: haversineDistance(userLat, userLng, c.lat, c.lng).toFixed(1)
    }));
    
    // Calculate for each travel mode
    const modes = ['driving', 'biking', 'walking'];
    
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      if (onProgress) onProgress(`Calculating ${mode} distances...`, (i + 1) / modes.length * 100);
      
      const modeResults = await calculateDistancesOSRM(userLat, userLng, mode);
      
      if (modeResults) {
        // Merge results into centers
        modeResults.forEach((modeData, idx) => {
          Object.keys(modeData).forEach(key => {
            if (key.startsWith(mode)) {
              results.centers[idx][key] = modeData[key];
            }
          });
        });
      }
      
      // Small delay between requests to be nice to OSRM
      if (i < modes.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    return results;
  }

  /**
   * Get cached data if user hasn't moved significantly
   */
  function getCachedData() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      return JSON.parse(cached);
    } catch (e) {
      return null;
    }
  }

  /**
   * Save data to cache
   */
  function setCachedData(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not cache distance data:', e);
    }
  }

  /**
   * Check if user has moved significantly from cached location
   */
  function hasMovedSignificantly(currentLat, currentLng, cachedLat, cachedLng) {
    const distance = haversineDistance(currentLat, currentLng, cachedLat, cachedLng);
    return distance > LOCATION_THRESHOLD_MILES;
  }

  /**
   * Main function: Get distances for current user location
   * Uses cache if user hasn't moved, otherwise recalculates
   */
  async function getDistances(onProgress, forceRefresh = false) {
    // Try to get current position
    let userLocation;
    try {
      if (onProgress) onProgress('Getting your location...', 0);
      userLocation = await getCurrentPosition();
    } catch (error) {
      console.warn('Could not get location:', error.message);
      // Return cached data if available, otherwise null
      const cached = getCachedData();
      if (cached) {
        return { data: cached, source: 'cache', error: 'Location unavailable, using cached data' };
      }
      return { data: null, source: 'none', error: 'Location unavailable and no cached data' };
    }
    
    // Check cache
    const cached = getCachedData();
    
    if (!forceRefresh && cached && cached.origin) {
      const moved = hasMovedSignificantly(
        userLocation.lat, userLocation.lng,
        cached.origin.lat, cached.origin.lng
      );
      
      if (!moved) {
        console.log('Using cached distances (within 0.25 miles of cached location)');
        return { data: cached, source: 'cache', userLocation };
      } else {
        console.log('User moved significantly, recalculating distances');
      }
    }
    
    // Calculate new distances
    if (onProgress) onProgress('Calculating distances to rec centers...', 10);
    
    const newData = await calculateAllDistances(userLocation.lat, userLocation.lng, onProgress);
    
    // Cache the results
    setCachedData(newData);
    
    if (onProgress) onProgress('Done!', 100);
    
    return { data: newData, source: 'calculated', userLocation };
  }

  /**
   * Clear cached data
   */
  function clearCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  /**
   * Get rec center coordinates for a given name
   */
  function getRecCenterCoords(name) {
    const searchName = name.toLowerCase();
    return REC_CENTERS.find(c => 
      c.name.toLowerCase().includes(searchName) || 
      searchName.includes(c.name.toLowerCase())
    );
  }

  // Public API
  return {
    getDistances,
    getCurrentPosition,
    clearCache,
    getCachedData,
    getRecCenterCoords,
    haversineDistance,
    REC_CENTERS
  };
})();

// Export for use in script.js
if (typeof window !== 'undefined') {
  window.GeoService = GeoService;
}

