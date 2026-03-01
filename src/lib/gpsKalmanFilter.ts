/**
 * GPS Kalman Filter — smooths noisy GPS readings to produce stable positions.
 * 
 * This is the same technique used by Uber, Google Maps, and Waze.
 * It predicts the next position based on speed/direction and corrects
 * with new GPS measurements, weighted by their accuracy.
 * 
 * The result: smooth, stable position updates without sudden jumps.
 */

const DEG_TO_M = 111_139; // approximate meters per degree of latitude

export interface KalmanState {
  lat: number;
  lng: number;
  variance: number; // uncertainty in meters²
  timestamp: number;
}

export class GPSKalmanFilter {
  private state: KalmanState | null = null;
  
  // Process noise: how much the position can change per second (m²/s)
  // Higher = more responsive but less smooth
  // Lower = smoother but slower to react to real movement
  private readonly processNoise: number;

  /**
   * @param processNoise How quickly uncertainty grows (m²/s). 
   *   - Walking: ~1
   *   - Driving city: ~3  
   *   - Highway: ~6
   */
  constructor(processNoise = 3) {
    this.processNoise = processNoise;
  }

  /**
   * Process a new GPS reading and return the filtered (smoothed) position.
   * 
   * @param lat Raw GPS latitude
   * @param lng Raw GPS longitude  
   * @param accuracy GPS reported accuracy in meters
   * @param timestamp Time of reading in milliseconds
   * @returns Filtered position
   */
  process(lat: number, lng: number, accuracy: number, timestamp: number): { lat: number; lng: number } {
    // Minimum accuracy floor — don't trust GPS claiming < 3m accuracy
    const effectiveAccuracy = Math.max(accuracy, 3);
    const measurementVariance = effectiveAccuracy * effectiveAccuracy;
    
    if (!this.state) {
      // First reading — initialize state
      this.state = {
        lat,
        lng,
        variance: measurementVariance,
        timestamp,
      };
      return { lat, lng };
    }

    // Time elapsed since last update (seconds)
    const dt = Math.max((timestamp - this.state.timestamp) / 1000, 0.1);
    
    // If too much time has passed (>60s), reset the filter
    if (dt > 60) {
      this.state = {
        lat,
        lng,
        variance: measurementVariance,
        timestamp,
      };
      return { lat, lng };
    }

    // === PREDICT phase ===
    // Position prediction stays the same (we don't model velocity)
    // But uncertainty grows over time
    const predictedVariance = this.state.variance + this.processNoise * dt;
    
    // === UPDATE phase ===
    // Kalman gain: how much to trust the new measurement vs prediction
    // K = predicted_variance / (predicted_variance + measurement_variance)
    // K close to 1 = trust measurement more (poor prediction or good measurement)
    // K close to 0 = trust prediction more (good prediction or poor measurement)
    const K = predictedVariance / (predictedVariance + measurementVariance);
    
    // Update position: blend prediction with measurement
    const newLat = this.state.lat + K * (lat - this.state.lat);
    const newLng = this.state.lng + K * (lng - this.state.lng);
    
    // Update uncertainty
    const newVariance = (1 - K) * predictedVariance;
    
    this.state = {
      lat: newLat,
      lng: newLng,
      variance: newVariance,
      timestamp,
    };

    return { lat: newLat, lng: newLng };
  }

  /**
   * Get the current estimated accuracy in meters
   */
  getAccuracy(): number {
    return this.state ? Math.sqrt(this.state.variance) : Infinity;
  }

  /**
   * Reset the filter state
   */
  reset(): void {
    this.state = null;
  }

  /**
   * Check if the filter has been initialized
   */
  isInitialized(): boolean {
    return this.state !== null;
  }
}
