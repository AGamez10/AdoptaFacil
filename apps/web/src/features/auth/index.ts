// Auth feature (M02) — public authentication screens.
export { LoginPage } from './pages/login-page';
// Registro, recuperación, invitación y completar perfil se cargan al visitarlos
// (routes.tsx importa cada archivo directo): no van en la primera carga.

// Shared building blocks (also reusable by future auth screens).
export { AuthLayout, type AuthLayoutProps } from './components/auth-layout';
export { Field, type FieldProps } from './components/field';
export { FormAlert, type FormAlertProps } from './components/form-alert';
export {
  GoogleSignInButton,
  type GoogleSignInButtonProps,
  useGoogleSignInAvailable,
} from './components/google-sign-in-button';
export { WelcomeNotice } from './components/welcome-notice';
export * from './validation';
