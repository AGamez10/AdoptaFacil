import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PostImage } from '@adoptafacil/contracts';
import { MediaGallery } from './media-gallery';

const photo = (n: number): PostImage => ({
  id: `i${n}`,
  storageRef: `k${n}`,
  url: `/p${n}.jpg`,
  order: n,
});
const video: PostImage = {
  id: 'v',
  storageRef: 'kv',
  url: '/v.mp4',
  order: 0,
  kind: 'video',
  posterUrl: '/v.poster.webp',
  durationSeconds: 75,
};

describe('MediaGallery', () => {
  it('renders nothing without media', () => {
    const { container } = render(<MediaGallery media={[]} authorName="Ana" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a video tile with its poster and duration, and plays it in a lightbox', () => {
    render(<MediaGallery media={[video]} authorName="Ana" />);
    expect(screen.getByTestId('post-video')).toBeInTheDocument();
    expect(screen.getByText('1:15')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('post-video'));
    const player = screen.getByTestId('post-video-player') as HTMLVideoElement;
    expect(player.getAttribute('src')).toBe('/v.mp4');
  });

  it('collapses 5+ photos into four tiles with a "+N" badge', () => {
    render(<MediaGallery media={[0, 1, 2, 3, 4, 5].map(photo)} authorName="Ana" />);
    expect(screen.getAllByTestId('post-photo')).toHaveLength(4);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
