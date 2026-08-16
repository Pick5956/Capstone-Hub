package media

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func encodePNG(t *testing.T, source image.Image) []byte {
	t.Helper()
	var output bytes.Buffer
	if err := png.Encode(&output, source); err != nil {
		t.Fatalf("encode PNG fixture: %v", err)
	}
	return output.Bytes()
}

func decodePNG(t *testing.T, source []byte) image.Image {
	t.Helper()
	decoded, err := png.Decode(bytes.NewReader(source))
	if err != nil {
		t.Fatalf("decode processed PNG: %v", err)
	}
	return decoded
}

func alphaAt(source image.Image, x, y int) uint8 {
	_, _, _, alpha := source.At(x, y).RGBA()
	return uint8(alpha >> 8)
}

func whiteCanvas(width, height int) *image.NRGBA {
	canvas := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	return canvas
}

func removalOptions(strength int) MenuImageProcessOptions {
	return MenuImageProcessOptions{RemoveBackground: true, Strength: strength}
}

func TestProcessMenuImageUploadDefaultsToNoBackgroundRemoval(t *testing.T) {
	canvas := whiteCanvas(80, 60)
	for y := 12; y < 48; y++ {
		for x := 18; x < 62; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	source := encodePNG(t, canvas)

	result, err := ProcessMenuImageUpload(context.Background(), source, ".png", MenuImageProcessOptions{})
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if result.BackgroundRemoved || result.RemovedRatio != 0 || !bytes.Equal(result.Bytes, source) {
		t.Fatal("omitted removal options should preserve the original image byte-for-byte")
	}
}

func TestProcessMenuImageUploadRemovesOnlyEdgeConnectedUniformBackground(t *testing.T) {
	canvas := whiteCanvas(80, 60)
	for y := 12; y < 48; y++ {
		for x := 18; x < 62; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	for y := 25; y < 35; y++ {
		for x := 35; x < 45; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}

	result, err := ProcessMenuImageUpload(context.Background(), encodePNG(t, canvas), ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if !result.BackgroundRemoved || result.Extension != ".png" {
		t.Fatalf("processed result = %+v, want removed PNG", result)
	}
	processed := decodePNG(t, result.Bytes)
	if got := alphaAt(processed, 0, 0); got != 0 {
		t.Fatalf("background corner alpha = %d, want 0", got)
	}
	if got := alphaAt(processed, 20, 20); got != 255 {
		t.Fatalf("foreground alpha = %d, want 255", got)
	}
	if got := alphaAt(processed, 40, 30); got != 255 {
		t.Fatalf("enclosed white foreground alpha = %d, want 255", got)
	}
}

func TestProcessMenuImageUploadRemovesLightBackgroundWhenCropTouchesTwoEdges(t *testing.T) {
	canvas := whiteCanvas(120, 90)
	for y := 0; y < 90; y++ {
		for x := 15; x < 105; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 165, G: 65, B: 35, A: 255})
		}
	}

	result, err := ProcessMenuImageUpload(context.Background(), encodePNG(t, canvas), ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if !result.BackgroundRemoved {
		t.Fatal("light background should still be removed when a 4:3 cover crop makes the subject touch two edges")
	}
	processed := decodePNG(t, result.Bytes)
	if got := alphaAt(processed, 0, 45); got != 0 {
		t.Fatalf("side background alpha = %d, want 0", got)
	}
	if got := alphaAt(processed, 60, 0); got != 255 {
		t.Fatalf("edge-touching subject alpha = %d, want 255", got)
	}
}

func TestProcessMenuImageUploadFindsWhiteSourceInsideTransparentCropPadding(t *testing.T) {
	canvas := image.NewNRGBA(image.Rect(0, 0, 100, 80))
	for y := 10; y < 70; y++ {
		for x := 15; x < 85; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	for y := 25; y < 55; y++ {
		for x := 32; x < 68; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 45, G: 145, B: 55, A: 255})
		}
	}

	result, err := ProcessMenuImageUpload(context.Background(), encodePNG(t, canvas), ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if !result.BackgroundRemoved {
		t.Fatal("transparent crop padding prevented white source background removal")
	}
	processed := decodePNG(t, result.Bytes)
	if got := alphaAt(processed, 16, 11); got != 0 {
		t.Fatalf("inset source background alpha = %d, want 0", got)
	}
	if got := alphaAt(processed, 50, 40); got != 255 {
		t.Fatalf("inset foreground alpha = %d, want 255", got)
	}
}

