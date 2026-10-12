import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

// Standard PDF fonts only encode WinAnsi; anything else would throw mid-render.
function winAnsi(s: string) {
  return s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
}

async function stamp(pdf: PDFDocument, diagonal: string, footer: string) {
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(12, Math.min(width, height) / 22);
    const textWidth = font.widthOfTextAtSize(diagonal, size);
    // Repeat the diagonal stamp so cropping a screenshot can't easily remove it.
    for (const fy of [0.25, 0.55, 0.85]) {
      page.drawText(diagonal, {
        x: width / 2 - (textWidth * Math.SQRT1_2) / 2,
        y: height * fy - (textWidth * Math.SQRT1_2) / 2,
        size,
        font,
        rotate: degrees(45),
        color: rgb(0.55, 0.55, 0.55),
        opacity: 0.22,
      });
    }
    page.drawText(footer, { x: 24, y: 14, size: 8, font, color: rgb(0.4, 0.4, 0.4), opacity: 0.8 });
  }
}

export async function watermarkedPdf(
  data: Uint8Array,
  mimeType: string,
  w: { viewer: string; organization: string; date: Date }
): Promise<Uint8Array> {
  const date = w.date.toISOString().slice(0, 10);
  const diagonal = winAnsi(`${w.viewer} - ${date} - Confidential`);
  const footer = winAnsi(`Shared by ${w.organization} via Trust Center for ${w.viewer} on ${date}. Do not distribute.`);

  let pdf: PDFDocument;
  if (mimeType === "application/pdf") {
    pdf = await PDFDocument.load(data, { updateMetadata: false });
  } else {
    pdf = await PDFDocument.create();
    const image = mimeType === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  await stamp(pdf, diagonal, footer);
  return pdf.save();
}
