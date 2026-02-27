import { Component, signal, inject } from '@angular/core';
import { Validators, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);

  loading     = signal(false);
  error       = signal<string | null>(null);
  showPassword = signal(false);

  loginFormGroup = new FormGroup({
    email: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly DEMO_EMAIL    = 'demo@tracksesh.com';
  readonly DEMO_PASSWORD = 'demo1234';

  useDemo() {
    this.loginFormGroup.setValue({ email: this.DEMO_EMAIL, password: this.DEMO_PASSWORD });
    this.onSubmit();
  }

  get emailFormControl(){
    return this.loginFormGroup.controls.email;
  }

  get passwordFormControl(){
    return this.loginFormGroup.controls.password;
  }

  onSubmit(){
    if (this.loginFormGroup.invalid) {
      this.loginFormGroup.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.loginFormGroup.getRawValue();
    this.authService.login(email, password).subscribe({
      next: () => {
        this.router.navigate(['']);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Invalid credentials. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
