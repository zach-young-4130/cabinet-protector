import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Admin status is verified against the server on every /admin entry —
// localStorage and in-memory client state are never trusted for routing.
export const adminGuard: CanActivateFn = async () => {
  const isAdmin = await inject(AuthService).verifyAdmin();
  return isAdmin ? true : inject(Router).createUrlTree(['/home']);
};
