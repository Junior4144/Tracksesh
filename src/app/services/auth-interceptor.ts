import { HttpInterceptorFn } from '@angular/common/http';

// Auth is handled via HttpOnly cookies (withCredentials: true set per-request).
// No Bearer token header needed.
export const authInterceptor: HttpInterceptorFn = (req, next) => next(req);
