import { useState } from 'react';
import { Link } from 'react-router';
import { useLocation } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import {
  BarChartIcon,
  BrandMark,
  ClockIcon,
  MoonIcon,
  PersonIcon,
  SunIcon,
  TagIcon,
} from '@/components/icons';

export function Navbar() {
  const { isLoggedIn, displayName, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const { pathname } = useLocation();

  // Replaces Bootstrap's data-bs-toggle="collapse", so we don't need to ship
  // bootstrap.bundle.js just for the mobile menu.
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="navbar navbar-expand-md sticky-top">
      <div className="container-sm">
        <Link
          className="navbar-brand d-flex align-items-center gap-2 fw-bold"
          to="/dashboard"
          onClick={() => setOpen(false)}
        >
          <BrandMark size={28} />
          <span className="brand-name">Tracksesh</span>
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-controls="navMenu"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div className={`collapse navbar-collapse${open ? ' show' : ''}`} id="navMenu">
          <ul className="navbar-nav ms-auto align-items-center gap-1">
            {isLoggedIn ? (
              <>
                <li className="nav-item">
                  <Link
                    className={`nav-link${isActive('/dashboard') ? ' active' : ''}`}
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                  >
                    <ClockIcon className="me-1" size={15} />
                    Timer
                  </Link>
                </li>

                <li className="nav-item">
                  <Link
                    className={`nav-link${isActive('/activity') ? ' active' : ''}`}
                    to="/activity"
                    onClick={() => setOpen(false)}
                  >
                    <BarChartIcon className="me-1" size={14} />
                    Activity
                  </Link>
                </li>

                <li className="nav-item">
                  <Link
                    className={`nav-link${isActive('/tags') ? ' active' : ''}`}
                    to="/tags"
                    onClick={() => setOpen(false)}
                  >
                    <TagIcon className="me-1" size={14} />
                    Tags
                  </Link>
                </li>

                <li className="nav-item">
                  <Link
                    className={`nav-link${isActive('/account') ? ' active' : ''}`}
                    to="/account"
                    onClick={() => setOpen(false)}
                  >
                    <PersonIcon className="me-1" size={14} />
                    Account
                  </Link>
                </li>

                <li className="nav-item">
                  <span className="nav-user-name d-none d-lg-inline-block px-2 text-muted small">
                    Welcome back, {displayName}
                  </span>
                </li>

                <li className="nav-item">
                  <button className="btn btn-outline-danger btn-sm ms-1" onClick={() => logout()}>
                    Sign out
                  </button>
                </li>
              </>
            ) : (
              <>
                <li className="nav-item">
                  <Link
                    className={`nav-link${isActive('/login') ? ' active' : ''}`}
                    to="/login"
                    onClick={() => setOpen(false)}
                  >
                    Sign in
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className="btn btn-accent btn-sm ms-1"
                    to="/register"
                    onClick={() => setOpen(false)}
                  >
                    Get started
                  </Link>
                </li>
              </>
            )}

            <li className="nav-item ms-2">
              <button
                className="btn btn-theme-toggle"
                onClick={toggle}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? <SunIcon size={18} /> : <MoonIcon size={17} />}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
