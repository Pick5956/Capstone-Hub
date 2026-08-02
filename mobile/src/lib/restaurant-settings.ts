export function parseGeofenceSettings(
  enabled: boolean,
  latitudeInput: string,
  longitudeInput: string,
  radiusInput: string,
) {
  if (!enabled) {
    return {
      value: {
        latitude: null,
        longitude: null,
        order_radius_meters: 0,
      },
      error: null,
    };
  }

  const latitude = Number.parseFloat(latitudeInput);
  const longitude = Number.parseFloat(longitudeInput);
  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return { value: null, error: 'coordinates' as const };
  }

  const radius = Number.parseInt(radiusInput, 10);
  if (!Number.isFinite(radius) || radius < 20 || radius > 5000) {
    return { value: null, error: 'radius' as const };
  }

  return {
    value: {
      latitude,
      longitude,
      order_radius_meters: radius,
    },
    error: null,
  };
}
