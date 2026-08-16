package controller

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"Project-M/internal/media"
)

func TestImageContentTypeMatchesExtension(t *testing.T) {
	tests := []struct {
		extension   string
		contentType string
		want        bool
	}{
		{extension: ".jpg", contentType: "image/jpeg", want: true},
		{extension: ".jpeg", contentType: "image/jpeg", want: true},
		{extension: ".png", contentType: "image/png", want: true},
		{extension: ".webp", contentType: "image/webp", want: true},
		{extension: ".jpg", contentType: "image/png", want: false},
		{extension: ".png", contentType: "image/jpeg", want: false},
	}

	for _, test := range tests {
		if got := imageContentTypeMatchesExtension(test.extension, test.contentType); got != test.want {
			t.Fatalf("imageContentTypeMatchesExtension(%q, %q) = %v, want %v", test.extension, test.contentType, got, test.want)
		}
	}
}

func TestEnsureUploadQuota(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "one.jpg"), make([]byte, 10), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	if err := ensureUploadQuota(directory, 5, 2, 20); err != nil {
		t.Fatalf("ensureUploadQuota() valid upload error = %v", err)
	}
	if err := ensureUploadQuota(directory, 11, 2, 20); err == nil {
		t.Fatal("ensureUploadQuota() should reject total bytes over quota")
	}
	if err := os.WriteFile(filepath.Join(directory, "two.jpg"), []byte{1}, 0o600); err != nil {
		t.Fatalf("write second fixture: %v", err)
	}
	if err := ensureUploadQuota(directory, 1, 2, 20); err == nil {
		t.Fatal("ensureUploadQuota() should reject file count at quota")
	}
}

func TestRemoveReplacedUploadOnlyRemovesExpectedTenantFile(t *testing.T) {
	directory := t.TempDir()
	previous := filepath.Join(directory, "previous.jpg")
	current := filepath.Join(directory, "current.jpg")
	outside := filepath.Join(t.TempDir(), "outside.jpg")
	for _, path := range []string{previous, current, outside} {
		if err := os.WriteFile(path, []byte("image"), 0o600); err != nil {
			t.Fatalf("write fixture %s: %v", filepath.Base(path), err)
		}
	}

	removeReplacedUpload(
		"https://api.example.test/uploads/users/7/previous.jpg",
		"/uploads/users/7/",
		current,
	)
	if _, err := os.Stat(previous); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("previous tenant upload still exists or stat failed: %v", err)
	}
	if _, err := os.Stat(current); err != nil {
		t.Fatalf("current upload was removed: %v", err)
	}

	removeReplacedUpload(
		"https://api.example.test/uploads/users/8/outside.jpg",
		"/uploads/users/7/",
		current,
	)
	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("upload outside expected tenant path was removed: %v", err)
	}
}

func TestSelectMenuImageForStorageUsesOriginalUnlessRemovalWasRequested(t *testing.T) {
	source := []byte("valid-original-image")
	processed := media.MenuImageResult{
		Bytes:             []byte("small-transparent-png"),
		Extension:         ".png",
		BackgroundRemoved: true,
	}

	contents, extension, backgroundRemoved, err := selectMenuImageForStorage(source, ".jpg", processed, false)
	if err != nil {
		t.Fatalf("default selection error = %v", err)
	}
	if !bytes.Equal(contents, source) || extension != ".jpg" || backgroundRemoved {
		t.Fatalf("default stored image = (%d bytes, %q, removed=%v), want original", len(contents), extension, backgroundRemoved)
	}

	contents, extension, backgroundRemoved, err = selectMenuImageForStorage(source, ".jpg", processed, true)
	if err != nil {
		t.Fatalf("opt-in selection error = %v", err)
	}
	if !bytes.Equal(contents, processed.Bytes) || extension != ".png" || !backgroundRemoved {
		t.Fatalf("stored image = (%d bytes, %q, removed=%v), want processed PNG with removed=true", len(contents), extension, backgroundRemoved)
	}
}

func TestSelectMenuImageForStorageRejectsFailedOptInWithoutFallback(t *testing.T) {
	source := []byte("valid-original-image")

	_, _, _, err := selectMenuImageForStorage(source, ".jpg", media.MenuImageResult{}, true)
	if !errors.Is(err, errBackgroundNotDetected) {
		t.Fatalf("missing-background error = %v, want errBackgroundNotDetected", err)
	}

	processed := media.MenuImageResult{
		Bytes:             make([]byte, maxImageUploadBytes+1),
		Extension:         ".png",
		BackgroundRemoved: true,
	}
	_, _, _, err = selectMenuImageForStorage(source, ".jpg", processed, true)
	if !errors.Is(err, errProcessedImageTooLarge) {
		t.Fatalf("oversized processed error = %v, want errProcessedImageTooLarge", err)
	}
}

func TestParseMenuBackgroundOptions(t *testing.T) {
	for _, test := range []struct {
		name         string
		removeRaw    string
		strengthRaw  string
		wantRemove   bool
		wantStrength int
		wantError    bool
	}{
		{name: "omitted defaults to no removal", wantRemove: false, wantStrength: 0},
		{name: "explicit false", removeRaw: "false", wantRemove: false, wantStrength: 0},
		{name: "explicit false keeps valid supplied strength", removeRaw: "false", strengthRaw: "75", wantRemove: false, wantStrength: 75},
		{name: "opt in gets default strength", removeRaw: "true", wantRemove: true, wantStrength: 50},
		{name: "minimum strength", removeRaw: "true", strengthRaw: "0", wantRemove: true, wantStrength: 0},
		{name: "maximum strength", removeRaw: "true", strengthRaw: "100", wantRemove: true, wantStrength: 100},
		{name: "invalid boolean", removeRaw: "yes", wantError: true},
		{name: "invalid strength is rejected even when removal is false", removeRaw: "false", strengthRaw: "101", wantError: true},
		{name: "negative strength", removeRaw: "true", strengthRaw: "-1", wantError: true},
		{name: "excessive strength", removeRaw: "true", strengthRaw: "101", wantError: true},
		{name: "non numeric strength", removeRaw: "true", strengthRaw: "strong", wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			remove, strength, err := parseMenuBackgroundOptions(test.removeRaw, test.strengthRaw)
			if (err != nil) != test.wantError {
				t.Fatalf("parse error = %v, wantError=%v", err, test.wantError)
			}
			if remove != test.wantRemove || strength != test.wantStrength {
				t.Fatalf("parsed = (%v, %d), want (%v, %d)", remove, strength, test.wantRemove, test.wantStrength)
			}
		})
	}
}

func TestSaveMenuImageUploadCommitsWithoutLeavingTemporaryFile(t *testing.T) {
	directory := t.TempDir()
	destination := filepath.Join(directory, "menu.png")
	contents := []byte("transparent-png")

	if err := saveMenuImageUpload(directory, destination, contents); err != nil {
		t.Fatalf("saveMenuImageUpload() error = %v", err)
	}
	stored, err := os.ReadFile(destination)
	if err != nil {
		t.Fatalf("read committed menu image: %v", err)
	}
	if !bytes.Equal(stored, contents) {
		t.Fatalf("stored contents = %q, want %q", stored, contents)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatalf("read upload directory: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "menu.png" {
		t.Fatalf("upload directory entries = %v, want only committed menu.png", entries)
	}
}
