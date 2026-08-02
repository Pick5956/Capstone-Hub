package controller

import (
	"errors"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const maxImageUploadBytes int64 = 5 * 1024 * 1024
const maxTenantImageFiles = 500
const maxTenantImageBytes int64 = 1024 * 1024 * 1024

var allowedImageContentTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

func validateImageUpload(file *multipart.FileHeader) (string, error) {
	if file == nil {
		return "", errors.New("image file is required")
	}
	if file.Size <= 0 {
		return "", errors.New("image file is empty")
	}
	if file.Size > maxImageUploadBytes {
		return "", errors.New("image file must be 5MB or smaller")
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		return "", errors.New("image must be jpg, png, or webp")
	}

	opened, err := file.Open()
	if err != nil {
		return "", errors.New("failed to read image")
	}
	defer opened.Close()

	buffer := make([]byte, 512)
	n, err := opened.Read(buffer)
	if err != nil && n == 0 {
		return "", errors.New("failed to read image")
	}
	contentType := http.DetectContentType(buffer[:n])
	if !allowedImageContentTypes[contentType] {
		return "", errors.New("uploaded file content is not a supported image")
	}
	if !imageContentTypeMatchesExtension(ext, contentType) {
		return "", errors.New("image extension does not match file content")
	}

	return ext, nil
}

func imageContentTypeMatchesExtension(extension, contentType string) bool {
	switch strings.ToLower(extension) {
	case ".jpg", ".jpeg":
		return contentType == "image/jpeg"
	case ".png":
		return contentType == "image/png"
	case ".webp":
		return contentType == "image/webp"
	default:
		return false
	}
}

func ensureUploadQuota(directory string, incomingBytes int64, maxFiles int, maxBytes int64) error {
	entries, err := os.ReadDir(directory)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return errors.New("failed to inspect upload quota")
	}

	fileCount := 0
	var totalBytes int64
	for _, entry := range entries {
		if !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return errors.New("failed to inspect upload quota")
		}
		fileCount++
		totalBytes += info.Size()
	}
	if fileCount >= maxFiles || totalBytes+incomingBytes > maxBytes {
		return errors.New("upload quota has been reached")
	}
	return nil
}

func removeSavedUpload(destination string) {
	if destination == "" {
		return
	}
	if err := os.Remove(destination); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("upload_cleanup_failed error_type=%T", err)
	}
}

func removeReplacedUpload(previousURL, expectedPublicPrefix, currentDestination string) {
	parsed, err := url.Parse(strings.TrimSpace(previousURL))
	if err != nil || expectedPublicPrefix == "" || currentDestination == "" {
		return
	}
	if !strings.HasSuffix(expectedPublicPrefix, "/") {
		expectedPublicPrefix += "/"
	}
	if !strings.HasPrefix(parsed.Path, expectedPublicPrefix) {
		return
	}

	filename := strings.TrimPrefix(parsed.Path, expectedPublicPrefix)
	if filename == "" || strings.ContainsAny(filename, `/\`) || filepath.Base(filename) != filename {
		return
	}
	extension := strings.ToLower(filepath.Ext(filename))
	if extension != ".jpg" && extension != ".jpeg" && extension != ".png" && extension != ".webp" {
		return
	}

	previousDestination := filepath.Join(filepath.Dir(currentDestination), filename)
	if filepath.Clean(previousDestination) == filepath.Clean(currentDestination) {
		return
	}
	removeSavedUpload(previousDestination)
}
