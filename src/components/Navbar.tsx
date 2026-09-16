import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/icons';

const links = [
  ['/dashboard', 'Timer'],
  ['/activity', 'Activity'],
  ['/tags', 'Tags'],
  ['/account', 'Account'],
];

export function Navbar() {
  const { isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <nav className="app-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <Link className="navbar-brand" to="/" onClick={() => setOpen(false)}>
            <BrandMark size={24} />
            <span>Tracksesh</span>
          </Link>
          <button
            className="btn btn-ghost nav-menu-toggle"
            type="button"
            onClick={() => setOpen(!open)}
            aria-controls="navMenu"
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <div className={`nav-menu${open ? ' is-open' : ''}`} id="navMenu">
            <div className="nav-links">
              {(isLoggedIn
                ? links
                : [
                    ['/', 'Home'],
                    ['/login', 'Sign in'],
                    ['/register', 'Get started'],
                  ]
              ).map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className="nav-link"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
            </div>
            {isLoggedIn && (
              <div className="nav-utilities">
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setOpen(false);
                    void logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
