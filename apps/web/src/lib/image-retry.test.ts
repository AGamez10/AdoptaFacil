import { afterEach, describe, expect, it, vi } from 'vitest';
import { installImageRetry, isStorageImage, retryUrl } from './image-retry';

const SRC = 'http://localhost:3000/storage/public?key=public%2Forg%2Ffoto.webp';

describe('image retry', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('only retries API storage images', () => {
    expect(isStorageImage(SRC)).toBe(true);
    expect(isStorageImage('https://otro.example.com/foto.jpg')).toBe(false);
    expect(isStorageImage('data:image/png;base64,AAAA')).toBe(false);
    expect(retryUrl(SRC, 2)).toBe(`${SRC}&r=2`);
  });

  it('asks again twice with growing delays, then gives up', () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const win = {
      addEventListener: target.addEventListener.bind(target),
      setTimeout: ((fn: () => void, ms: number) =>
        setTimeout(fn, ms)) as unknown as Window['setTimeout'],
    };
    installImageRetry(win as never, [100, 300]);
    const img = document.createElement('img');
    img.src = SRC;
    document.body.append(img);
    const fail = () => {
      const ev = new Event('error');
      Object.defineProperty(ev, 'target', { value: img });
      target.dispatchEvent(ev);
    };

    fail();
    vi.advanceTimersByTime(99);
    expect(img.src).toBe(SRC);
    vi.advanceTimersByTime(1);
    expect(img.src).toBe(`${SRC}&r=1`);

    fail();
    vi.advanceTimersByTime(300);
    expect(img.src).toBe(`${SRC}&r=2`);

    fail();
    vi.advanceTimersByTime(5000);
    expect(img.src).toBe(`${SRC}&r=2`);
  });

  it('leaves foreign images and removed images alone', () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    installImageRetry(
      { addEventListener: target.addEventListener.bind(target), setTimeout } as never,
      [10],
    );
    const other = document.createElement('img');
    other.src = 'https://otro.example.com/foto.jpg';
    const gone = document.createElement('img');
    gone.src = SRC;
    for (const img of [other, gone]) {
      const ev = new Event('error');
      Object.defineProperty(ev, 'target', { value: img });
      target.dispatchEvent(ev);
    }
    vi.advanceTimersByTime(50);
    expect(other.src).toBe('https://otro.example.com/foto.jpg');
    expect(gone.src).toBe(SRC);
  });
});
