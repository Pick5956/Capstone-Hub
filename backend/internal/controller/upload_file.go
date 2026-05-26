package controller

import (
	"errors"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
)

const maxImageUploadBytes int64 = 5 * 1024 * 1024

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

	return ext, nil
}