func TestProcessMenuImageUploadPreservesColoredSubjectBesideTransparentPadding(t *testing.T) {
	canvas := image.NewNRGBA(image.Rect(0, 0, 100, 80))
	for y := 10; y < 70; y++ {
		for x := 15; x < 85; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 35, G: 145, B: 55, A: 255})
		}
	}
	for y := 25; y < 55; y++ {
		for x := 32; x < 68; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	source := encodePNG(t, canvas)

	result, err := ProcessMenuImageUpload(context.Background(), source, ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if result.BackgroundRemoved || !bytes.Equal(result.Bytes, source) {
		t.Fatal("colored cut-out subject should be preserved byte-for-byte")
	}
}

func TestProcessMenuImageUploadFeathersNearBackgroundPixels(t *testing.T) {
	canvas := whiteCanvas(60, 40)
	for y := 10; y < 30; y++ {
		for x := 15; x < 45; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 35, G: 90, B: 180, A: 255})
		}
	}
	canvas.SetNRGBA(0, 20, color.NRGBA{R: 225, G: 225, B: 225, A: 255})

	result, err := ProcessMenuImageUpload(context.Background(), encodePNG(t, canvas), ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	processed := decodePNG(t, result.Bytes)
	alpha := alphaAt(processed, 0, 20)
	if alpha == 0 || alpha == 255 {
		t.Fatalf("feathered alpha = %d, want partial alpha", alpha)
	}
}

func TestProcessMenuImageUploadPreservesLowConfidenceAndAllBackgroundImages(t *testing.T) {
	complex := whiteCanvas(50, 50)
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			complex.SetNRGBA(x, y, color.NRGBA{R: 255, A: 255})
			complex.SetNRGBA(49-x, y, color.NRGBA{G: 255, A: 255})
			complex.SetNRGBA(x, 49-y, color.NRGBA{B: 255, A: 255})
			complex.SetNRGBA(49-x, 49-y, color.NRGBA{R: 20, G: 20, B: 20, A: 255})
		}
	}
	complexBytes := encodePNG(t, complex)

	complexResult, err := ProcessMenuImageUpload(context.Background(), complexBytes, ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("complex image error = %v", err)
	}
	if complexResult.BackgroundRemoved || !bytes.Equal(complexResult.Bytes, complexBytes) {
		t.Fatal("low-confidence image should be preserved byte-for-byte")
	}

	plainBytes := encodePNG(t, whiteCanvas(40, 40))
	plainResult, err := ProcessMenuImageUpload(context.Background(), plainBytes, ".png", removalOptions(50))
	if err != nil {
		t.Fatalf("plain image error = %v", err)
	}
	if plainResult.BackgroundRemoved || !bytes.Equal(plainResult.Bytes, plainBytes) {
		t.Fatal("all-background image should not become blank")
	}
}

func TestProcessMenuImageUploadConvertsConfidentJPEGToTransparentPNG(t *testing.T) {
	canvas := whiteCanvas(80, 60)
	for y := 15; y < 45; y++ {
		for x := 20; x < 60; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 210, G: 70, B: 35, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 92}); err != nil {
		t.Fatalf("encode JPEG fixture: %v", err)
	}

	result, err := ProcessMenuImageUpload(context.Background(), encoded.Bytes(), ".jpg", removalOptions(50))
	if err != nil {
		t.Fatalf("ProcessMenuImageUpload() error = %v", err)
	}
	if !result.BackgroundRemoved || result.Extension != ".png" {
		t.Fatalf("processed JPEG result = %+v, want removed PNG", result)
	}
	if !bytes.HasPrefix(result.Bytes, []byte{0x89, 'P', 'N', 'G'}) {
		t.Fatal("processed JPEG does not have a PNG signature")
	}
}

