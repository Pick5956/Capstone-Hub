import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGeofenceSettings } from './restaurant-settings.ts';

test('disabling the QR-order geofence clears the complete setting', () => {
  assert.deepEqual(parseGeofenceSettings(false, '', '', ''), {
    value: {
      latitude: null,
      longitude: null,
      order_radius_meters: 0,
    },
    error: null,
  });
});

test('valid geofence values are normalized for the restaurant API', () => {
  assert.deepEqual(parseGeofenceSettings(true, '13.736717', '100.523186', '150'), {
    value: {
      latitude: 13.736717,
      longitude: 100.523186,
      order_radius_meters: 150,
    },
    error: null,
  });
});

test('rejects invalid coordinates and unsupported radii', () => {
  assert.equal(parseGeofenceSettings(true, '91', '100', '150').error, 'coordinates');
  assert.equal(parseGeofenceSettings(true, '13', '181', '150').error, 'coordinates');
  assert.equal(parseGeofenceSettings(true, '13', '100', '19').error, 'radius');
  assert.equal(parseGeofenceSettings(true, '13', '100', '5001').error, 'radius');
});
