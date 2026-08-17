package media

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	_ "image/jpeg"
	"image/png"
	"strings"
)

const (
	maxMenuImageDimension        = 4096
	maxMenuImageProcessingPixel  = 4_000_000
	transparentAlphaThreshold    = 16
	opaqueAlphaThreshold         = 240
	cornerColorTolerance         = 24
	minimumBorderMatchRatio      = 0.60
	minimumLightBorderMatchRatio = 0.50
	minimumBoundaryClusterRatio  = 0.65
	minimumRemovedRatio          = 0.03
	maximumRemovedRatio          = 0.90
	previewOutlineRadius         = 2
)

// MenuImageResult is either the original upload or a transparent PNG produced
// when a simple, edge-connected background can be identified confidently.
type MenuImageResult struct {
	Bytes             []byte
	Extension         string
	BackgroundRemoved bool
	RemovedRatio      float64
}

type MenuImageProcessOptions struct {
	RemoveBackground bool
	Strength         int
}

type MenuImagePreview struct {
	Result     MenuImageResult
	PreviewPNG []byte
	Strength   int
}

type rgbColor struct {
	r uint8
	g uint8
	b uint8
}

type backgroundTolerance struct {
	inner int
	outer int
}

var menuImageProcessingSlots = make(chan struct{}, 2)

// ProcessMenuImageUpload removes a flat or near-flat background only when it
// is connected to the outside of the image. This is deliberately conservative:
// ambiguous images are returned byte-for-byte so food details are never erased
// merely because they resemble the estimated background color.
func ProcessMenuImageUpload(ctx context.Context, source []byte, extension string, options MenuImageProcessOptions) (MenuImageResult, error) {
	extension = strings.ToLower(strings.TrimSpace(extension))
	result := MenuImageResult{Bytes: source, Extension: extension}
	if err := ctx.Err(); err != nil {
		return MenuImageResult{}, err
	}
	if !options.RemoveBackground {
		return result, nil
	}
	if options.Strength < 0 || options.Strength > 100 {
		return MenuImageResult{}, errors.New("background strength must be between 0 and 100")
	}
	if extension == ".webp" {
		return result, nil
	}
	if extension != ".png" && extension != ".jpg" && extension != ".jpeg" {
		return MenuImageResult{}, errors.New("unsupported menu image format")
	}

	config, format, err := image.DecodeConfig(bytes.NewReader(source))
	if err != nil {
		return MenuImageResult{}, errors.New("failed to decode menu image")
	}
	if !menuImageFormatMatchesExtension(format, extension) {
		return MenuImageResult{}, errors.New("menu image extension does not match decoded content")
	}
	if !shouldProcessMenuImageDimensions(config.Width, config.Height) {
		return result, nil
	}
	releaseSlot, err := acquireMenuImageProcessingSlot(ctx)
	if err != nil {
		return MenuImageResult{}, err
	}
	defer releaseSlot()

	decoded, decodedFormat, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return MenuImageResult{}, errors.New("failed to decode menu image")
	}
	if !menuImageFormatMatchesExtension(decodedFormat, extension) {
		return MenuImageResult{}, errors.New("menu image extension does not match decoded content")
	}

	processed, removed, removedRatio, err := removeEdgeConnectedBackground(ctx, decoded, toleranceForStrength(options.Strength))
	if err != nil {
		return MenuImageResult{}, err
	}
	if !removed {
		return result, nil
	}

	var encoded bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&encoded, processed); err != nil {
		return MenuImageResult{}, errors.New("failed to encode processed menu image")
	}
	return MenuImageResult{
		Bytes:             encoded.Bytes(),
		Extension:         ".png",
		BackgroundRemoved: true,
		RemovedRatio:      removedRatio,
	}, nil
}

