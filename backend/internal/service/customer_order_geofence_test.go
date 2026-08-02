package service

import (
	"math"
	"testing"

	"Project-M/internal/entity"
)

func floatPtr(v float64) *float64 { return &v }

// Bangkok reference point used across the cases below.
const (
	shopLat = 13.736717
	shopLon = 100.523186
)

func TestHaversineMeters(t *testing.T) {
	// Same point is zero distance.
	if d := haversineMeters(shopLat, shopLon, shopLat, shopLon); d > 0.001 {
		t.Fatalf("expected ~0 m for identical points, got %.3f", d)
	}

	// ~0.001 degree of latitude is ~111 m.
	d := haversineMeters(shopLat, shopLon, shopLat+0.001, shopLon)
	if math.Abs(d-111) > 3 {
		t.Fatalf("expected ~111 m, got %.2f", d)
	}
}

func TestEvaluateGeofence(t *testing.T) {
	enabled := &entity.Restaurant{
		Latitude:          floatPtr(shopLat),
		Longitude:         floatPtr(shopLon),
		OrderRadiusMeters: 150,
	}

	cases := []struct {
		name       string
		restaurant *entity.Restaurant
		req        *SubmitCustomerOrderRequest
		want       geofenceOutcome
	}{
		{
			name:       "radius zero disables the check",
			restaurant: &entity.Restaurant{Latitude: floatPtr(shopLat), Longitude: floatPtr(shopLon), OrderRadiusMeters: 0},
			req:        &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat), Longitude: floatPtr(shopLon)},
			want:       geofenceDisabled,
		},
		{
			name:       "missing restaurant coordinates disables the check",
			restaurant: &entity.Restaurant{OrderRadiusMeters: 150},
			req:        &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat), Longitude: floatPtr(shopLon)},
			want:       geofenceDisabled,
		},
		{
			name:       "customer declined location is unverified, not rejected",
			restaurant: enabled,
			req:        &SubmitCustomerOrderRequest{},
			want:       geofenceUnverified,
		},
		{
			name:       "very poor accuracy is unverified, not rejected",
			restaurant: enabled,
			req:        &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat), Longitude: floatPtr(shopLon), Accuracy: floatPtr(5000)},
			want:       geofenceUnverified,
		},
		{
			name:       "at the table is inside",
			restaurant: enabled,
			req:        &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat), Longitude: floatPtr(shopLon), Accuracy: floatPtr(12)},
			want:       geofenceInside,
		},
		{
			name:       "just beyond radius but within accuracy margin is inside",
			restaurant: enabled,
			// ~222 m away, radius 150 m, accuracy 100 m -> 222 <= 250
			req:  &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat + 0.002), Longitude: floatPtr(shopLon), Accuracy: floatPtr(100)},
			want: geofenceInside,
		},
		{
			name:       "ordering from far away is outside",
			restaurant: enabled,
			// ~5.5 km away
			req:  &SubmitCustomerOrderRequest{Latitude: floatPtr(shopLat + 0.05), Longitude: floatPtr(shopLon), Accuracy: floatPtr(20)},
			want: geofenceOutside,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := evaluateGeofence(tc.restaurant, tc.req); got != tc.want {
				t.Fatalf("evaluateGeofence = %d, want %d", got, tc.want)
			}
		})
	}
}
