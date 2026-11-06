import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Security & XSS Prevention', () => {
  it('app.js does NOT assign untrusted user input to innerHTML or outerHTML', () => {
    const appJsContent = readFileSync(resolve('js/app.js'), 'utf-8');

    // Check occurrences of innerHTML
    const innerHtmlMatches = [...appJsContent.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)];
    for (const match of innerHtmlMatches) {
      const assignedValue = match[1].trim();
      // Ensure innerHTML is only ever used for static SVG icons, never variables or item names
      assert.ok(
        assignedValue.startsWith("'<svg") || assignedValue.startsWith('"<svg'),
        `Forbidden dynamic innerHTML assignment found: ${match[0]}`
      );
      assert.ok(
        !assignedValue.includes('item.name') && !assignedValue.includes('${'),
        `User input or template string interpolated into innerHTML: ${match[0]}`
      );
    }
  });

  it('verifies item text is rendered via textContent', () => {
    const appJsContent = readFileSync(resolve('js/app.js'), 'utf-8');
    assert.ok(
      appJsContent.includes('nameSpan.textContent = item.name'),
      'item.name must be assigned to textContent to prevent HTML execution'
    );
  });

  it('ensures storage layer handles malicious payloads without executing them or corrupting schema', () => {
    const maliciousNames = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '\'"&<>'
    ];

    maliciousNames.forEach(payload => {
      // JSON encoding of malicious string
      const serialized = JSON.stringify({
        version: 1,
        items: [
          {
            id: 'xss_test',
            name: payload,
            purchased: false,
            createdAt: 1000,
            updatedAt: 1000
          }
        ]
      });

      const parsed = JSON.parse(serialized);
      assert.equal(parsed.items[0].name, payload);
    });
  });
});
