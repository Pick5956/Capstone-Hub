export interface CropFrameInput {
  naturalWidth: number;
  naturalHeight: number;
  cropWidth: number;
  cropHeight: number;
  zoomPercent: number;
  positionX: number;
  positionY: number;
}

export interface CropFrame {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface CropPositionInput {
  positionX: number;
  positionY: number;
  deltaX: number;
  deltaY: number;
  offsetRangeX: number;
  offsetRangeY: number;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
const clampZoomPercent = (value: number) => Math.min(100, Math.max(-100, value));

export function calculateCropFrame(input: CropFrameInput): CropFrame {
  const {
    naturalWidth,
    naturalHeight,
    cropWidth,
    cropHeight,
    positionX,
    positionY,
  } = input;

  if (naturalWidth <= 0 || naturalHeight <= 0 || cropWidth <= 0 || cropHeight <= 0) {
    throw new Error("Image and crop dimensions must be positive.");
  }

  const zoomPercent = Number.isFinite(input.zoomPercent)
    ? clampZoomPercent(input.zoomPercent)
    : 0;
  const coverScale = Math.max(cropWidth / naturalWidth, cropHeight / naturalHeight);
  const containScale = Math.min(cropWidth / naturalWidth, cropHeight / naturalHeight);
  const minimumScale = containScale * 0.5;
  const scale = zoomPercent < 0
    ? coverScale + (coverScale - minimumScale) * (zoomPercent / 100)
    : coverScale * (1 + zoomPercent / 100);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    width,
    height,
    x: (cropWidth - width) * clampUnit(positionX),
    y: (cropHeight - height) * clampUnit(positionY),
  };
}

export function moveCropPosition(input: CropPositionInput) {
  return {
    positionX: Math.abs(input.offsetRangeX) > Number.EPSILON
      ? clampUnit(input.positionX + input.deltaX / input.offsetRangeX)
      : 0.5,
    positionY: Math.abs(input.offsetRangeY) > Number.EPSILON
      ? clampUnit(input.positionY + input.deltaY / input.offsetRangeY)
      : 0.5,
  };
}
