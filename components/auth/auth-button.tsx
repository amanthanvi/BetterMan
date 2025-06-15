'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'

interface AuthButtonProps {
  user: User | null
}

export function AuthButton({ user: initialUser }: AuthButtonProps) {
  const router = useRouter()
  const [user, setUser] = useState(initialUser)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      setUser(null)
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/login')}
        >
          Sign In
        </Button>
        <Button
          size="sm"
          onClick={() => router.push('/signup')}
        >
          Sign Up
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/profile')}
        className="gap-2"
      >
        <UserIcon className="h-4 w-4" />
        <span className="hidden sm:inline">
          {user.email?.split('@')[0]}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        disabled={loading}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}