import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COMMUNITY_POINTS,
  POST_TYPES,
  PostType,
  communityTier,
  type PublicCommunityLeader,
  type PublicCommunityPost,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { listPublicLeaders, listPublicPosts } from '../../community/api/public-community';
import { publicPostPath, shareLink, shareTargets, shareText } from '../../community/lib/share';
import { IconArrowRight, IconChat, IconHeart } from './landing-icons';
import styles from './community.module.scss';

/** Ancla de la sección (la usan el menú y los enlaces compartidos). */
export const LANDING_SOCIAL_ID = 'comunidad';

const TYPE_LABEL: Record<PostType, string> = {
  [PostType.General]: 'Historias',
  [PostType.Campaign]: 'Campañas',
  [PostType.Notice]: 'Avisos',
  [PostType.Event]: 'Eventos',
};

const TYPE_TONE: Record<PostType, string> = {
  [PostType.General]: 'mint',
  [PostType.Campaign]: 'coral',
  [PostType.Notice]: 'sun',
  [PostType.Event]: 'sky',
};

const MEDALS = ['🥇', '🥈', '🥉'];

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : flat;
}

function initial(name: string): string {
  return (name.trim()[0] ?? '·').toUpperCase();
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;
}

/** Pide datos solo cuando el visitante se acerca (no compite con el hero). */
function useNearViewport() {
  const ref = useRef<HTMLElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return { ref, near };
}

function ShareRow({ post }: { post: PublicCommunityPost }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(post);
  const whatsapp = shareTargets(post.id, text).find((t) => t.network === 'whatsapp');
  const facebook = shareTargets(post.id, text).find((t) => t.network === 'facebook');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(post.id, 'copy'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.share} role="group" aria-label="Compartir esta publicación">
      <span className={styles.share__label}>Compartir</span>
      {[whatsapp, facebook].map(
        (target) =>
          target && (
            <a
              key={target.network}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.share__btn}
            >
              {target.label}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ),
      )}
      <button type="button" className={styles.share__btn} onClick={() => void copy()}>
        {copied ? 'Enlace copiado' : 'Copiar enlace'}
      </button>
    </div>
  );
}

function PostCard({ post }: { post: PublicCommunityPost }) {
  const image = post.images[0];
  const extra = post.images.length - 1;
  return (
    <li className={cn(styles.post, 'af-reveal')} data-tone={TYPE_TONE[post.type]}>
      <article className={styles.post__card}>
        <Link
          to={publicPostPath(post.id)}
          className={styles.post__link}
          data-testid="landing-social-post"
        >
          {image?.url && (
            <span className={styles.post__media}>
              <img
                src={image.url}
                alt={`Foto de la publicación de ${post.authorDisplayName}`}
                loading="lazy"
                className={styles.post__image}
              />
              {extra > 0 && (
                <span className={styles.post__more}>
                  +{extra} {extra === 1 ? 'foto' : 'fotos'}
                </span>
              )}
            </span>
          )}
          <span className={styles.post__body}>
            <span className={styles.post__head}>
              <span className={styles.avatar} aria-hidden="true">
                {initial(post.authorDisplayName)}
              </span>
              <span className={styles.post__author}>
                <strong>{post.authorDisplayName}</strong>
                <span>{post.isOrganization ? 'Organización' : 'Comunidad'}</span>
              </span>
              <span className={styles.chip} data-tone={TYPE_TONE[post.type]}>
                {TYPE_LABEL[post.type] ?? 'Comunidad'}
              </span>
            </span>
            {post.title && <span className={styles.post__title}>{clip(post.title, 80)}</span>}
            <span className={styles.post__text}>{clip(post.body, 160)}</span>
            <span className={styles.post__foot}>
              <span aria-label={plural(post.likeCount, 'me gusta', 'me gusta')}>
                <IconHeart aria-hidden="true" /> {post.likeCount.toLocaleString('es-CO')}
              </span>
              <span aria-label={plural(post.commentCount, 'comentario', 'comentarios')}>
                <IconChat aria-hidden="true" /> {post.commentCount.toLocaleString('es-CO')}
              </span>
              <span className={styles.post__cta}>
                Ver y comentar <IconArrowRight aria-hidden="true" />
              </span>
            </span>
          </span>
        </Link>
        <ShareRow post={post} />
      </article>
    </li>
  );
}

