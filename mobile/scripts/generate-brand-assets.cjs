const fs = require('node:fs');
const path = require('node:path');
const Jimp = require('jimp-compact');

const mobileRoot = path.resolve(__dirname, '..');
const sourcePath = path.resolve(mobileRoot, '..', 'frontend', 'public', 'web-logo.png');
const wordmarkSourcePath = path.resolve(
  mobileRoot,
  '..',
  'frontend',
  'public',
  'dishy-wordmark.png',
);
const menuPlaceholderSourcePath = path.resolve(
  mobileRoot,
  '..',
  'frontend',
  'public',
  'menu-placeholder-v2.webp',
);
const outputDir = path.join(mobileRoot, 'assets', 'images');

function centeredCanvas(size, color, artwork, artworkSize) {
  const canvas = new Jimp(size, size, color);
  const scaledArtwork = artwork.clone().resize(artworkSize, artworkSize);
  const offset = Math.round((size - artworkSize) / 2);
  canvas.composite(scaledArtwork, offset, offset);
  return canvas;
}

async function writePng(image, filename) {
  await image.writeAsync(path.join(outputDir, filename));
}

async function main() {
  const logo = await Jimp.read(sourcePath);

  fs.copyFileSync(sourcePath, path.join(outputDir, 'brand-logo.png'));
  fs.copyFileSync(wordmarkSourcePath, path.join(outputDir, 'dishy-wordmark.png'));
  fs.copyFileSync(
    menuPlaceholderSourcePath,
    path.join(outputDir, 'menu-placeholder-v2.webp'),
  );

  const iosIcon = centeredCanvas(1024, 0xffffffff, logo, 820);
  iosIcon.scan(0, 0, 1024, 1024, (_x, _y, index) => {
    iosIcon.bitmap.data[index + 3] = 255;
  });
  iosIcon.colorType(2);
  await writePng(iosIcon, 'icon.png');
  await writePng(
    centeredCanvas(1024, 0x00000000, logo, 450),
    'android-icon-foreground.png',
  );
  await writePng(new Jimp(1024, 1024, 0xffffffff), 'android-icon-background.png');

  const monochromeArtwork = logo.clone().resize(450, 450);
  monochromeArtwork.scan(
    0,
    0,
    monochromeArtwork.bitmap.width,
    monochromeArtwork.bitmap.height,
    (_x, _y, index) => {
      const red = monochromeArtwork.bitmap.data[index];
      const green = monochromeArtwork.bitmap.data[index + 1];
      const blue = monochromeArtwork.bitmap.data[index + 2];
      const alpha = monochromeArtwork.bitmap.data[index + 3];
      const nearlyWhite = red > 244 && green > 244 && blue > 244;
      const visible = alpha > 24 && !nearlyWhite;
      monochromeArtwork.bitmap.data[index] = 0;
      monochromeArtwork.bitmap.data[index + 1] = 0;
      monochromeArtwork.bitmap.data[index + 2] = 0;
      monochromeArtwork.bitmap.data[index + 3] = visible ? 255 : 0;
    },
  );
  const monochromeCanvas = new Jimp(1024, 1024, 0x00000000);
  monochromeCanvas.composite(monochromeArtwork, 287, 287);
  await writePng(monochromeCanvas, 'android-icon-monochrome.png');

  await writePng(logo.clone().resize(1024, 1024), 'splash-icon.png');
  await writePng(logo.clone().resize(48, 48), 'favicon.png');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
