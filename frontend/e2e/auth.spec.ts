import { test, expect } from '@playwright/test'

test.describe('Authentication flows', () => {
  test('should complete login flow', async ({ page }) => {
    await page.goto('/login')
    
    // Fill login form
    await page.fill('[name="username"]', 'testuser')
    await page.fill('[name="password"]', 'TestPass123!')
    
    // Submit
    await page.click('button:has-text("Sign in")')
    
    // Should redirect to home
    await expect(page).toHaveURL('/')
    
    // Should show user menu
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
    await expect(page.locator('text=testuser')).toBeVisible()
  })

  test('should show validation errors', async ({ page }) => {
    await page.goto('/login')
    
    // Submit empty form
    await page.click('button:has-text("Sign in")')
    
    // Should show errors
    await expect(page.locator('text=Username is required')).toBeVisible()
    await expect(page.locator('text=Password is required')).toBeVisible()
  })

  test('should handle invalid credentials', async ({ page }) => {
    await page.goto('/login')
    
    await page.fill('[name="username"]', 'wronguser')
    await page.fill('[name="password"]', 'wrongpass')
    await page.click('button:has-text("Sign in")')
    
    await expect(page.locator('text=Invalid username or password')).toBeVisible()
  })

  test('should complete registration flow', async ({ page }) => {
    await page.goto('/signup')
    
    // Fill registration form
    await page.fill('[name="username"]', `user${Date.now()}`)
    await page.fill('[name="email"]', `user${Date.now()}@test.com`)
    await page.fill('[name="password"]', 'SecurePass123!')
    await page.fill('[name="confirmPassword"]', 'SecurePass123!')
    
    // Accept terms
    await page.click('[name="acceptTerms"]')
    
    // Submit
    await page.click('button:has-text("Create account")')
    
    // Should show success and redirect
    await expect(page.locator('text=Account created successfully')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('should validate password requirements', async ({ page }) => {
    await page.goto('/signup')
    
    // Enter weak password
    await page.fill('[name="password"]', 'weak')
    await page.click('[name="confirmPassword"]') // Trigger blur
    
    // Should show password requirements
    await expect(page.locator('text=At least 8 characters')).toBeVisible()
    await expect(page.locator('text=One uppercase letter')).toBeVisible()
    await expect(page.locator('text=One number')).toBeVisible()
    await expect(page.locator('text=One special character')).toBeVisible()
  })

  test('should handle OAuth login', async ({ page }) => {
    await page.goto('/login')
    
    // Mock OAuth redirect
    await page.route('**/api/auth/oauth/github', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ auth_url: 'https://github.com/login/oauth' }),
      })
    })
    
    // Click GitHub login
    await page.click('button:has-text("Sign in with GitHub")')
    
    // Should initiate OAuth flow
    await expect(page).toHaveURL(/github\.com/)
  })

  test('should handle 2FA verification', async ({ page }) => {
    await page.goto('/login')
    
    // Mock API to require 2FA
    await page.route('**/api/auth/login', route => {
      route.fulfill({
        status: 403,
        body: JSON.stringify({ detail: '2FA_REQUIRED' }),
      })
    })
    
    await page.fill('[name="username"]', 'user2fa')
    await page.fill('[name="password"]', 'Pass123!')
    await page.click('button:has-text("Sign in")')
    
    // Should show 2FA input
    await expect(page.locator('text=Enter your 2FA code')).toBeVisible()
    await expect(page.locator('[name="twoFactorCode"]')).toBeVisible()
    
    // Enter 2FA code
    await page.fill('[name="twoFactorCode"]', '123456')
    await page.click('button:has-text("Verify")')
  })

  test('should handle logout', async ({ page, context }) => {
    // Set auth cookie
    await context.addCookies([{
      name: 'auth_token',
      value: 'mock_token',
      domain: 'localhost',
      path: '/',
    }])
    
    await page.goto('/')
    
    // Click user menu
    await page.click('[data-testid="user-menu"]')
    
    // Click logout
    await page.click('text=Sign out')
    
    // Should redirect to home and clear auth
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible()
    await expect(page.locator('text=Sign in')).toBeVisible()
  })

  test('should protect authenticated routes', async ({ page }) => {
    // Try to access protected route
    await page.goto('/profile')
    
    // Should redirect to login
    await expect(page).toHaveURL('/login?redirect=/profile')
    await expect(page.locator('text=Please sign in to continue')).toBeVisible()
  })

  test('should remember user preference', async ({ page }) => {
    await page.goto('/login')
    
    // Check remember me
    await page.click('[name="rememberMe"]')
    
    await page.fill('[name="username"]', 'testuser')
    await page.fill('[name="password"]', 'TestPass123!')
    await page.click('button:has-text("Sign in")')
    
    // Check that cookie has extended expiry
    const cookies = await page.context().cookies()
    const authCookie = cookies.find(c => c.name === 'auth_token')
    
    expect(authCookie).toBeDefined()
    expect(authCookie!.expires).toBeGreaterThan(Date.now() / 1000 + 7 * 24 * 60 * 60) // 7 days
  })

  test('should handle session expiry', async ({ page, context }) => {
    // Set expired auth cookie
    await context.addCookies([{
      name: 'auth_token',
      value: 'expired_token',
      domain: 'localhost',
      path: '/',
      expires: Date.now() / 1000 - 3600, // Expired 1 hour ago
    }])
    
    await page.goto('/profile')
    
    // Should redirect to login with message
    await expect(page).toHaveURL('/login')
    await expect(page.locator('text=Your session has expired')).toBeVisible()
  })
})