func PreviewMenuImageUpload(ctx context.Context, source []byte, extension string, strength int, maxOutputBytes int64) (MenuImagePreview, error) {
	result, err := ProcessMenuImageUpload(ctx, source, extension, MenuImageProcessOptions{
		RemoveBackground: true,
		Strength:         strength,
	})
	preview := MenuImagePreview{Result: result, Strength: strength}
	if err != nil || !result.BackgroundRemoved || (maxOutputBytes > 0 && int64(len(result.Bytes)) > maxOutputBytes) {
		return preview, err
	}

	releaseSlot, err := acquireMenuImageProcessingSlot(ctx)
	if err != nil {
		return MenuImagePreview{}, err
	}
	defer releaseSlot()
	decoded, err := png.Decode(bytes.NewReader(result.Bytes))
	if err != nil {
		return MenuImagePreview{}, errors.New("failed to decode processed menu image preview")
	}
	outlined, err := addTransparentSideOutline(ctx, decoded)
	if err != nil {
		return MenuImagePreview{}, err
	}
	var encoded bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&encoded, outlined); err != nil {
		return MenuImagePreview{}, errors.New("failed to encode menu image preview")
	}
	if maxOutputBytes > 0 && int64(encoded.Len()) > maxOutputBytes {
		return preview, nil
	}
	preview.PreviewPNG = encoded.Bytes()
	return preview, nil
}

func acquireMenuImageProcessingSlot(ctx context.Context) (func(), error) {
	select {
	case menuImageProcessingSlots <- struct{}{}:
		return func() { <-menuImageProcessingSlots }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func toleranceForStrength(strength int) backgroundTolerance {
	return backgroundTolerance{
		inner: 6 + strength*10/100,
		outer: 28 + strength*44/100,
	}
}

func menuImageFormatMatchesExtension(format, extension string) bool {
	switch extension {
	case ".jpg", ".jpeg":
		return format == "jpeg"
	case ".png":
		return format == "png"
	default:
		return false
	}
}

func shouldProcessMenuImageDimensions(width, height int) bool {
	if width <= 0 || height <= 0 || width > maxMenuImageDimension || height > maxMenuImageDimension {
		return false
	}
	return int64(width)*int64(height) <= maxMenuImageProcessingPixel
}

func removeEdgeConnectedBackground(ctx context.Context, source image.Image, tolerance backgroundTolerance) (*image.NRGBA, bool, float64, error) {
	canvas := normalizeNRGBA(source)
	width := canvas.Bounds().Dx()
	height := canvas.Bounds().Dy()
	if width == 0 || height == 0 {
		return nil, false, 0, nil
	}

	background, transparentMargin, ok := estimateBackgroundColor(canvas)
	if !ok {
		return nil, false, 0, nil
	}
	if !transparentMargin {
		matchedBorder := borderMatchRatio(canvas, background, tolerance.outer)
		if matchedBorder < minimumBorderMatchRatio &&
			(matchedBorder < minimumLightBorderMatchRatio || !isLightNeutral(background)) {
			return nil, false, 0, nil
		}
	}

	pixelCount := width * height
	visited := make([]bool, pixelCount)
	queueCapacity := 2 * (width + height)
	if queueCapacity > pixelCount {
		queueCapacity = pixelCount
	}
	queue := make([]int, 0, queueCapacity)
	enqueue := func(x, y int) {
		index := y*width + x
		if visited[index] {
			return
		}
		visited[index] = true
		queue = append(queue, index)
	}
	for x := 0; x < width; x++ {
		enqueue(x, 0)
		if height > 1 {
			enqueue(x, height-1)
		}
	}
	for y := 1; y+1 < height; y++ {
		enqueue(0, y)
		if width > 1 {
			enqueue(width-1, y)
		}
	}

	opaquePixels := 0
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if canvas.NRGBAAt(x, y).A > transparentAlphaThreshold {
				opaquePixels++
			}
		}
	}
	if opaquePixels == 0 {
		return nil, false, 0, nil
	}

	newlyRemoved := 0
	for head := 0; head < len(queue); head++ {
		if head&4095 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, false, 0, err
			}
		}
		index := queue[head]
		y := index / width
		x := index - y*width

		pixel := canvas.NRGBAAt(x, y)
		distance := colorDistance(rgbColor{r: pixel.R, g: pixel.G, b: pixel.B}, background)
		if pixel.A > transparentAlphaThreshold && distance > tolerance.outer {
			continue
		}

		if pixel.A > transparentAlphaThreshold {
			maskAlpha := featheredAlpha(distance, tolerance)
			newAlpha := uint8((uint16(pixel.A) * uint16(maskAlpha)) / 255)
			if newAlpha < pixel.A {
				newlyRemoved++
				pixel.A = newAlpha
				canvas.SetNRGBA(x, y, pixel)
			}
		}

		if x > 0 {
			enqueue(x-1, y)
		}
		if x+1 < width {
			enqueue(x+1, y)
		}
		if y > 0 {
			enqueue(x, y-1)
		}
		if y+1 < height {
			enqueue(x, y+1)
		}
	}

	removedRatio := float64(newlyRemoved) / float64(opaquePixels)
	if removedRatio < minimumRemovedRatio || removedRatio > maximumRemovedRatio {
		return nil, false, 0, nil
	}
	return canvas, true, removedRatio, nil
}

