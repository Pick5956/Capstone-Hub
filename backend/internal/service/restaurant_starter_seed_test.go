package service

import "testing"

func TestStarterProfileForRestaurantTypes(t *testing.T) {
	types := []string{"ร้านอาหาร", "คาเฟ่", "ชาบู/ปิ้งย่าง", "เดลิเวอรี", "ฟู้ดทรัค"}
	for _, restaurantType := range types {
		t.Run(restaurantType, func(t *testing.T) {
			profile := starterProfileFor(restaurantType)
			if len(profile.TableZones) == 0 {
				t.Fatalf("starter profile has no table zones")
			}
			if len(profile.Categories) == 0 {
				t.Fatalf("starter profile has no menu categories")
			}
			itemCount := 0
			for _, category := range profile.Categories {
				if len(category.Items) == 0 {
					t.Fatalf("category %q has no menu items", category.Name)
				}
				itemCount += len(category.Items)
			}
			if itemCount < 6 {
				t.Fatalf("starter profile has %d menu items, want at least 6", itemCount)
			}
		})
	}
}

func TestStarterZoneCountsSumToTableCount(t *testing.T) {
	tests := []struct {
		name       string
		tableCount int
		zoneCount  int
	}{
		{name: "single zone", tableCount: 4, zoneCount: 1},
		{name: "even split", tableCount: 12, zoneCount: 3},
		{name: "remainder split", tableCount: 14, zoneCount: 3},
		{name: "fewer tables than zones", tableCount: 2, zoneCount: 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			counts := starterZoneCounts(tt.tableCount, tt.zoneCount)
			if len(counts) != tt.zoneCount {
				t.Fatalf("got %d zone counts, want %d", len(counts), tt.zoneCount)
			}
			total := 0
			for _, count := range counts {
				total += count
			}
			if total != tt.tableCount {
				t.Fatalf("zone counts sum to %d, want %d", total, tt.tableCount)
			}
		})
	}
}
