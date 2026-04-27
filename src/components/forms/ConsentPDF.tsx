// Consent PDF builder using pdf-lib. Two entry points:
//
//   buildConsentPdfBytes(data, opts)
//     Builds the PDF with all form data baked in. The signature image is
//     drawn IF provided, otherwise the signature box is left empty. This
//     same function powers both the live "review" iframe (called on every
//     state change in review_and_sign) and the final signed bytes — same
//     code path so the bytes the user sees match the bytes they sign.
//
//   sha256Hex(bytes)
//     Hex-encoded SHA-256 of the final PDF, computed via crypto.subtle.
//     Stored on consent_submissions.pdf_sha256 for tamper detection.
//
// Audit metadata (IP, UA, timezone, signed timestamp, submission_id) goes
// into the PDF info dict — invisible to the casual reader, recoverable with
// any PDF inspector. The visible footer carries only the date.
//
// Theme: hard-coded white background, black text. Same reasoning as the
// signature pad — the document needs to render identically in any context
// (download, print, archive). No fonts beyond the 14 PDF base fonts so we
// don't need any external font loading.

import {
  PDFDocument,
  StandardFonts,
  PDFFont,
  PDFPage,
  rgb,
} from 'pdf-lib';
import { format } from 'date-fns';
import {
  WAIVER_ITEMS,
  type WaiverChecksValue,
  type LicenseFieldsValue,
  type TattooDetailsValue,
} from './consentFormSchema';

export interface ConsentPDFData {
  studioName: string;
  signedAt: Date;
  submissionId: string;
  license: LicenseFieldsValue;
  tattoo: TattooDetailsValue;
  waiver: WaiverChecksValue;
  /** PNG bytes from SignaturePad. null leaves the signature box empty. */
  signaturePngBytes: Uint8Array | null;
  audit: {
    /** Public IP captured by consent-upload-url and passed back to the client. */
    clientIp: string;
    userAgent: string;
    timezone: string;
  };
}

export interface BuildOpts {
  /** When true, finalizes audit metadata + visible "Signed" line. The live
   *  preview before signing passes false so the document doesn't claim to be
   *  signed before the user actually signs. */
  finalize: boolean;
}

const PAGE_W = 612; // letter
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const C_BLACK = rgb(0.067, 0.067, 0.067);
const C_GREY = rgb(0.33, 0.33, 0.33);
const C_LIGHT = rgb(0.55, 0.55, 0.55);
const C_LINE = rgb(0.8, 0.8, 0.8);

// Wraps a string into lines that fit `maxWidth` at `size` in `font`.
// Word-break only; no hyphenation.
function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = current + ' ' + words[i];
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

// Draws a checkbox glyph at (x, y) where y is the top-left of the box.
function drawCheckbox(
  page: PDFPage,
  x: number,
  yTop: number,
  size: number,
  checked: boolean,
) {
  // pdf-lib coords are bottom-left origin. Convert.
  const yBottom = yTop - size;
  page.drawRectangle({
    x,
    y: yBottom,
    width: size,
    height: size,
    borderColor: C_BLACK,
    borderWidth: 0.8,
  });
  if (checked) {
    // X mark using two lines, drawn slightly inset from the box edges.
    const inset = size * 0.18;
    page.drawLine({
      start: { x: x + inset, y: yBottom + inset },
      end: { x: x + size - inset, y: yBottom + size - inset },
      thickness: 1.2,
      color: C_BLACK,
    });
    page.drawLine({
      start: { x: x + inset, y: yBottom + size - inset },
      end: { x: x + size - inset, y: yBottom + inset },
      thickness: 1.2,
      color: C_BLACK,
    });
  }
}

// Paint a section title: caps + thin underline.
function drawSectionTitle(
  page: PDFPage,
  yTop: number,
  text: string,
  font: PDFFont,
): number {
  page.drawText(text.toUpperCase(), {
    x: MARGIN,
    y: yTop - 10,
    size: 10,
    font,
    color: C_BLACK,
  });
  return yTop - 18;
}

function fullName(license: LicenseFieldsValue): string {
  return [license.first_name, license.last_name].filter(Boolean).join(' ').trim();
}

/**
 * Builds the PDF. Same code path is reused for live preview (no signature)
 * and final (signature embedded) so the bytes match exactly.
 */
