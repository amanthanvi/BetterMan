import { test, expect } from '@playwright/test'

test.describe('Search functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should perform basic search', async ({ page }) => {
    // Click on search input
    await page.click('[placeholder="Search for commands..."]')
    
    // Type search query
    await page.fill('[placeholder="Search for commands..."]', 'ls')
    
    // Wait for results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
    
    // Verify results contain 'ls'
    await expect(page.locator('text=list directory contents')).toBeVisible()
  })

  test('should show instant results while typing', async ({ page }) => {
    const searchInput = page.locator('[placeholder="Search for commands..."]')
    
    // Type slowly to see instant results
    await searchInput.click()
    await searchInput.type('g', { delay: 100 })
    await expect(page.locator('[data-testid="instant-results"]')).toBeVisible()
    
    await searchInput.type('i', { delay: 100 })
    await expect(page.locator('text=git')).toBeVisible()
    
    await searchInput.type('t', { delay: 100 })
    await expect(page.locator('text=git - the fast distributed version control system')).toBeVisible()
  })

  test('should navigate to document on result click', async ({ page }) => {
    await page.fill('[placeholder="Search for commands..."]', 'grep')
    await page.waitForSelector('[data-testid="search-results"]')
    
    // Click first result
    await page.click('[data-testid="result-0"]')
    
    // Should navigate to document page
    await expect(page).toHaveURL(/\/docs\/grep/)
    await expect(page.locator('h1')).toContainText('grep')
  })

  test('should handle empty search results', async ({ page }) => {
    await page.fill('[placeholder="Search for commands..."]', 'xyznonexistentcommand')
    
    await expect(page.locator('text=No results found')).toBeVisible()
    await expect(page.locator('text=Try a different search term')).toBeVisible()
  })

  test('should use keyboard navigation', async ({ page }) => {
    await page.fill('[placeholder="Search for commands..."]', 'ls')
    await page.waitForSelector('[data-testid="search-results"]')
    
    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="result-0"]')).toHaveClass(/highlighted/)
    
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="result-1"]')).toHaveClass(/highlighted/)
    
    // Select with Enter
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/docs\//)
  })

  test('should filter by section', async ({ page }) => {
    await page.fill('[placeholder="Search for commands..."]', 'printf')
    await page.waitForSelector('[data-testid="search-results"]')
    
    // Click section filter
    await page.click('label:has-text("Section 1")')
    
    // Wait for filtered results
    await page.waitForTimeout(500)
    
    // All results should be from section 1
    const sections = await page.locator('[data-testid="result-section"]').allTextContents()
    sections.forEach(section => {
      expect(section).toBe('(1)')
    })
  })

  test('should clear search', async ({ page }) => {
    await page.fill('[placeholder="Search for commands..."]', 'test')
    await page.waitForSelector('[data-testid="search-results"]')
    
    // Click clear button
    await page.click('[aria-label="Clear search"]')
    
    // Search should be empty
    await expect(page.locator('[placeholder="Search for commands..."]')).toHaveValue('')
    await expect(page.locator('[data-testid="search-results"]')).not.toBeVisible()
  })

  test('should show search history', async ({ page }) => {
    // Perform some searches
    await page.fill('[placeholder="Search for commands..."]', 'ls')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    
    await page.fill('[placeholder="Search for commands..."]', 'grep')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    
    // Clear and focus search
    await page.click('[placeholder="Search for commands..."]')
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    
    // Should show recent searches
    await expect(page.locator('text=Recent searches')).toBeVisible()
    await expect(page.locator('text=grep')).toBeVisible()
    await expect(page.locator('text=ls')).toBeVisible()
  })

  test('should handle search errors gracefully', async ({ page }) => {
    // Intercept API call and return error
    await page.route('**/api/search*', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })
    
    await page.fill('[placeholder="Search for commands..."]', 'test')
    
    await expect(page.locator('text=An error occurred')).toBeVisible()
    await expect(page.locator('button:has-text("Try again")')).toBeVisible()
  })

  test('should support advanced search', async ({ page }) => {
    // Open advanced search
    await page.click('[aria-label="Advanced search"]')
    
    // Fill advanced search form
    await page.fill('[name="query"]', 'file')
    await page.selectOption('[name="section"]', '1')
    await page.click('[name="exact_match"]')
    
    // Submit
    await page.click('button:has-text("Search")')
    
    // Should show filtered results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
    await expect(page.locator('text=Advanced search results')).toBeVisible()
  })
})