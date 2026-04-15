/**
 * Email reply parser — extracts the new reply content from an email,
 * stripping quoted history, signatures, and forwarded content.
 *
 * Equivalent to Mailgun's Talon library but in pure TypeScript.
 */

// Patterns that indicate the start of quoted content
const QUOTE_HEADERS = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^On\s.+wrote:\s*$/im,
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s.+<.+@.+>.*:?\s*$/m,
  /^From:\s*.+$/im,
  /^Sent:\s*.+$/im,
  /^>{3,}/m,
];

// Patterns that indicate a signature block
const SIGNATURE_PATTERNS = [
  /^--\s*$/m, // standard sig delimiter
  /^_{2,}\s*$/m,
  /^Sent from my (iPhone|iPad|Galaxy|Android|Pixel)/im,
  /^Sent from Mail for Windows/im,
  /^Sent from Outlook/im,
  /^Get Outlook for/im,
  /^Sent from Yahoo Mail/im,
  /^Sent via/im,
];

/**
 * Extract the new reply content from a plain text email body.
 * Strips quoted history, signatures, and forwarded sections.
 */
export function extractReplyText(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const resultLines: string[] = [];
  let hitQuote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Check if this line starts a quoted section
    if (!hitQuote) {
      // Lines starting with > are quoted
      if (/^>/.test(trimmed)) {
        hitQuote = true;
        continue;
      }

      // Check quote header patterns
      let isQuoteHeader = false;
      for (const pattern of QUOTE_HEADERS) {
        if (pattern.test(trimmed)) {
          isQuoteHeader = true;
          break;
        }
      }
      if (isQuoteHeader) {
        hitQuote = true;
        continue;
      }

      // Check signature patterns
      let isSignature = false;
      for (const pattern of SIGNATURE_PATTERNS) {
        if (pattern.test(trimmed)) {
          isSignature = true;
          break;
        }
      }
      if (isSignature) {
        // Everything after signature is discarded
        break;
      }

      resultLines.push(line);
    }
  }

  // Trim trailing whitespace
  while (resultLines.length > 0 && resultLines[resultLines.length - 1].trim() === '') {
    resultLines.pop();
  }

  return resultLines.join('\n');
}

/**
 * Extract the new reply content from an HTML email body.
 * Strips blockquote elements and gmail_quote divs.
 */
export function extractReplyHtml(html: string): string {
  if (!html) return '';

  let result = html;

  // Remove Gmail-style quoted content
  result = result.replace(/<div\s+class="gmail_quote"[\s\S]*$/i, '');

  // Remove Outlook-style quoted content
  result = result.replace(/<div\s+id="appendonsend"[\s\S]*$/i, '');
  result = result.replace(/<div\s+style="border:none;border-top:solid\s+#[A-Fa-f0-9]+\s+1\.0pt[\s\S]*$/i, '');

  // Remove <blockquote> elements (standard quoted content)
  result = result.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

  // Remove "On ... wrote:" patterns in HTML
  result = result.replace(/<div[^>]*>On\s.+wrote:<\/div>/gi, '');
  result = result.replace(/<p[^>]*>On\s.+wrote:<\/p>/gi, '');

  // Clean up empty trailing elements
  result = result.replace(/(<br\s*\/?>|\s|&nbsp;)*$/i, '');
  result = result.replace(/(<div>\s*<\/div>)*$/i, '');
  result = result.replace(/(<p>\s*<\/p>)*$/i, '');

  return result.trim();
}
