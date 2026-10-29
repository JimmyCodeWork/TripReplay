/**
 * The part of the Canvas 2D API the renderer uses. A `CanvasRenderingContext2D` satisfies it; the
 * renderer itself stays free of DOM types, so it is tested in Node with a recording fake.
 */
export interface Canvas2D<Image = unknown> {
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "bevel" | "miter" | "round";
  font: string;
  textAlign: "center" | "end" | "left" | "right" | "start";
  textBaseline: "alphabetic" | "bottom" | "hanging" | "ideographic" | "middle" | "top";
  shadowColor: string;
  shadowBlur: number;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  roundRect(x: number, y: number, width: number, height: number, radii: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: Image, dx: number, dy: number, dw: number, dh: number): void;
}