function Leaderboard({ leaders }: { leaders: PublicCommunityLeader[] }) {
  return (
    <aside
      className={styles.board}
      aria-labelledby="landing-social-board-title"
      data-testid="landing-social-leaders"
    >
      <h3 id="landing-social-board-title" className={styles.board__title}>
        Escalafón de la manada
      </h3>
      <p className={styles.board__lead}>Quienes más mueven la comunidad.</p>
      <ol className={styles.board__list}>
        {leaders.map((leader, index) => {
          const tier = communityTier(leader.points);
          return (
            <li key={`${leader.displayName}-${index}`} className={styles.leader}>
              <span className={styles.leader__rank} aria-hidden="true">
                {MEDALS[index] ?? index + 1}
              </span>
              <span className={styles.avatar} aria-hidden="true">
                {initial(leader.displayName)}
              </span>
              <span className={styles.leader__who}>
                <strong>{leader.displayName}</strong>
                <span className={styles.leader__tier} data-tier={tier.key}>
                  {tier.label}
                </span>
              </span>
              <span className={styles.leader__points}>
                {leader.points.toLocaleString('es-CO')}
                <small> pts</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.board__rules}>
        {COMMUNITY_POINTS.post} puntos por publicación pública, {COMMUNITY_POINTS.comment} por
        comentario recibido y {COMMUNITY_POINTS.like} por me gusta. Solo cuenta lo que cada quien
        decidió hacer público.
      </p>
    </aside>
  );
}

/**
 * Comunidad social en la landing: lo último que la gente y las organizaciones
 * decidieron hacer público (historias, campañas, avisos y eventos), con sus
 * me gusta y comentarios, filtrable por categoría, y el escalafón de quienes
 * más participan. Solo con el muro encendido (`communityWall`); sin
 * publicaciones públicas invita a ser la primera en publicar.
 */
export function CommunityWallSection() {
  const wallOn = useFeature('communityWall');
  const { ref, near } = useNearViewport();
  const [posts, setPosts] = useState<PublicCommunityPost[]>([]);
  const [leaders, setLeaders] = useState<PublicCommunityLeader[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<PostType | 'all'>('all');

  useEffect(() => {
    if (!near || !wallOn) return;
    const controller = new AbortController();
    Promise.allSettled([
      listPublicPosts(12, controller.signal).then((page) => setPosts(page.items.slice(0, 12))),
      listPublicLeaders(5, controller.signal).then((items) => setLeaders(items.slice(0, 5))),
    ]).then(() => {
      if (!controller.signal.aborted) setLoaded(true);
    });
    return () => controller.abort();
  }, [near, wallOn]);

  const types = useMemo(
    () => POST_TYPES.filter((type) => posts.some((post) => post.type === type)),
    [posts],
  );
  const visible = (filter === 'all' ? posts : posts.filter((p) => p.type === filter)).slice(0, 6);

  if (!wallOn) return null;

  return (
    <section
      ref={ref}
      id={LANDING_SOCIAL_ID}
      className={styles.social}
      aria-labelledby="landing-social-title"
      data-testid="landing-social"
    >
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Comunidad</p>
            <h2 id="landing-social-title" className={styles.head__title}>
              La manada comparte, comenta y se apoya.
            </h2>
            <p className={styles.head__lead}>
              Historias de adopción, campañas, avisos y eventos de personas y organizaciones de toda
              Colombia. Dale me gusta, comenta, compártelo en tus redes y sube en el escalafón.
            </p>
          </div>
          <Link to="/register" className={cn(styles.btn, styles['btn--ink'])}>
            Únete y publica
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>

        {types.length > 1 && (
          <div className={styles.filters} role="group" aria-label="Filtrar por categoría">
            <button
              type="button"
              className={styles.filter}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              Todo
            </button>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className={styles.filter}
                data-tone={TYPE_TONE[type]}
                aria-pressed={filter === type}
                onClick={() => setFilter(type)}
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>
        )}

        <div className={styles.layout} data-board={leaders.length > 0 ? 'true' : 'false'}>
          {!loaded ? (
            <ul className={styles.grid} aria-hidden="true">
              {[0, 1, 2].map((n) => (
                <li key={n} className={styles.skeleton} />
              ))}
            </ul>
          ) : visible.length > 0 ? (
            <ul className={styles.grid} aria-label="Publicaciones de la comunidad">
              {visible.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </ul>
          ) : (
            <div className={styles.empty} data-testid="landing-social-empty">
              <p className={styles.empty__title}>Aquí se verán las primeras historias.</p>
              <p className={styles.empty__text}>
                Cuenta cómo llegó tu mascota a casa, anuncia una jornada o pide ayuda para un
                rescate. Tú decides qué publicación se ve aquí.
              </p>
              <Link to="/register" className={styles.link}>
                Sé la primera persona en publicar
                <IconArrowRight aria-hidden="true" />
              </Link>
            </div>
          )}
          {leaders.length > 0 && <Leaderboard leaders={leaders} />}
        </div>
      </div>
    </section>
  );
}
