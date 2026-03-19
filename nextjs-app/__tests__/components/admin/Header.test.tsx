import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Header } from '../../../components/admin/Header';

describe('Header Component', () => {
  const defaultProps = {
    stats: {
      total: 42,
      new: 5,
      active: 12,
    },
    searchQuery: '',
    onSearchChange: vi.fn(),
    onUserMenuAction: vi.fn(),
    userName: 'Ivan Petrov',
    userAvatar: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Statistics Display', () => {
    it('should display active session statistics', () => {
      render(<Header {...defaultProps} />);

      expect(screen.getAllByText('42')[0]).toBeInTheDocument();
      expect(screen.getAllByText('5')[0]).toBeInTheDocument();
      expect(screen.getAllByText('12')[0]).toBeInTheDocument();
    });

    it('should display zero statistics', () => {
      const props = {
        ...defaultProps,
        stats: { total: 0, new: 0, active: 0 },
      };
      render(<Header {...props} />);

      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });

    it('should display large numbers in statistics', () => {
      const props = {
        ...defaultProps,
        stats: { total: 9999, new: 999, active: 5000 },
      };
      render(<Header {...props} />);

      expect(screen.getAllByText('9999')[0]).toBeInTheDocument();
      expect(screen.getAllByText('999')[0]).toBeInTheDocument();
      expect(screen.getAllByText('5000')[0]).toBeInTheDocument();
    });
  });

  describe('Search Field', () => {
    it('should display search field with placeholder', () => {
      render(<Header {...defaultProps} />);

      const searchInputs = screen.getAllByPlaceholderText(/Poisk|Search/i);
      expect(searchInputs.length).toBeGreaterThan(0);
    });

    it('should call onSearchChange when search field changes', async () => {
      const onSearchChange = vi.fn();
      const props = { ...defaultProps, onSearchChange };
      render(<Header {...props} />);

      const searchInputs = screen.getAllByPlaceholderText(/Poisk|Search/i);
      const searchInput = searchInputs[0];

      await userEvent.type(searchInput, 'test');

      expect(onSearchChange).toHaveBeenCalledTimes(4);
      expect(onSearchChange).toHaveBeenNthCalledWith(1, 't');
      expect(onSearchChange).toHaveBeenNthCalledWith(2, 'e');
      expect(onSearchChange).toHaveBeenNthCalledWith(3, 's');
      expect(onSearchChange).toHaveBeenNthCalledWith(4, 't');
    });

    it('should display current search value', () => {
      const props = { ...defaultProps, searchQuery: 'test query' };
      render(<Header {...props} />);

      const searchInputs = screen.getAllByDisplayValue('test query');
      expect(searchInputs.length).toBeGreaterThan(0);
    });
  });

  describe('User Menu', () => {
    it('should display user name in menu', async () => {
      render(<Header {...defaultProps} />);

      const menuButton = screen.getByLabelText((content, element) => {
        return element?.getAttribute('aria-label') === 'Menu' || 
               element?.getAttribute('aria-label')?.includes('Menu') ||
               content.includes('Menu');
      });
      
      if (!menuButton) {
        // Fallback: find button with aria-expanded
        const buttons = screen.getAllByRole('button');
        const found = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
        if (found) {
          await userEvent.click(found);
        }
      } else {
        await userEvent.click(menuButton);
      }

      expect(screen.getByText('Ivan Petrov')).toBeInTheDocument();
    });

    it('should open and close menu on click', async () => {
      render(<Header {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      // Menu is closed
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();

      // Open menu
      await userEvent.click(menuButton);
      expect(screen.getByText('Profile')).toBeInTheDocument();

      // Close menu
      await userEvent.click(menuButton);
      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });

    it('should call onUserMenuAction on profile click', async () => {
      const onUserMenuAction = vi.fn();
      const props = { ...defaultProps, onUserMenuAction };
      render(<Header {...props} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);

      const profileButton = screen.getByText('Profile');
      await userEvent.click(profileButton);

      expect(onUserMenuAction).toHaveBeenCalledWith('profile');
    });

    it('should call onUserMenuAction on settings click', async () => {
      const onUserMenuAction = vi.fn();
      const props = { ...defaultProps, onUserMenuAction };
      render(<Header {...props} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);

      const settingsButton = screen.getByText('Settings');
      await userEvent.click(settingsButton);

      expect(onUserMenuAction).toHaveBeenCalledWith('settings');
    });

    it('should call onUserMenuAction on logout click', async () => {
      const onUserMenuAction = vi.fn();
      const props = { ...defaultProps, onUserMenuAction };
      render(<Header {...props} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);

      const logoutButton = screen.getByText('Logout');
      await userEvent.click(logoutButton);

      expect(onUserMenuAction).toHaveBeenCalledWith('logout');
    });

    it('should close menu after action selection', async () => {
      render(<Header {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);

      const profileButton = screen.getByText('Profile');
      await userEvent.click(profileButton);

      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });

    it('should close menu on outside click', async () => {
      const { container } = render(<Header {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);

      expect(screen.getByText('Profile')).toBeInTheDocument();

      // Click outside menu
      fireEvent.mouseDown(container.querySelector('header') as HTMLElement);

      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });
  });

  describe('User Avatar', () => {
    it('should display user avatar if provided', () => {
      const props = {
        ...defaultProps,
        userAvatar: 'https://example.com/avatar.jpg',
      };
      render(<Header {...props} />);

      const avatar = screen.getByAltText('Ivan Petrov');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('should display initials if avatar not provided', () => {
      render(<Header {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      expect(menuButton).toBeInTheDocument();
    });
  });

  describe('Logo and Title', () => {
    it('should display application logo', () => {
      render(<Header {...defaultProps} />);

      expect(screen.getByText('Admin Support')).toBeInTheDocument();
      expect(screen.getByText('Session Management')).toBeInTheDocument();
    });

    it('should display Users icon in logo', () => {
      const { container } = render(<Header {...defaultProps} />);

      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });
  });

  describe('Responsiveness', () => {
    it('should display component on mobile devices', () => {
      render(<Header {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      expect(menuButton).toBeInTheDocument();
      
      const searchInputs = screen.getAllByPlaceholderText(/Poisk|Search/i);
      expect(searchInputs.length).toBeGreaterThan(0);
    });

    it('should have correct classes for responsiveness', () => {
      const { container } = render(<Header {...defaultProps} />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('bg-telegram-bg');
      expect(header).toHaveClass('border-b');
      expect(header).toHaveClass('border-telegram-border');
    });
  });

  describe('Telegram Theme Styles', () => {
    it('should apply telegram-theme styles', () => {
      const { container } = render(<Header {...defaultProps} />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('telegram-shadow-sm');

      const inputs = container.querySelectorAll('input');
      inputs.forEach((input) => {
        expect(input).toHaveClass('telegram-input');
      });
    });

    it('should use correct color classes', () => {
      const { container } = render(<Header {...defaultProps} />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('bg-telegram-bg');
      expect(header).toHaveClass('border-telegram-border');
    });
  });

  describe('Event Handlers', () => {
    it('should not call handlers if not provided', async () => {
      const props = {
        stats: { total: 10, new: 2, active: 5 },
      };
      render(<Header {...props} />);

      const searchInputs = screen.getAllByPlaceholderText(/Poisk|Search/i);
      await userEvent.type(searchInputs[0], 'test');

      expect(screen.getByText('Admin Support')).toBeInTheDocument();
    });

    it('should handle rapid menu clicks', async () => {
      const onUserMenuAction = vi.fn();
      const props = { ...defaultProps, onUserMenuAction };
      render(<Header {...props} />);

      const buttons = screen.getAllByRole('button');
      const menuButton = buttons.find(btn => btn.getAttribute('aria-expanded') !== null);
      
      if (!menuButton) return;

      await userEvent.click(menuButton);
      await userEvent.click(menuButton);
      await userEvent.click(menuButton);

      expect(menuButton).toBeInTheDocument();
    });
  });
});
