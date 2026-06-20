import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.session()) return true;
  return router.createUrlTree(["/login"], { queryParams: { next: state.url } });
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const s = auth.session();
  return s && s.role === "admin" ? true : router.createUrlTree(["/"]);
};
