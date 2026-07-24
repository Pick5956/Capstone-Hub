package controller

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
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
