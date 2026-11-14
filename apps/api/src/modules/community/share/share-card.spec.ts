import sharp from 'sharp';
import { PostType, type PublicCommunityPost } from '@adoptafacil/contracts';
import { buildShareCardSvg, renderShareCard } from './share-card';

const post: PublicCommunityPost = {
  id: '11111111-1111-4111-8111-111111111111',
  authorDisplayName: 'Huellitas',
  isOrganization: true,
  type: PostType.Event,
  title: 'Jornada de adopción',
  body: 'Ven a conocer a los peludos que buscan hogar este sábado en el parque.',
  images: [],
  likeCount: 0,
  commentCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
};

async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#cc8844' } })
    .jpeg()
    .toBuffer();
}

describe('share card photo', () => {
  it('keeps the brand illustration when there is no photo', () => {
    const svg = buildShareCardSvg(post, 'adoptafacil.co');
    expect(svg).not.toContain('clip-path="url(#photo)"');
  });

  it('puts the post photo in the right panel when there is one', () => {
    const svg = buildShareCardSvg(post, 'adoptafacil.co', 'AAAA');
    expect(svg).toContain('clip-path="url(#photo)"');
    expect(svg).toContain('data:image/jpeg;base64,AAAA');
  });

  it('renders a 1200×630 PNG with the photo, and survives an unreadable file', async () => {
    const withPhoto = await renderShareCard(post, 'adoptafacil.co', await photo());
    const meta = await sharp(withPhoto).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'png']);
    const broken = await renderShareCard(post, 'adoptafacil.co', Buffer.from('no soy una imagen'));
    expect((await sharp(broken).metadata()).width).toBe(1200);
  });
});
