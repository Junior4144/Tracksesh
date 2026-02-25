import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'tracksesh_theme';

  theme = signal<Theme>(
    (localStorage.getItem(this.STORAGE_KEY) as Theme) ?? 'dark'
  );

  isDark = () => this.theme() === 'dark';

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(this.STORAGE_KEY, t);
    });
    // Apply on boot
    document.documentElement.setAttribute('data-theme', this.theme());
  }

  toggle() {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}
