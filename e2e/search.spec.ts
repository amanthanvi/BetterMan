import { test, expect } from '@playwright/test'

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should perform search from homepage', async ({ page }) => {
    // Find search input
    const searchInput = page.getByPlaceholder('Search for any Linux command...')
    
    // Type search query
    await searchInput.fill('ls')
    
    // Wait for results
    await expect(page.getByText('list directory contents')).toBeVisible()
    
    // Click on result
    await page.getByText('ls').first().click()
    
    // Should navigate to docs page
    await expect(page).toHaveURL(/\/docs\/ls/)
    await expect(page.getByRole('heading', { name: 'ls' })).toBeVisible()
  })

  test('should show search suggestions', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search for any Linux command...')
    
    // Type partial query
    await searchInput.fill('gre')
    
    // Should show suggestions
    await expect(page.getByText('grep')).toBeVisible()
  })

  test('should filter search results', async ({ page }) => {
    await page.goto('/search?q=file')
    
    // Open filter menu
    await page.getByRole('button', { name: /filter/i }).click()
    
    // Select complexity filter
    await page.getByText('Basic').click()
    
    // Results should be filtered
    await expect(page.getByText('basic', { exact: false })).toBeVisible()
  })

  test('keyboard navigation should work', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search for any Linux command...')
    
    // Focus search
    await searchInput.focus()
    
    // Type query
    await searchInput.fill('ls')
    
    // Navigate with keyboard
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    
    // Should navigate to docs
    await expect(page).toHaveURL(/\/docs\//)
  })

  test('command palette search', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Meta+k')
    
    // Search input should be focused
    const paletteInput = page.getByPlaceholder('Type a command or search...')
    await expect(paletteInput).toBeFocused()
    
    // Type command
    await paletteInput.fill('grep')
    
    // Should show documentation results
    await expect(page.getByText('search text patterns')).toBeVisible()
  })
})

test.describe('Mobile Search', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('should work on mobile', async ({ page }) => {
    await page.goto('/')
    
    const searchInput = page.getByPlaceholder('Search for any Linux command...')
    await searchInput.fill('ls')
    
    await expect(page.getByText('list directory contents')).toBeVisible()
  })
})