export async function buildConsentPdfBytes(
  data: ConsentPDFData,
  opts: BuildOpts,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  let cursor = PAGE_H - MARGIN;

  // --- Header -------------------------------------------------------------
  const headerTitle = data.studioName.trim() || 'Tattoo Studio';
  page.drawText(headerTitle, {
    x: MARGIN,
    y: cursor - 16,
    size: 18,
    font: helvBold,
    color: C_BLACK,
  });
  cursor -= 22;

  page.drawText('TATTOO CONSENT FORM', {
    x: MARGIN,
    y: cursor - 9,
    size: 9,
    font: helv,
    color: C_GREY,
  });

  // Date right-aligned at the same line as the subtitle.
  const dateStr = format(data.signedAt, 'PPP');
  const dateW = helv.widthOfTextAtSize(dateStr, 9);
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - dateW,
    y: cursor - 9,
    size: 9,
    font: helv,
    color: C_GREY,
  });
  cursor -= 18;

  // Divider
  page.drawLine({
    start: { x: MARGIN, y: cursor },
    end: { x: PAGE_W - MARGIN, y: cursor },
    thickness: 0.7,
    color: C_LINE,
  });
  cursor -= 16;

  // --- Client section -----------------------------------------------------
  cursor = drawSectionTitle(page, cursor, 'Client', helvBold);

  const fieldLabelW = 110;
  const drawField = (label: string, value: string, y: number): number => {
    page.drawText(label, { x: MARGIN, y: y - 9, size: 10, font: helv, color: C_GREY });
    page.drawText(value || '—', {
      x: MARGIN + fieldLabelW,
      y: y - 9,
      size: 10,
      font: helv,
      color: C_BLACK,
    });
    return y - 16;
  };

  cursor = drawField('Name', fullName(data.license), cursor);
  cursor = drawField('Date of birth', data.license.dob, cursor);
  cursor -= 8;

  // --- Tattoo section -----------------------------------------------------
  cursor = drawSectionTitle(page, cursor, 'Tattoo', helvBold);

  // Both location and description render as bordered text blocks. They're
  // free-form fields and a box visually communicates "this is what they
  // said" rather than a single-line database value.
  const drawTextBlock = (label: string, value: string, minHeight: number, y: number): number => {
    page.drawText(label, {
      x: MARGIN,
      y: y - 9,
      size: 10,
      font: helv,
      color: C_GREY,
    });
    y -= 14;
    const lines = wrapText(value || '—', CONTENT_W - 16, helv, 10);
    const lineH = 13;
    const blockH = Math.max(minHeight, lines.length * lineH + 12);
    page.drawRectangle({
      x: MARGIN,
      y: y - blockH,
      width: CONTENT_W,
      height: blockH,
      borderColor: C_LINE,
      borderWidth: 0.6,
    });
    let lineY = y - 14;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 8, y: lineY, size: 10, font: helv, color: C_BLACK });
      lineY -= lineH;
    }
    return y - blockH - 8;
  };

  cursor = drawTextBlock('Location', data.tattoo.location, 28, cursor);
  cursor = drawTextBlock('Description', data.tattoo.description, 40, cursor);
  cursor -= 6;

  // --- Consent statements -------------------------------------------------
  cursor = drawSectionTitle(page, cursor, 'Consent statements', helvBold);

  const boxSize = 11;
  const boxToTextGap = 8;
  const textIndent = MARGIN + boxSize + boxToTextGap;
  const textWidth = CONTENT_W - boxSize - boxToTextGap;
  const lineH = 12;

  for (const item of WAIVER_ITEMS) {
    const checked = data.waiver[item.key] === true;
    const lines = wrapText(item.label, textWidth, helv, 10);
    drawCheckbox(page, MARGIN, cursor, boxSize, checked);
    let lineY = cursor - 9;
    for (const line of lines) {
      page.drawText(line, {
        x: textIndent,
        y: lineY,
        size: 10,
        font: helv,
        color: C_BLACK,
      });
      lineY -= lineH;
    }
    cursor -= Math.max(boxSize + 4, lines.length * lineH + 4);
  }
  cursor -= 4;

  // --- Signature ----------------------------------------------------------
  // Standard legal-doc signature line: thin horizontal rule, signature image
  // floats above it, label below. Date renders in a parallel column on the
  // right. This visual is what people recognize as a "signed document" — a
  // big bordered box looks like a placeholder, not a finished signature.
  cursor = drawSectionTitle(page, cursor, 'Signature', helvBold);

  const sigColX = MARGIN;
  const sigColW = 280;
  const dateColW = 160;
  const dateColX = MARGIN + CONTENT_W - dateColW;
  const sigImageH = 32;

  // Reserve space above the lines for the signature image / date text.
  const sigImageBottomY = cursor - sigImageH;

  if (data.signaturePngBytes) {
    try {
      const sigImg = await doc.embedPng(data.signaturePngBytes);
      // Fit-contain inside the signature column at full height. No border —
      // the line below is the visual anchor.
      const sigDims = sigImg.scaleToFit(sigColW, sigImageH);
      page.drawImage(sigImg, {
        x: sigColX,
        y: sigImageBottomY + (sigImageH - sigDims.height) / 2,
        width: sigDims.width,
        height: sigDims.height,
      });
    } catch (e) {
      console.warn('failed to embed signature into PDF', e);
    }
  }

  // Date text sits in the date column at roughly the same vertical center as
  // the signature image so they read as a paired row. Always populated —
  // during preview the user wants to see the date they're agreeing to. The
  // visible bytes between preview and final differ only by the signature
  // image content; everything else (date, name, waiver state) is shared.
  page.drawText(dateStr, {
    x: dateColX,
    y: sigImageBottomY + 9,
    size: 11,
    font: helv,
    color: C_BLACK,
  });

  cursor = sigImageBottomY - 2;

  // Two parallel horizontal rules — the signature line and the date line.
  page.drawLine({
    start: { x: sigColX, y: cursor },
    end: { x: sigColX + sigColW, y: cursor },
    thickness: 0.7,
    color: C_BLACK,
  });
  page.drawLine({
    start: { x: dateColX, y: cursor },
    end: { x: dateColX + dateColW, y: cursor },
    thickness: 0.7,
    color: C_BLACK,
  });

  cursor -= 11;

  // Labels below each line, in caps grey — same treatment as section titles
  // so they read as field headers, not body text.
  page.drawText('SIGNATURE', {
    x: sigColX,
    y: cursor - 8,
    size: 8,
    font: helv,
    color: C_GREY,
  });
  page.drawText('DATE', {
    x: dateColX,
    y: cursor - 8,
    size: 8,
    font: helv,
    color: C_GREY,
  });
  cursor -= 12;

  // Printed name under the signature label — standard for "x signed"
  // documents and useful when handwritten signatures are illegible.
  const signerName = fullName(data.license);
  if (signerName) {
    page.drawText(signerName, {
      x: sigColX,
      y: cursor - 9,
      size: 10,
      font: helv,
      color: C_BLACK,
    });
    cursor -= 14;
  }

  // --- Footer (visible) ---------------------------------------------------
  // Always near the bottom edge, regardless of how the content laid out.
  // The date renders constantly so the user can see during preview the date
  // they're committing to — same date appears on the final signed PDF.
  const footerY = MARGIN - 10;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 12 },
    end: { x: PAGE_W - MARGIN, y: footerY + 12 },
    thickness: 0.5,
    color: C_LINE,
  });
  page.drawText(`Document date: ${dateStr}.`, {
    x: MARGIN,
    y: footerY,
    size: 8,
    font: helv,
    color: C_LIGHT,
  });

  // --- Audit metadata in the info dict -----------------------------------
  // Visible PDF stays clean (just the date footer); machine-readable audit
  // trail rides in the info dict for any tooling that wants to inspect it.
  doc.setTitle(`Tattoo Consent Form — ${fullName(data.license) || 'Client'}`);
  doc.setAuthor(fullName(data.license) || '');
  doc.setSubject('Tattoo consent form');
  doc.setCreator(headerTitle);
  doc.setProducer('Ink Bloop consent form generator');
  doc.setCreationDate(data.signedAt);
  doc.setModificationDate(data.signedAt);

  if (opts.finalize) {
    const auditBlob = JSON.stringify({
      submission_id: data.submissionId,
      signed_at: data.signedAt.toISOString(),
      timezone: data.audit.timezone,
      client_ip: data.audit.clientIp,
      user_agent: data.audit.userAgent,
      signer_name: fullName(data.license),
    });
    // Stuffing the audit blob into the Keywords field — it's part of the
    // standard PDF info dict, surfaced by every viewer's "document
    // properties" panel, and we use it as a single field rather than the
    // semantic "search keywords" because for a consent form the audit trail
    // is the most useful thing to put there.
    doc.setKeywords([auditBlob]);
  }

  return await doc.save();
}

/** Hex-encoded SHA-256 of the bytes. Used to record on the row for tamper
 *  detection — the artist (or a forensic check) can later re-hash the R2
 *  blob and compare against `consent_submissions.pdf_sha256`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer to satisfy the BufferSource type without
  // SharedArrayBuffer warnings.
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