func TestProcessMenuImageUploadPassesWebPThroughAndSkipsUnsafeDimensions(t *testing.T) {
	webP := []byte("RIFFfake-WEBP")
	result, err := ProcessMenuImageUpload(context.Background(), webP, ".webp", removalOptions(50))
	if err != nil {
		t.Fatalf("WebP passthrough error = %v", err)
	}
	if result.BackgroundRemoved || result.Extension != ".webp" || !bytes.Equal(result.Bytes, webP) {
		t.Fatalf("WebP passthrough result = %+v", result)
	}
	if shouldProcessMenuImageDimensions(5000, 100) {
		t.Fatal("oversized dimension should not be processed")
	}
	if shouldProcessMenuImageDimensions(2500, 2000) {
		t.Fatal("image above the pixel budget should not be processed")
	}
	if !shouldProcessMenuImageDimensions(1200, 900) {
		t.Fatal("normalized menu image should be processed")
	}
}

func TestProcessMenuImageUploadStrengthControlsFloodTolerance(t *testing.T) {
	canvas := whiteCanvas(100, 80)
	for y := 20; y < 60; y++ {
		for x := 25; x < 30; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 200, G: 200, B: 200, A: 255})
		}
		for x := 30; x < 70; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	source := encodePNG(t, canvas)

	low, err := ProcessMenuImageUpload(context.Background(), source, ".png", removalOptions(0))
	if err != nil {
		t.Fatalf("low strength error = %v", err)
	}
	high, err := ProcessMenuImageUpload(context.Background(), source, ".png", removalOptions(100))
	if err != nil {
		t.Fatalf("high strength error = %v", err)
	}
	if !low.BackgroundRemoved || !high.BackgroundRemoved {
		t.Fatal("both strengths should find the obvious white background")
	}
	lowImage := decodePNG(t, low.Bytes)
	highImage := decodePNG(t, high.Bytes)
	if got := alphaAt(lowImage, 27, 40); got != 255 {
		t.Fatalf("low-strength gray alpha = %d, want 255", got)
	}
	if got := alphaAt(highImage, 27, 40); got >= 255 {
		t.Fatalf("high-strength gray alpha = %d, want partially removed", got)
	}
	if high.RemovedRatio <= low.RemovedRatio {
		t.Fatalf("removed ratios high=%f low=%f, want high > low", high.RemovedRatio, low.RemovedRatio)
	}
}

func TestPreviewMenuImageUploadUsesFinalCutAndDrawsOutlineOnlyOutside(t *testing.T) {
	canvas := whiteCanvas(80, 60)
	for y := 12; y < 48; y++ {
		for x := 18; x < 62; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	source := encodePNG(t, canvas)

	preview, err := PreviewMenuImageUpload(context.Background(), source, ".png", 50, 5*1024*1024)
	if err != nil {
		t.Fatalf("PreviewMenuImageUpload() error = %v", err)
	}
	if !preview.Result.BackgroundRemoved || len(preview.PreviewPNG) == 0 || preview.Strength != 50 {
		t.Fatalf("preview result = %+v", preview)
	}
	finalImage := decodePNG(t, preview.Result.Bytes)
	previewImage := decodePNG(t, preview.PreviewPNG)
	if finalImage.At(20, 20) != previewImage.At(20, 20) {
		t.Fatal("preview changed an opaque foreground pixel")
	}
	if got := alphaAt(previewImage, 0, 0); got != 0 {
		t.Fatalf("far transparent preview alpha = %d, want 0", got)
	}
	red, green, blue, alpha := previewImage.At(17, 30).RGBA()
	if uint8(red>>8) != 234 || uint8(green>>8) != 88 || uint8(blue>>8) != 12 || uint8(alpha>>8) != 255 {
		t.Fatalf("outline pixel = rgba(%d,%d,%d,%d), want orange", red>>8, green>>8, blue>>8, alpha>>8)
	}
	if len(preview.PreviewPNG) <= len(preview.Result.Bytes) {
		t.Fatalf("fixture preview bytes = %d, want larger than final %d for cap regression", len(preview.PreviewPNG), len(preview.Result.Bytes))
	}
	capped, err := PreviewMenuImageUpload(
		context.Background(),
		source,
		".png",
		50,
		int64(len(preview.Result.Bytes)),
	)
	if err != nil {
		t.Fatalf("capped PreviewMenuImageUpload() error = %v", err)
	}
	if !capped.Result.BackgroundRemoved || len(capped.PreviewPNG) != 0 {
		t.Fatalf("capped preview = %+v, want final result without oversized preview payload", capped)
	}
}
