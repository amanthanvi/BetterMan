import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  HamburgerMenuIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
  BookmarkIcon,
  GearIcon,
  SunIcon,
  MoonIcon,
  PersonIcon,
  ExitIcon,
  BellIcon,
  DownloadIcon,
  QuestionMarkCircledIcon,
  ActivityIcon,
  DashboardIcon,
  ReaderIcon,
  HomeIcon,
  GitHubLogoIcon,
  ArchiveIcon,
} from '@radix-ui/react-icons';
import { Command } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string | number;
  external?: boolean;
}

export const EnhancedNavbar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [notifications, setNotifications] = useState(3); // Mock notifications
  
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  
  const {
    theme,
    toggleTheme,
    setCommandPaletteOpen,
    favorites,
    isOffline,
  } = useAppStore();
  
  const { isAuthenticated, user, logout } = useAuthStore();

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCommandPaletteOpen]);

  const navItems: NavItem[] = [
    { label: 'Home', href: '/', icon: <HomeIcon className="w-4 h-4" /> },
    { label: 'Documentation', href: '/docs', icon: <ReaderIcon className="w-4 h-4" /> },
    { label: 'Favorites', href: '/favorites', icon: <BookmarkIcon className="w-4 h-4" />, badge: favorites.length || undefined },
    { label: 'Analytics', href: '/analytics', icon: <ActivityIcon className="w-4 h-4" /> },
  ];

  const userMenuItems = [
    { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon className="w-4 h-4" /> },
    { label: 'Settings', href: '/settings', icon: <GearIcon className="w-4 h-4" /> },
    { label: 'Downloads', href: '/downloads', icon: <DownloadIcon className="w-4 h-4" /> },
    { label: 'Help', href: '/help', icon: <QuestionMarkCircledIcon className="w-4 h-4" /> },
  ];

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  return (
    <>
      <nav
        ref={navRef}
        className={cn(
          'fixed top-0 left-0 right-0 z-40',
          'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md',
          'border-b transition-all duration-300',
          isScrolled 
            ? 'border-gray-200 dark:border-gray-700 shadow-lg' 
            : 'border-transparent'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <div className="flex items-center space-x-8">
              <Link
                to="/"
                className="flex items-center space-x-3 group"
              >
                <div className="relative"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Command className="w-6 h-6 text-white" />
                  </div>
                  {isOffline && (
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  BetterMan
                </span>
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center space-x-1">
                {navItems.map((item) => (
                  <NavLink key={item.href} item={item} isActive={location.pathname === item.href} />
                ))}
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-2">
              {/* Search Button */}
              <button>
                onClick={() => setCommandPaletteOpen(true)}
                className={cn(
                  'hidden sm:flex items-center space-x-2 px-4 py-2',
                  'bg-gray-100 dark:bg-gray-800 rounded-lg',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'transition-colors'
                )}
              >
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Search...</span>
                <kbd className="hidden lg:inline-flex items-center px-2 py-0.5 text-xs bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
                  ⌘K
                </kbd>
              </button>

              {/* Notifications */}
              {isAuthenticated && (
                <NotificationButton count={notifications} />
              )}

              {/* Theme Toggle */}
              <button>
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <SunIcon className="w-5 h-5" />
                ) : (
                  <MoonIcon className="w-5 h-5" />
                )}
              </button>

              {/* User Menu */}
              {isAuthenticated ? (
                <UserMenu user={user} menuItems={userMenuItems} onLogout={handleLogout} />
              ) : (
                <Link
                  to="/login"
                  className={cn(
                    'hidden sm:flex items-center space-x-2 px-4 py-2',
                    'bg-blue-600 text-white rounded-lg',
                    'hover:bg-blue-700 transition-colors'
                  )}
                >
                  <PersonIcon className="w-4 h-4" />
                  <span>Sign In</span>
                </Link>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {isMobileMenuOpen ? (
                  <Cross2Icon className="w-5 h-5" />
                ) : (
                  <HamburgerMenuIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <>
          {isMobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 dark:border-gray-700"
            >
              <div className="px-4 py-4 space-y-2 bg-white dark:bg-gray-900">
                {navItems.map((item) => (
                  <MobileNavLink key={item.href}
                    item={item}
                    isActive={location.pathname === item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                  />
                ))}
                
                {!isAuthenticated && (
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center space-x-3 px-4 py-3',
                      'bg-blue-600 text-white rounded-lg',
                      'hover:bg-blue-700 transition-colors'
                    )}
                  >
                    <PersonIcon className="w-5 h-5" />
                    <span>Sign In</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      </nav>

      {/* Spacer */}
      <div className="h-16" />
    </>
  );
};

// Desktop Navigation Link
const NavLink: React.FC<{ item: NavItem; isActive: boolean } = ({ item, isActive }) => (
  <Link
    to={item.href}
    className={cn(
      'flex items-center space-x-2 px-3 py-2 rounded-lg',
      'transition-all duration-200',
      isActive
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
    )}
  >
    {item.icon}
    <span className="text-sm font-medium">{item.label}</span>
    {item.badge && (
      <Badge variant="secondary" size="sm">
        {item.badge}
      </Badge>
    )}
  </Link>
);

// Mobile Navigation Link
const MobileNavLink: React.FC<{ 
  item: NavItem; 
  isActive: boolean; 
  onClick: () => void;
} = ({ item, isActive, onClick }) => (
  <Link
    to={item.href}
    onClick={onClick}
    className={cn(
      'flex items-center space-x-3 px-4 py-3 rounded-lg',
      'transition-all duration-200',
      isActive
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
    )}
  >
    {item.icon}
    <span className="font-medium">{item.label}</span>
    {item.badge && (
      <Badge variant="secondary" size="sm" className="ml-auto">
        {item.badge}
      </Badge>
    )}
  </Link>
);

// Notification Button
const NotificationButton: React.FC<{ count: number } = ({ count }) => (
  <button> className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
  >
    <BellIcon className="w-5 h-5" />
    {count > 0 && (
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    )}
  </button>
);

// User Menu
const UserMenu: React.FC<{
  user: any;
  menuItems: NavItem[];
  onLogout: () => void;
} = ({ user, menuItems, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}
      <button>
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center space-x-2 p-2 rounded-lg',
          'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
        )}
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">
            {user?.name?.charAt(0) || 'U'}
          </span>
        </div>
      </button>

      <>
        {isOpen && (
          <div className={cn(
              'absolute right-0 mt-2 w-64',
              'bg-white dark:bg-gray-800 rounded-xl shadow-lg',
              'border border-gray-200 dark:border-gray-700',
              'overflow-hidden'
            )}
          >
            {/* User Info */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map((item) => (
                <Link key={item.href}
                    to={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center space-x-3 px-4 py-2',
                    'hover:bg-gray-100 dark:hover:bg-gray-700',
                    'transition-colors'
                  )}
                >
                  {item.icon}
                  <span className="text-sm">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Logout */}
            <div className="border-t border-gray-200 dark:border-gray-700 py-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className={cn(
                  'flex items-center space-x-3 px-4 py-2 w-full',
                  'hover:bg-gray-100 dark:hover:bg-gray-700',
                  'transition-colors text-red-600 dark:text-red-400'
                )}
              >
                <ExitIcon className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </>
    </div>
  );
};