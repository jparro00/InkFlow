// Generates the signed-consent PDF — the legal record of the form. Rendered
// client-side at submit time via @react-pdf/renderer (Helvetica only, no
// custom fonts to avoid CORS / loader complexity in the public anon flow).
//
// What's on the PDF:
//   - Header: studio/artist name (or generic title) + signed date
//   - Client identification: name + DOB
//   - Tattoo: location + description
//   - Waiver: every WAIVER_ITEMS row, with an [X] / [ ] indicator
//   - ESIGN disclosure block
//   - Signature: embedded PNG + typed name + audit footer
//
// What's NOT on the PDF:
//   - The license image — kept artist-only per product decision (PII the
//     client doesn't need on a copy they download).
//   - Server-side IP. The DB row carries client_ip captured by the edge fn,
//     but we'd have to re-mint the PDF after the insert to embed it. Audit
//     trail in the DB is sufficient; the PDF carries timestamp + UA.
//
// Theme: hard-coded white background + black text, regardless of the app
// theme. Same reasoning as the signature pad — this document needs to render
// the same in any context (download, print, archive).

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import {
  WAIVER_ITEMS,
  type WaiverChecksValue,
  type LicenseFieldsValue,
  type TattooDetailsValue,
} from './consentFormSchema';

const COLOR_BLACK = '#111111';
const COLOR_GREY = '#555555';
const COLOR_LIGHT = '#888888';
const COLOR_LINE = '#CCCCCC';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: COLOR_BLACK,
    padding: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR_LINE,
    paddingBottom: 12,
    marginBottom: 18,
  },
  studioName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  formTitle: {
    fontSize: 11,
    color: COLOR_GREY,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerMeta: {
    marginTop: 6,
    fontSize: 9,
    color: COLOR_GREY,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    color: COLOR_BLACK,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  fieldLabel: {
    width: 110,
    color: COLOR_GREY,
  },
  fieldValue: {
    flex: 1,
    color: COLOR_BLACK,
  },
  descriptionBlock: {
    marginTop: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: COLOR_LINE,
    borderRadius: 2,
    minHeight: 48,
    color: COLOR_BLACK,
  },
  waiverRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  waiverBox: {
    width: 12,
    fontFamily: 'Helvetica-Bold',
    marginRight: 8,
    color: COLOR_BLACK,
  },
  waiverText: {
    flex: 1,
  },
  esignBox: {
    marginTop: 4,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 2,
    fontSize: 9,
    color: COLOR_GREY,
  },
  signatureBlock: {
    marginTop: 4,
  },
  signatureImageWrap: {
    borderWidth: 1,
    borderColor: COLOR_LINE,
    borderRadius: 2,
    height: 90,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  signatureImage: {
    height: '100%',
    objectFit: 'contain',
  },
  signatureMeta: {
    marginTop: 8,
    fontSize: 9,
    color: COLOR_GREY,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: COLOR_LIGHT,
    borderTopWidth: 1,
    borderTopColor: COLOR_LINE,
    paddingTop: 6,
  },
});

interface ConsentPDFData {
  studioName: string;
  signedAt: Date;
  license: LicenseFieldsValue;
  tattoo: TattooDetailsValue;
  waiver: WaiverChecksValue;
  /** PNG signature data URL produced by SignaturePad.toBlob → readAsDataURL. */
  signatureDataUrl: string | null;
  audit: {
    userAgent: string;
    timezone: string;
  };
}

function fullName(license: LicenseFieldsValue): string {
  return [license.first_name, license.last_name].filter(Boolean).join(' ').trim();
}

function ConsentDocument({ data }: { data: ConsentPDFData }) {
  const headerTitle = data.studioName.trim() || 'Tattoo studio';
  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.studioName}>{headerTitle}</Text>
          <Text style={styles.formTitle}>Tattoo Consent Form</Text>
          <Text style={styles.headerMeta}>
            Signed {format(data.signedAt, 'PPP')} at {format(data.signedAt, 'p')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name</Text>
            <Text style={styles.fieldValue}>{fullName(data.license) || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Date of birth</Text>
            <Text style={styles.fieldValue}>{data.license.dob || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tattoo</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Location</Text>
            <Text style={styles.fieldValue}>{data.tattoo.location || '—'}</Text>
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Description</Text>
          <View style={styles.descriptionBlock}>
            <Text>{data.tattoo.description || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consent statements</Text>
          {WAIVER_ITEMS.map((item) => {
            const checked = data.waiver[item.key] === true;
            return (
              <View key={item.key} style={styles.waiverRow}>
                <Text style={styles.waiverBox}>{checked ? '[X]' : '[ ]'}</Text>
                <Text style={styles.waiverText}>{item.label}</Text>
              </View>
            );
          })}
          <View style={styles.esignBox}>
            <Text>
              Electronic signatures are legally binding under the U.S. ESIGN Act and the Uniform
              Electronic Transactions Act (UETA). By signing below, you affirm your intent to sign
              this form, that you are doing so voluntarily, and that you may withdraw consent or
              request a paper copy of this signed form from the studio at any time.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signature</Text>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureImageWrap}>
              {data.signatureDataUrl ? (
                <Image src={data.signatureDataUrl} style={styles.signatureImage} />
              ) : (
                <Text style={{ color: COLOR_LIGHT }}>(no signature)</Text>
              )}
            </View>
            <Text style={styles.signatureMeta}>
              Signed by {fullName(data.license) || '—'} on {format(data.signedAt, 'PPP')}.
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Audit · {format(data.signedAt, 'PPpp')} · {data.audit.timezone} · UA: {data.audit.userAgent}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Renders the consent document to a PDF Blob. */
export async function generateConsentPdfBlob(data: ConsentPDFData): Promise<Blob> {
  return await pdf(<ConsentDocument data={data} />).toBlob();
}

/** Convert a PNG Blob to a data URL for embedding in the PDF. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
