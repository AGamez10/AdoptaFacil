import sharp from 'sharp';
import { PostType, type PublicCommunityPost } from '@adoptafacil/contracts';
import type { ConfigService } from '@nestjs/config';
import type { StoragePort } from '../../core/storage/storage.port';
import { PublicCommunityController } from './public-community.controller';
import type { PublicCommunityService } from './public-community.service';

const post: PublicCommunityPost = {
  id: '11111111-1111-4111-8111-111111111111',
  authorDisplayName: 'Huellitas',
  isOrganization: true,
  type: PostType.Event,
  title: 'Jornada',
  body: 'Ven el sábado.',
  images: [{ id: 'img-1', kind: 'image', storageRef: 'public/org/x/foto.jpg' } as never],
  likeCount: 0,
  commentCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('GET /public/community/posts/:id/card.png (re-auditoría PR 166)', () => {
  it('peticiones anónimas repetidas no vuelven a leer ni decodificar la foto', async () => {
    const photo = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#88cc44' },
    })
      .jpeg()
      .toBuffer();
    const readObject = jest.fn().mockResolvedValue({ data: photo });
    const controller = new PublicCommunityController(
      { get: jest.fn().mockResolvedValue(post) } as unknown as PublicCommunityService,
      { readObject } as unknown as StoragePort,
      { get: () => 'https://adoptafacil.test' } as unknown as ConfigService,
    );
    await Promise.all(Array.from({ length: 5 }, () => controller.card(post.id)));
    await controller.card(post.id);
    expect(readObject).toHaveBeenCalledTimes(1);
  });
});
