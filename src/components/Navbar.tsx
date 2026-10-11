import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { BrandMark, SunIcon, TagIcon, ListCheckIcon, BarChartIcon, PersonIcon } from './icons';

const links = [
  { to: '/dashboard', label: 'Today', icon: SunIcon, alias: '' },
  { to: '/subjects', label: 'Subjects', icon: TagIcon, alias: '/tags' },
  { to: '/planner', label: 'Planner', icon: ListCheckIcon, alias: '' },
  { to: '/insights', label: 'Insights', icon: BarChartIcon, alias: '/activity' },
];
export function Navbar() {
  const { isLoggedIn, logout, displayName } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <nav className={`app-nav${isLoggedIn ? ' suite-nav' : ''}`} aria-label="Main navigation">
        <div className="nav-inner">
          <Link className="navbar-brand" to="/" onClick={() => setOpen(false)}>
            <BrandMark size={28} />
            <span>Tracksesh</span>
          </Link>
          {isLoggedIn && <span className="suite-caption">A little more intentional.</span>}
          <button
            className="btn btn-ghost nav-menu-toggle"
            aria-controls="navMenu"
            aria-expanded={open}
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <div className={`nav-menu${open ? ' is-open' : ''}`} id="navMenu">
            {isLoggedIn ? (
              <>
                <p className="nav-section-label">Study workspace</p>
                <div className="nav-links">
                  {links.map(({ to, label, icon: Icon, alias }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `nav-link${isActive || pathname === alias ? ' active' : ''}`
                      }
                      aria-current={pathname === alias ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <Icon size={19} aria-hidden="true" />
                      {label}
                    </NavLink>
                  ))}
                </div>
                <div className="sidebar-note">
                  <span className="eyebrow">Make a little room.</span>
                  <p>Small sessions become something bigger.</p>
                  <Link to="/planner" onClick={() => setOpen(false)}>
                    Find your rhythm →
                  </Link>
                </div>
                <div className="nav-utilities">
                  <span className="nav-person">{displayName}</span>
                  <NavLink to="/account" className="nav-link" onClick={() => setOpen(false)}>
                    <PersonIcon size={18} aria-hidden="true" />
                    Account
                  </NavLink>
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
              </>
            ) : (
              <div className="nav-links">
                {[
                  ['/', 'Home'],
                  ['/login', 'Sign in'],
                  ['/register', 'Get started'],
                ].map(([to, label]) => (
                  <NavLink key={to} to={to} end className="nav-link" onClick={() => setOpen(false)}>
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>
      {isLoggedIn && (
        <nav className="mobile-study-nav" aria-label="Study navigation">
          {links.map(({ to, label, icon: Icon, alias }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive || pathname === alias ? 'active' : '')}
              aria-current={pathname === alias ? 'page' : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
