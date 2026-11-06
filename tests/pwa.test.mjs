import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PWA & Subpath Compatibility', () => {
  it('validates manifest.webmanifest syntax and required PWA fields', () => {
    const raw = readFileSync(resolve('manifest.webmanifest'), 'utf-8');
    const manifest = JSON.parse(raw);

    assert.equal(manifest.name, 'MuaSamMini - Danh Sách Mua Sắm');
    assert.equal(manifest.short_name, 'MuaSamMini');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons && manifest.icons.length >= 2, 'Must have at least 2 icons');

    // Subpath safety checks
    assert.equal(manifest.start_url, './', 'start_url must be relative for subpath hosting');
    assert.equal(manifest.scope, './', 'scope must be relative for subpath hosting');

    for (const icon of manifest.icons) {
      assert.ok(!icon.src.startsWith('/'), `Icon src must not be root-absolute: ${icon.src}`);
      assert.ok(icon.src.startsWith('./'), `Icon src should be relative: ${icon.src}`);
      // Check that the icon file actually exists
      const cleanPath = icon.src.replace(/^\.\//, '');
      assert.ok(existsSync(resolve(cleanPath)), `Icon file must exist on disk: ${cleanPath}`);
    }
  });

  it('validates index.html does not contain root-absolute asset URLs', () => {
    const html = readFileSync(resolve('index.html'), 'utf-8');

    // Check href and src attributes
    const hrefMatches = [...html.matchAll(/href="(\/[^"]+)"/g)];
    const srcMatches = [...html.matchAll(/src="(\/[^"]+)"/g)];

    assert.equal(hrefMatches.length, 0, `Found root-absolute href: ${hrefMatches.map(m => m[1]).join(', ')}`);
    assert.equal(srcMatches.length, 0, `Found root-absolute src: ${srcMatches.map(m => m[1]).join(', ')}`);

    // Verify critical assets are linked relatively
    assert.ok(html.includes('href="./manifest.webmanifest"'));
    assert.ok(html.includes('href="./css/style.css"'));
    assert.ok(html.includes('src="./js/app.js"'));
  });

  it('validates sw.js static asset cache list and subpath safety', () => {
    const swContent = readFileSync(resolve('sw.js'), 'utf-8');

    // Ensure cache name is versioned
    assert.ok(swContent.includes('CACHE_NAME = \'muasammini-shell-v1\''));

    // Extract STATIC_ASSETS array
    const match = swContent.match(/const STATIC_ASSETS = \[\s*([\s\S]*?)\s*\];/);
    assert.ok(match, 'STATIC_ASSETS array must be defined in sw.js');

    const assetStrings = match[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    assert.ok(assetStrings.length >= 8, 'STATIC_ASSETS must include all app shell components');

    for (const asset of assetStrings) {
      assert.ok(!asset.startsWith('/'), `SW asset must not be root-absolute: ${asset}`);
      assert.ok(asset.startsWith('./'), `SW asset must be relative: ${asset}`);

      if (asset !== './') {
        const cleanPath = asset.replace(/^\.\//, '');
        assert.ok(existsSync(resolve(cleanPath)), `Cached asset must exist on disk: ${cleanPath}`);
      }
    }
  });

  it('verifies sw.js does not cache or transmit user data', () => {
    const swContent = readFileSync(resolve('sw.js'), 'utf-8');
    assert.ok(!swContent.includes('muasammini_v1_data'), 'SW must not reference localStorage keys');
    assert.ok(!swContent.includes('localStorage'), 'SW has no business reading localStorage');
  });

  it('verifies sw.js activate cleans only muasammini caches, avoids deleting unrelated origin caches', () => {
    const swContent = readFileSync(resolve('sw.js'), 'utf-8');
    assert.ok(
      swContent.includes("name.startsWith(CACHE_PREFIX)"),
      'SW activate must only delete caches matching CACHE_PREFIX'
    );
  });

  it('verifies sw.js offline fallback returns a valid Response and handles navigate mode safely', () => {
    const swContent = readFileSync(resolve('sw.js'), 'utf-8');
    assert.ok(
      !swContent.includes("caches.match('./index.html') || caches.match('./')"),
      'SW fetch must not do Promise || Promise'
    );
    assert.ok(
      swContent.includes("new Response('Offline - Nội dung không khả dụng'"),
      'SW fetch catch handler must return a fallback Response'
    );
  });

  it('verifies sw.js does not dynamically cache arbitrary origin GET requests', () => {
    const swContent = readFileSync(resolve('sw.js'), 'utf-8');
    assert.ok(
      !swContent.includes("cache.put(event.request"),
      'SW fetch handler must not cache arbitrary network requests dynamically'
    );
  });
});
