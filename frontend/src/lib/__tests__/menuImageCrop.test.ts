import { describe, expect, it } from "vitest";
import { calculateCropFrame, moveCropPosition } from "../menuImageCrop";

describe("menu image crop", () => {
  it("centers a wide image while covering a 4:3 crop without gaps", () => {
    const frame = calculateCropFrame({
      naturalWidth: 1600,
      naturalHeight: 900,
      cropWidth: 1200,
      cropHeight: 900,
      zoomPercent: 0,
      positionX: 0.5,
      positionY: 0.5,
    });

    expect(frame).toEqual({
      width: 1600,
      height: 900,
      x: -200,
      y: 0,
    });
  });

  it("centers a tall image while covering a 4:3 crop without gaps", () => {
    const frame = calculateCropFrame({
      naturalWidth: 900,
      naturalHeight: 1600,
      cropWidth: 1200,
      cropHeight: 900,
      zoomPercent: 0,
      positionX: 0.5,
      positionY: 0.5,
    });

    expect(frame.width).toBeCloseTo(1200);
    expect(frame.height).toBeCloseTo(2133.333);
    expect(frame.x).toBeCloseTo(0);
    expect(frame.y).toBeCloseTo(-616.667);
  });

  it("zooms out to half of the contain scale at -100%", () => {
    const frame = calculateCropFrame({
      naturalWidth: 1600,
      naturalHeight: 900,
      cropWidth: 1200,
      cropHeight: 900,
      zoomPercent: -100,
      positionX: 0.5,
      positionY: 0.5,
    });

    expect(frame.width).toBe(600);
    expect(frame.height).toBe(337.5);
    expect(frame.x).toBe(300);
    expect(frame.y).toBe(281.25);
  });

  it("zooms in to twice the cover scale at +100%", () => {
    const frame = calculateCropFrame({
      naturalWidth: 1600,
      naturalHeight: 900,
      cropWidth: 1200,
      cropHeight: 900,
      zoomPercent: 100,
      positionX: 0.5,
      positionY: 0.5,
    });

    expect(frame.width).toBe(3200);
    expect(frame.height).toBe(1800);
    expect(frame.x).toBe(-1000);
    expect(frame.y).toBe(-450);
  });

  it("keeps the preview framing proportional to the exported 4:3 card image", () => {
    const preview = calculateCropFrame({
      naturalWidth: 1600,
      naturalHeight: 900,
      cropWidth: 400,
      cropHeight: 300,
      zoomPercent: -60,
      positionX: 0.2,
      positionY: 0.8,
    });
    const output = calculateCropFrame({
      naturalWidth: 1600,
      naturalHeight: 900,
      cropWidth: 1200,
      cropHeight: 900,
      zoomPercent: -60,
      positionX: 0.2,
      positionY: 0.8,
    });

    expect(output.width / preview.width).toBeCloseTo(3);
    expect(output.height / preview.height).toBeCloseTo(3);
    expect(output.x / preview.x).toBeCloseTo(3);
    expect(output.y / preview.y).toBeCloseTo(3);
  });

  it("maps drag distance while the image is larger than the frame", () => {
    expect(moveCropPosition({
      positionX: 0.5,
      positionY: 0.5,
      deltaX: 100,
      deltaY: 0,
      offsetRangeX: -133,
      offsetRangeY: 0,
    })).toEqual({ positionX: 0, positionY: 0.5 });

    expect(moveCropPosition({
      positionX: 0.5,
      positionY: 0.5,
      deltaX: -100,
      deltaY: 0,
      offsetRangeX: -133,
      offsetRangeY: 0,
    })).toEqual({ positionX: 1, positionY: 0.5 });
  });

  it("maps drag distance while the zoomed-out image is smaller than the frame", () => {
    expect(moveCropPosition({
      positionX: 0.5,
      positionY: 0.5,
      deltaX: 100,
      deltaY: -100,
      offsetRangeX: 600,
      offsetRangeY: 562.5,
    })).toEqual({
      positionX: 0.5 + 100 / 600,
      positionY: 0.5 - 100 / 562.5,
    });
  });
});
