import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triggerBrowserDownload } from '../../../src/utils/downloadUtils.js';

describe('Clip Download Fix & Session Verification Prevention Test Suite', () => {
  it('throws an error if download URL is empty or null', async () => {
    await assert.rejects(
      async () => triggerBrowserDownload(''),
      /Download URL is required/i
    );
  });

  it('triggers native stream download via hidden iframe for signed URLs without premature revocation', async () => {
    let appendedElement: any = null;

    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalSetTimeout = globalThis.setTimeout;

    try {
      (globalThis as any).setTimeout = (fn: Function) => {
        try { fn(); } catch {}
        return 1 as any;
      };

      (globalThis as any).window = {};

      const mockIframe: any = {
        style: {},
        src: '',
      };

      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'iframe') return mockIframe;
          return {};
        },
        body: {
          appendChild: (el: any) => {
            appendedElement = el;
          },
          removeChild: () => {},
          contains: () => true,
        },
      };

      await triggerBrowserDownload('https://r2.cloudflarestorage.com/clips/rendered.mp4', 'full-clip.mp4');

      assert.equal(appendedElement, mockIframe, 'Hidden iframe must be appended for native stream download');
      assert.equal(mockIframe.src, 'https://r2.cloudflarestorage.com/clips/rendered.mp4');
      assert.equal(mockIframe.style.opacity, '0');
      assert.equal(mockIframe.style.position, 'fixed');
    } finally {
      (globalThis as any).window = originalWindow;
      (globalThis as any).document = originalDocument;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('triggers direct anchor download for blob: URLs', async () => {
    let clickCalled = false;
    let appendedElement: any = null;

    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalSetTimeout = globalThis.setTimeout;

    try {
      (globalThis as any).setTimeout = (fn: Function) => {
        try { fn(); } catch {}
        return 1 as any;
      };

      (globalThis as any).window = {};

      const mockLink: any = {
        href: '',
        download: '',
        style: {},
        click: () => {
          clickCalled = true;
        },
      };

      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'a') return mockLink;
          return {};
        },
        body: {
          appendChild: (el: any) => {
            appendedElement = el;
          },
          removeChild: () => {},
          contains: () => true,
        },
      };

      await triggerBrowserDownload('blob:http://localhost:5173/uuid-1234', 'blob-clip.mp4');

      assert.ok(clickCalled, 'Anchor click must be called for blob: URL');
      assert.equal(mockLink.href, 'blob:http://localhost:5173/uuid-1234');
      assert.equal(mockLink.download, 'blob-clip.mp4');
      assert.equal(mockLink.style.display, 'none');
    } finally {
      (globalThis as any).window = originalWindow;
      (globalThis as any).document = originalDocument;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('verifies that multi-slice FFmpeg render does not truncate source input before slicing', async () => {
    // Read ClipRenderService implementation to verify -t renderDuration is output option
    const fs = await import('node:fs');
    const path = await import('node:path');
    const servicePath = path.resolve(process.cwd(), 'server/src/services/clipRenderService.ts');
    const content = fs.readFileSync(servicePath, 'utf8');

    // Make sure -t is NOT before ...graph.inputArgs for multi-slice
    assert.ok(
      !content.includes("isMultiSlice ? ['-t', renderDuration.toFixed(3)]"),
      'Must not put -t renderDuration before graph.inputArgs, which truncates the input source video'
    );

    // Make sure -t renderDuration is placed before outputPath
    assert.match(
      content,
      /'-t',\s*renderDuration\.toFixed\(3\),\s*outputPath/,
      'Must place -t renderDuration right before outputPath as an output limiter'
    );
  });
});
