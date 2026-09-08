import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';

// AuthProvider sits outside RouterProvider in main.tsx and cannot call
// useNavigate/useLocation itself, so this component carries the redirect
// from inside the router tree instead.
export const DisabledAccountRedirect = () => {
  const { disabledReason } = useAuth();
  const location = useLocation();
  if (disabledReason && location.pathname !== '/login') return <Navigate to="/login" state={{ disabled: true }} replace />;
  return null;
};
