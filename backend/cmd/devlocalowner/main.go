// Command devlocalowner adds a password (email/password) owner login to an
// existing restaurant, for testing from a device where Google sign-in cannot be
// used — a phone reaching the dev server over a Tailscale IP, which Google's
// OAuth rules reject as an origin.
//
// It does NOT touch the Google account that already owns the restaurant. It adds
// a second, "local" user with the email and password YOU pass on the command
// line, and makes that user an owner of the restaurant too. Both logins then
// work against the same local database and the same restaurant data.
//
// The password is never stored in this file or defaulted — you supply it at run
// time, and it is stored only as a bcrypt hash, exactly as registration does.
//
// Usage (from backend/):
//
//	go run ./cmd/devlocalowner -email you@example.com -password 'your-password' -restaurant 1
//
// Re-running with the same email resets that local account's password, so it is
// safe to run again if you forget it. Development only.
package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"Project-M/config"
	"Project-M/internal/auth"
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

func main() {
	email := flag.String("email", "", "email for the password login (required)")
	password := flag.String("password", "", "password, 8–72 characters (required)")
	restaurantID := flag.Uint("restaurant", 1, "restaurant to become an owner of")
	first := flag.String("first", "Test", "first name for the account")
	last := flag.String("last", "Owner", "last name for the account")
	flag.Parse()

	cleanEmail := strings.TrimSpace(strings.ToLower(*email))
	if cleanEmail == "" || strings.TrimSpace(*password) == "" {
		log.Fatal("both -email and -password are required (see the comment at the top of this file)")
	}
	if n := len([]byte(*password)); n < 8 || n > 72 {
		log.Fatalf("password must be 8–72 bytes (got %d)", n)
	}

	if err := config.LoadRuntimeEnvironment(); err != nil {
		log.Fatalf("load environment: %v", err)
	}
	if err := config.ConnectionDB(); err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer config.CloseDatabase()
	db := config.DB()

	// The restaurant has to exist, or "owner of restaurant N" means nothing.
	var restaurant entity.Restaurant
	if err := db.First(&restaurant, *restaurantID).Error; err != nil {
		log.Fatalf("restaurant %d not found: %v", *restaurantID, err)
	}

	// The owner role is a system role; look it up by name rather than assuming an
	// id, so this keeps working if the seed order ever changes.
	var ownerRole entity.Role
	if err := db.Where("name = ?", "owner").First(&ownerRole).Error; err != nil {
		log.Fatalf("owner role not found: %v", err)
	}

	hashed, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	// A "local" user is a different row from the Google one with the same email —
	// the unique index is on (email, auth_provider), so the two coexist. Find the
	// local one if a previous run made it; otherwise create it.
	var user entity.User
	err = db.Where("email = ? AND auth_provider = ?", cleanEmail, "local").First(&user).Error
	switch {
	case err == nil:
		user.Password = hashed
		user.Status = "active"
		if err := db.Model(&user).Updates(map[string]any{"password": hashed, "status": "active"}).Error; err != nil {
			log.Fatalf("update existing local user: %v", err)
		}
		fmt.Printf("reset password for existing local user %s (id %d)\n", cleanEmail, user.ID)
	case errors.Is(err, gorm.ErrRecordNotFound):
		user = entity.User{
			Email:        cleanEmail,
			Password:     hashed,
			AuthProvider: "local",
			FirstName:    strings.TrimSpace(*first),
			LastName:     strings.TrimSpace(*last),
			Status:       "active",
			TokenVersion: 1,
		}
		if err := db.Create(&user).Error; err != nil {
			log.Fatalf("create local user: %v", err)
		}
		fmt.Printf("created local user %s (id %d)\n", cleanEmail, user.ID)
	default:
		log.Fatalf("look up local user: %v", err)
	}

	// One membership per (user, restaurant). Make it, or make sure the one that is
	// there is an active owner.
	var member entity.RestaurantMember
	err = db.Where("user_id = ? AND restaurant_id = ?", user.ID, restaurant.ID).First(&member).Error
	switch {
	case err == nil:
		if err := db.Model(&member).Updates(map[string]any{
			"role_id": ownerRole.ID, "status": "active",
		}).Error; err != nil {
			log.Fatalf("update membership: %v", err)
		}
		fmt.Printf("ensured %s is an active owner of %q\n", cleanEmail, restaurant.Name)
	case errors.Is(err, gorm.ErrRecordNotFound):
		joinedAt := time.Now()
		member = entity.RestaurantMember{
			UserID:       user.ID,
			RestaurantID: restaurant.ID,
			RoleID:       ownerRole.ID,
			Status:       "active",
			JoinedAt:     joinedAt,
		}
		if err := db.Create(&member).Error; err != nil {
			log.Fatalf("create membership: %v", err)
		}
		fmt.Printf("made %s an owner of %q\n", cleanEmail, restaurant.Name)
	default:
		log.Fatalf("look up membership: %v", err)
	}

	fmt.Printf("\nDone. Log in from the phone with email %s and the password you just set.\n", cleanEmail)
}
