package service

import (
	"encoding/base64"
	"strings"
	"testing"
)

// Minimal real file headers — enough for http.DetectContentType to classify them.
var (
	jpegBytes = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 600)...)
	pngBytes  = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 600)...)
	pdfBytes  = append([]byte("%PDF-1.7\n"), make([]byte, 600)...)
)

func encode(raw []byte) string { return base64.StdEncoding.EncodeToString(raw) }

func TestValidateReceiptImageAcceptsSupportedTypes(t *testing.T) {
	cases := []struct {
		name     string
		raw      []byte
		claimed  string
		expected string
	}{
		{"jpeg", jpegBytes, "image/jpeg", "image/jpeg"},
		{"png", pngBytes, "image/png", "image/png"},
		{"empty mime falls back to jpeg", jpegBytes, "", "image/jpeg"},
		{"mime with charset parameter", jpegBytes, "image/jpeg; charset=binary", "image/jpeg"},
		{"uppercase mime", jpegBytes, "IMAGE/JPEG", "image/jpeg"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := validateReceiptImage(encode(tc.raw), tc.claimed)
			if err != nil {
				t.Fatalf("expected the image to be accepted, got error: %v", err)
			}
			if got != tc.expected {
				t.Fatalf("expected mime %q, got %q", tc.expected, got)
			}
		})
	}
}

func TestValidateReceiptImageAcceptsDataURL(t *testing.T) {
	got, err := validateReceiptImage("data:image/png;base64,"+encode(pngBytes), "image/png")
	if err != nil {
		t.Fatalf("expected a data URL to be accepted, got error: %v", err)
	}
	if got != "image/png" {
		t.Fatalf("expected mime image/png, got %q", got)
	}
}

// The declared mime type is attacker-controlled, so the sniffed bytes must win.
func TestValidateReceiptImageRejectsNonImageDisguisedAsImage(t *testing.T) {
	_, err := validateReceiptImage(encode(pdfBytes), "image/jpeg")
	if err == nil {
		t.Fatal("expected a PDF labelled image/jpeg to be rejected")
	}
	if !strings.Contains(err.Error(), "not a JPEG, PNG or WebP") {
		t.Fatalf("expected a sniffing error, got: %v", err)
	}
}

func TestValidateReceiptImageRejectsUnsupportedDeclaredType(t *testing.T) {
	_, err := validateReceiptImage(encode(pdfBytes), "application/pdf")
	if err == nil {
		t.Fatal("expected an unsupported declared mime type to be rejected")
	}
	if !strings.Contains(err.Error(), "unsupported image type") {
		t.Fatalf("expected an unsupported-type error, got: %v", err)
	}
}

func TestValidateReceiptImageRejectsOversizedImage(t *testing.T) {
	oversized := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, maxReceiptImageBytes+1)...)
	_, err := validateReceiptImage(encode(oversized), "image/jpeg")
	if err == nil {
		t.Fatal("expected an oversized image to be rejected")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Fatalf("expected a size error, got: %v", err)
	}
}

func TestValidateReceiptImageRejectsEmptyAndMalformed(t *testing.T) {
	if _, err := validateReceiptImage("   ", "image/jpeg"); err == nil {
		t.Fatal("expected an empty image to be rejected")
	}
	if _, err := validateReceiptImage("not-base64!!", "image/jpeg"); err == nil {
		t.Fatal("expected malformed base64 to be rejected")
	}
}