func addTransparentSideOutline(ctx context.Context, source image.Image) (*image.NRGBA, error) {
	base := normalizeNRGBA(source)
	outlined := normalizeNRGBA(source)
	width := base.Bounds().Dx()
	height := base.Bounds().Dy()
	orange := color.NRGBA{R: 234, G: 88, B: 12, A: 255}
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			index := y*width + x
			if index&4095 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			if base.NRGBAAt(x, y).A > transparentAlphaThreshold {
				continue
			}
			nearForeground := false
			for offsetY := -previewOutlineRadius; offsetY <= previewOutlineRadius && !nearForeground; offsetY++ {
				neighborY := y + offsetY
				if neighborY < 0 || neighborY >= height {
					continue
				}
				for offsetX := -previewOutlineRadius; offsetX <= previewOutlineRadius; offsetX++ {
					neighborX := x + offsetX
					if neighborX < 0 || neighborX >= width {
						continue
					}
					if base.NRGBAAt(neighborX, neighborY).A > transparentAlphaThreshold {
						nearForeground = true
						break
					}
				}
			}
			if nearForeground {
				outlined.SetNRGBA(x, y, orange)
			}
		}
	}
	return outlined, nil
}

func normalizeNRGBA(source image.Image) *image.NRGBA {
	bounds := source.Bounds()
	canvas := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			converted := color.NRGBAModel.Convert(source.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			canvas.SetNRGBA(x, y, converted)
		}
	}
	return canvas
}

func estimateBackgroundColor(canvas *image.NRGBA) (rgbColor, bool, bool) {
	width := canvas.Bounds().Dx()
	height := canvas.Bounds().Dy()
	transparentBorder := 0
	borderPixels := 0
	visitBorder := func(x, y int) {
		borderPixels++
		if canvas.NRGBAAt(x, y).A <= transparentAlphaThreshold {
			transparentBorder++
		}
	}
	for x := 0; x < width; x++ {
		visitBorder(x, 0)
		if height > 1 {
			visitBorder(x, height-1)
		}
	}
	for y := 1; y+1 < height; y++ {
		visitBorder(0, y)
		if width > 1 {
			visitBorder(width-1, y)
		}
	}

	transparentMargin := borderPixels > 0 && float64(transparentBorder)/float64(borderPixels) >= 0.50
	if transparentMargin {
		samples := opaquePixelsBesideTransparency(canvas)
		background, ok := dominantBoundaryColor(samples)
		if !ok || !isLightNeutral(background) {
			return rgbColor{}, true, false
		}
		return background, true, ok
	}

	patchSize := minInt(width, height) / 20
	if patchSize < 2 {
		patchSize = 2
	}
	if patchSize > 32 {
		patchSize = 32
	}
	if patchSize > width {
		patchSize = width
	}
	if patchSize > height {
		patchSize = height
	}
	patches := [][2]int{{0, 0}, {width - patchSize, 0}, {0, height - patchSize}, {width - patchSize, height - patchSize}}
	corners := make([]rgbColor, 0, 4)
	for _, origin := range patches {
		if candidate, ok := meanOpaquePatch(canvas, origin[0], origin[1], patchSize); ok {
			corners = append(corners, candidate)
		}
	}
	if len(corners) < 3 {
		return rgbColor{}, false, false
	}

	bestCluster := []rgbColor(nil)
	for _, candidate := range corners {
		cluster := make([]rgbColor, 0, len(corners))
		for _, other := range corners {
			if colorDistance(candidate, other) <= cornerColorTolerance {
				cluster = append(cluster, other)
			}
		}
		if len(cluster) > len(bestCluster) {
			bestCluster = cluster
		}
	}
	if len(bestCluster) < 3 {
		return rgbColor{}, false, false
	}
	return meanColors(bestCluster), false, true
}

func meanOpaquePatch(canvas *image.NRGBA, originX, originY, size int) (rgbColor, bool) {
	var red, green, blue, count int
	for y := originY; y < originY+size; y++ {
		for x := originX; x < originX+size; x++ {
			pixel := canvas.NRGBAAt(x, y)
			if pixel.A < opaqueAlphaThreshold {
				continue
			}
			red += int(pixel.R)
			green += int(pixel.G)
			blue += int(pixel.B)
			count++
		}
	}
	if count == 0 {
		return rgbColor{}, false
	}
	return rgbColor{r: uint8(red / count), g: uint8(green / count), b: uint8(blue / count)}, true
}

