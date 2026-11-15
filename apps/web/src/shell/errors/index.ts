// Pantallas de error de la navegación: 404, 403, 500, sin conexión y versión nueva.
export {
  ErrorScreen,
  type ErrorAction,
  type ErrorKind,
  type ErrorScreenProps,
  type ErrorSuggestion,
} from './error-screen';
export { PublicErrorPage, PublicNotFoundPage, PUBLIC_SUGGESTIONS } from './public-error-page';
export { NotFoundRoute, ShellNotFoundContent } from './not-found-route';
export {
  AppErrorFallback,
  RootErrorBoundary,
  RouteErrorBoundary,
  ShellContentErrorFallback,
  SilentErrorBoundary,
  errorScreenFor,
} from './error-fallbacks';
export { isChunkLoadError, isOffline } from './chunk-error';
