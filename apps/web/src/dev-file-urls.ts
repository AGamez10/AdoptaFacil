import { installDevFileUrlRebase } from './lib/file-url';

// Va primero en main.tsx: debe envolver `fetch` antes de que el shell lo tome.
if (import.meta.env.DEV) {
  installDevFileUrlRebase(import.meta.env.VITE_API_URL ?? 'http://localhost:3000');
}
