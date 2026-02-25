import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TimerService } from '../../services/timer.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent {
  readonly timer  = inject(TimerService);
  readonly auth   = inject(AuthService);
  private router  = inject(Router);

  // SVG ring constants
  readonly RADIUS = 120;
  readonly CIRCUMFERENCE = 2 * Math.PI * this.RADIUS;

  readonly strokeDashoffset = computed(() => {
    const remaining = 1 - this.timer.progress();
    return this.CIRCUMFERENCE * remaining;
  });

  readonly stateLabel = computed(() => {
    const s = this.timer.state();
    if (s === 'idle') return 'Ready';
    if (s === 'running') return 'Focus time';
    if (s === 'paused') return 'Paused';
    return 'Session complete!';
  });

  readonly ringClass = computed(() => {
    const s = this.timer.state();
    if (s === 'done') return 'ring-done';
    if (s === 'running') return 'ring-running';
    if (s === 'paused') return 'ring-paused';
    return 'ring-idle';
  });

  get isRunning() { return this.timer.state() === 'running'; }
  get isPaused()  { return this.timer.state() === 'paused'; }
  get isDone()    { return this.timer.state() === 'done'; }
  get isIdle()    { return this.timer.state() === 'idle'; }

  start()  { this.timer.start(); }
  pause()  { this.timer.pause(); }
  reset()  { this.timer.reset(); }
  resume() { this.timer.start(); }

  // ── Session duration editing ────────────────────────────────────────────────
  editingDuration = signal(false);
  draftMinutes    = signal(50);
  loginPrompt     = signal(false); // show "login to edit" nudge

  requestEdit() {
    // Can't change duration while session is active
    if (this.isRunning || this.isPaused) return;

    if (!this.auth.isLoggedIn()) {
      // Flash the login nudge briefly, then redirect
      this.loginPrompt.set(true);
      setTimeout(() => {
        this.loginPrompt.set(false);
        this.router.navigate(['/login'], { queryParams: { returnUrl: '/dashboard' } });
      }, 1400);
      return;
    }

    this.draftMinutes.set(this.timer.durationMinutes());
    this.editingDuration.set(true);
  }

  applyDuration() {
    const val = this.draftMinutes();
    if (val >= 1 && val <= 180) {
      this.timer.setDuration(val);
    }
    this.editingDuration.set(false);
  }

  cancelEdit() {
    this.editingDuration.set(false);
  }

  onDraftInput(event: Event) {
    const raw = (event.target as HTMLInputElement).valueAsNumber;
    this.draftMinutes.set(isNaN(raw) ? 1 : raw);
  }
}