func opaquePixelsBesideTransparency(canvas *image.NRGBA) []rgbColor {
	width := canvas.Bounds().Dx()
	height := canvas.Bounds().Dy()
	samples := make([]rgbColor, 0, 2*(width+height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			pixel := canvas.NRGBAAt(x, y)
			if pixel.A < opaqueAlphaThreshold {
				continue
			}
			besideTransparency := (x > 0 && canvas.NRGBAAt(x-1, y).A <= transparentAlphaThreshold) ||
				(x+1 < width && canvas.NRGBAAt(x+1, y).A <= transparentAlphaThreshold) ||
				(y > 0 && canvas.NRGBAAt(x, y-1).A <= transparentAlphaThreshold) ||
				(y+1 < height && canvas.NRGBAAt(x, y+1).A <= transparentAlphaThreshold)
			if besideTransparency {
				samples = append(samples, rgbColor{r: pixel.R, g: pixel.G, b: pixel.B})
			}
		}
	}
	return samples
}

func dominantBoundaryColor(samples []rgbColor) (rgbColor, bool) {
	if len(samples) < 12 {
		return rgbColor{}, false
	}
	type colorBucket struct {
		colors []rgbColor
	}
	buckets := make(map[uint16]*colorBucket)
	for _, sample := range samples {
		key := uint16(sample.r>>4)<<8 | uint16(sample.g>>4)<<4 | uint16(sample.b>>4)
		bucket := buckets[key]
		if bucket == nil {
			bucket = &colorBucket{}
			buckets[key] = bucket
		}
		bucket.colors = append(bucket.colors, sample)
	}
	var dominant []rgbColor
	for _, bucket := range buckets {
		if len(bucket.colors) > len(dominant) {
			dominant = bucket.colors
		}
	}
	if float64(len(dominant))/float64(len(samples)) < minimumBoundaryClusterRatio {
		return rgbColor{}, false
	}
	return meanColors(dominant), true
}

func borderMatchRatio(canvas *image.NRGBA, background rgbColor, outerTolerance int) float64 {
	width := canvas.Bounds().Dx()
	height := canvas.Bounds().Dy()
	matched := 0
	opaque := 0
	visit := func(x, y int) {
		pixel := canvas.NRGBAAt(x, y)
		if pixel.A < opaqueAlphaThreshold {
			return
		}
		opaque++
		if colorDistance(rgbColor{r: pixel.R, g: pixel.G, b: pixel.B}, background) <= outerTolerance {
			matched++
		}
	}
	for x := 0; x < width; x++ {
		visit(x, 0)
		if height > 1 {
			visit(x, height-1)
		}
	}
	for y := 1; y+1 < height; y++ {
		visit(0, y)
		if width > 1 {
			visit(width-1, y)
		}
	}
	if opaque == 0 {
		return 0
	}
	return float64(matched) / float64(opaque)
}

func featheredAlpha(distance int, tolerance backgroundTolerance) uint8 {
	if distance <= tolerance.inner {
		return 0
	}
	if distance >= tolerance.outer {
		return 255
	}
	return uint8((distance - tolerance.inner) * 255 / (tolerance.outer - tolerance.inner))
}

func colorDistance(left, right rgbColor) int {
	red := absInt(int(left.r) - int(right.r))
	green := absInt(int(left.g) - int(right.g))
	blue := absInt(int(left.b) - int(right.b))
	return maxInt(red, maxInt(green, blue))
}

func isLightNeutral(value rgbColor) bool {
	lightness := (299*int(value.r) + 587*int(value.g) + 114*int(value.b)) / 1000
	highest := maxInt(int(value.r), maxInt(int(value.g), int(value.b)))
	lowest := minInt(int(value.r), minInt(int(value.g), int(value.b)))
	return lightness >= 180 && highest-lowest <= 36
}

func meanColors(colors []rgbColor) rgbColor {
	var red, green, blue int
	for _, value := range colors {
		red += int(value.r)
		green += int(value.g)
		blue += int(value.b)
	}
	return rgbColor{r: uint8(red / len(colors)), g: uint8(green / len(colors)), b: uint8(blue / len(colors))}
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
