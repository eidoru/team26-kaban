import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

// --- CSV

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV that Excel opens correctly: UTF-8 with a byte-order mark (for ₱ and ñ), CRLF line ends. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): Buffer {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

/** Centavos as a plain decimal for spreadsheets: 150050 → "1500.50". */
export const csvMoney = (centavos: number | null | undefined) => (centavos == null ? "" : (centavos / 100).toFixed(2));

// --- PDF

/** Nunito (OFL) covers ₱ and ñ, which PDF's built-in fonts don't. Shipped in server/assets/fonts. */
function fontPath(file: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "../../assets/fonts", file), join(process.cwd(), "server/assets/fonts", file)];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

const INK = "#231e19";
const MUTED = "#76695a";
const BRAND = "#0b6a47";
const RULE = "#e4dccf";
const ZEBRA = "#faf7f2";

export interface Column {
  header: string;
  /** Share of the table width. */
  width: number;
  align?: "left" | "right";
}

/**
 * A small document builder for statements and ledgers: a header, label/value facts, and tables
 * that wrap long cells and repeat their header across pages. Resolves to the finished PDF.
 */
export class Report {
  private doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 64, left: 44, right: 44 }, bufferPages: true });
  private chunks: Buffer[] = [];
  private done: Promise<Buffer>;

  constructor(private footer: string) {
    this.doc.registerFont("Regular", fontPath("Nunito_400Regular.ttf"));
    this.doc.registerFont("Bold", fontPath("Nunito_700Bold.ttf"));
    this.doc.font("Regular");
    this.doc.on("data", (chunk: Buffer) => this.chunks.push(chunk));
    this.done = new Promise((resolve) => this.doc.on("end", () => resolve(Buffer.concat(this.chunks))));
  }

  private get width() {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }

  private get left() {
    return this.doc.page.margins.left;
  }

  private ensureRoom(height: number) {
    if (this.doc.y + height > this.doc.page.height - this.doc.page.margins.bottom) this.doc.addPage();
  }

  title(kicker: string, title: string, lines: string[]) {
    this.doc.font("Bold").fontSize(9).fillColor(BRAND).text(kicker.toUpperCase(), { characterSpacing: 1 });
    this.doc.moveDown(0.2).font("Bold").fontSize(20).fillColor(INK).text(title);
    this.doc.font("Regular").fontSize(10).fillColor(MUTED);
    for (const line of lines) this.doc.text(line);
    this.doc.moveDown(1);
    return this;
  }

  heading(text: string) {
    this.ensureRoom(40);
    this.doc.moveDown(0.6).font("Bold").fontSize(12).fillColor(INK).text(text, this.left);
    this.doc.moveDown(0.4);
    return this;
  }

  /** Label/value pairs in two columns, e.g. the totals of a statement. */
  facts(pairs: [string, string][]) {
    const colWidth = this.width / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      this.ensureRoom(30);
      const y = this.doc.y;
      let bottom = y;
      for (const [offset, pair] of [pairs[i], pairs[i + 1]].entries()) {
        if (!pair) continue;
        const x = this.left + offset * colWidth;
        this.doc.font("Regular").fontSize(8.5).fillColor(MUTED).text(pair[0], x, y, { width: colWidth - 12 });
        this.doc.font("Bold").fontSize(12).fillColor(INK).text(pair[1], x, this.doc.y, { width: colWidth - 12 });
        bottom = Math.max(bottom, this.doc.y);
      }
      this.doc.y = bottom + 6;
    }
    this.doc.x = this.left;
    return this;
  }

  note(text: string) {
    this.ensureRoom(24);
    this.doc.font("Regular").fontSize(9).fillColor(MUTED).text(text, this.left, this.doc.y, { width: this.width });
    this.doc.moveDown(0.5);
    return this;
  }

  table(columns: Column[], rows: string[][], emptyText = "Nothing recorded yet.") {
    const total = columns.reduce((t, c) => t + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const pad = 4;
    const drawRow = (cells: string[], bold: boolean, fill?: string) => {
      this.doc.font(bold ? "Bold" : "Regular").fontSize(8.5);
      const height =
        Math.max(...cells.map((cell, i) => this.doc.heightOfString(cell || " ", { width: widths[i] - pad * 2 }))) + pad * 2;
      if (this.doc.y + height > this.doc.page.height - this.doc.page.margins.bottom) {
        this.doc.addPage();
        if (!bold) drawRow(columns.map((c) => c.header), true, ZEBRA);
      }
      const y = this.doc.y;
      if (fill) this.doc.rect(this.left, y, this.width, height).fill(fill);
      let x = this.left;
      cells.forEach((cell, i) => {
        this.doc
          .font(bold ? "Bold" : "Regular")
          .fontSize(8.5)
          .fillColor(bold ? MUTED : INK)
          .text(cell, x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].align ?? "left" });
        x += widths[i];
      });
      this.doc
        .moveTo(this.left, y + height)
        .lineTo(this.left + this.width, y + height)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
      this.doc.y = y + height;
    };
    this.ensureRoom(40);
    drawRow(columns.map((c) => c.header), true, ZEBRA);
    if (rows.length === 0) drawRow([emptyText, ...columns.slice(1).map(() => "")], false);
    rows.forEach((row) => drawRow(row, false));
    this.doc.x = this.left;
    this.doc.moveDown(0.5);
    return this;
  }

  /** Footer and page numbers on every page, then the bytes. */
  async finish(): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      const y = this.doc.page.height - this.doc.page.margins.bottom + 24;
      // Writing inside the bottom margin would otherwise start a new page.
      const bottom = this.doc.page.margins.bottom;
      this.doc.page.margins.bottom = 0;
      this.doc.font("Regular").fontSize(8).fillColor(MUTED);
      this.doc.text(this.footer, this.left, y, { width: this.width - 60, lineBreak: false });
      this.doc.text(`Page ${i + 1} of ${range.count}`, this.left, y, { width: this.width, align: "right", lineBreak: false });
      this.doc.page.margins.bottom = bottom;
    }
    this.doc.end();
    return this.done;
  }
}
