export const MENU_IMAGE_OUTPUT_WIDTH = 1200;
export const MENU_IMAGE_OUTPUT_HEIGHT = 900;
export const MENU_IMAGE_OUTPUT_MIME_TYPE = 'image/webp';
export const MENU_IMAGE_OUTPUT_QUALITY = 0.9;
export const MENU_IMAGE_MIN_ZOOM = -100;
export const MENU_IMAGE_MAX_ZOOM = 100;
export const MENU_IMAGE_ZOOM_STEP = 5;
export const MENU_IMAGE_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const MENU_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
const menuImageMimeTypes = new Set<string>(MENU_IMAGE_MIME_TYPES);

export type MenuImageValidationIssue =
  | 'empty'
  | 'too_large'
  | 'unsupported_type';

export interface MenuImageAssetInput {
  mimeType?: string | null;
  fileSize?: number | null;
}

const menuImageMimeTypeByExtension: Record<string, typeof MENU_IMAGE_MIME_TYPES[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function inferMenuImageMimeType(
  mimeType?: string | null,
  fileNameOrUri?: string | null,
) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  if (normalizedMimeType) return normalizedMimeType;

  const cleanName = String(fileNameOrUri || '').split(/[?#]/, 1)[0];
  const extension = cleanName.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || '';
  return menuImageMimeTypeByExtension[extension] || normalizedMimeType || null;
}

export function validateMenuImageAsset(
  asset: MenuImageAssetInput,
): MenuImageValidationIssue | null {
  if (asset.fileSize !== undefined && asset.fileSize !== null) {
    const fileSize = Number(asset.fileSize);
    if (!Number.isFinite(fileSize) || fileSize <= 0) return 'empty';
    if (fileSize > MENU_IMAGE_MAX_FILE_BYTES) return 'too_large';
  }
  if (!menuImageMimeTypes.has(String(asset.mimeType || '').toLowerCase())) {
    return 'unsupported_type';
  }
  return null;
}

export function menuImageOutputName(sourceName?: string | null) {
  const baseName = String(sourceName || '')
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .trim();
  return `${baseName || 'menu-image'}-cropped.webp`;
}

export function resolveCommittedMenuImageUrl(
  currentImageUrl: string,
  uploadedImageUrl?: string | null,
) {
  const nextImageUrl = uploadedImageUrl?.trim();
  return nextImageUrl || currentImageUrl;
}

export interface MenuImageUploadFile {
  uri: string;
  name: string;
  type: string;
}

export const MENU_IMAGE_UPLOAD_PATH = '/api/v1/menu-items/upload-image';
export const MENU_IMAGE_UPLOAD_FIELD = 'image';

export function menuImageCaptureLogicalSize(pixelRatio: number) {
  const safePixelRatio = Number.isFinite(pixelRatio) && pixelRatio > 0
    ? pixelRatio
    : 1;
  return {
    width: MENU_IMAGE_OUTPUT_WIDTH / safePixelRatio,
    height: MENU_IMAGE_OUTPUT_HEIGHT / safePixelRatio,
  };
}

export function menuImageZoomFromTrackPosition(
  locationX: number,
  trackWidth: number,
) {
  if (!Number.isFinite(locationX) || !Number.isFinite(trackWidth) || trackWidth <= 0) {
    return null;
  }
  const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
  const rawValue = MENU_IMAGE_MIN_ZOOM
    + ratio * (MENU_IMAGE_MAX_ZOOM - MENU_IMAGE_MIN_ZOOM);
  return clampZoomPercent(
    Math.round(rawValue / MENU_IMAGE_ZOOM_STEP) * MENU_IMAGE_ZOOM_STEP,
  );
}

export function appendMenuImageUpload(
  formData: Pick<FormData, 'append'>,
  file: MenuImageUploadFile,
) {
  formData.append(MENU_IMAGE_UPLOAD_FIELD, file as unknown as Blob);
}

export interface MenuImageFrameInput {
  naturalWidth: number;
  naturalHeight: number;
  cropWidth: number;
  cropHeight: number;
  zoomPercent: number;
  positionX: number;
  positionY: number;
}

export interface MenuImageFrame {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface MenuImagePositionInput {
  positionX: number;
  positionY: number;
  deltaX: number;
  deltaY: number;
  offsetRangeX: number;
  offsetRangeY: number;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
const clampZoomPercent = (value: number) => Math.min(
  MENU_IMAGE_MAX_ZOOM,
  Math.max(MENU_IMAGE_MIN_ZOOM, value),
);

export function calculateMenuImageFrame(
  input: MenuImageFrameInput,
): MenuImageFrame {
  const {
    naturalWidth,
    naturalHeight,
    cropWidth,
    cropHeight,
    positionX,
    positionY,
  } = input;

  if (
    naturalWidth <= 0
    || naturalHeight <= 0
    || cropWidth <= 0
    || cropHeight <= 0
  ) {
    throw new Error('Image and crop dimensions must be positive.');
  }

  const zoomPercent = Number.isFinite(input.zoomPercent)
    ? clampZoomPercent(input.zoomPercent)
    : 0;
  const coverScale = Math.max(
    cropWidth / naturalWidth,
    cropHeight / naturalHeight,
  );
  const containScale = Math.min(
    cropWidth / naturalWidth,
    cropHeight / naturalHeight,
  );
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

export function moveMenuImagePosition(input: MenuImagePositionInput) {
  return {
    positionX: Math.abs(input.offsetRangeX) > Number.EPSILON
      ? clampUnit(input.positionX + input.deltaX / input.offsetRangeX)
      : 0.5,
    positionY: Math.abs(input.offsetRangeY) > Number.EPSILON
      ? clampUnit(input.positionY + input.deltaY / input.offsetRangeY)
      : 0.5,
  };
}
