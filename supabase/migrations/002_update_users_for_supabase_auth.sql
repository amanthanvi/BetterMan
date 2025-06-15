-- Update users table to work with Supabase Auth instead of Clerk
-- This migration updates the existing schema to use Supabase's auth.users

-- First, drop the existing foreign key constraints and indexes if they exist
DROP INDEX IF EXISTS idx_users_clerk_id;

-- Rename clerk_id column to id and change its type to UUID
ALTER TABLE public.users 
DROP COLUMN IF EXISTS clerk_id CASCADE;

-- The id column should already exist as UUID, just ensure it references auth.users
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_id_fkey;

ALTER TABLE public.users 
ADD CONSTRAINT users_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies to use auth.uid() instead of clerk_id
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Update user preferences policies
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own preferences" ON public.user_preferences
  FOR ALL USING (user_id = auth.uid());

-- Update favorites policies
DROP POLICY IF EXISTS "Users can manage own favorites" ON public.favorites;

CREATE POLICY "Users can manage own favorites" ON public.favorites
  FOR ALL USING (user_id = auth.uid());

-- Update search history policies
DROP POLICY IF EXISTS "Users can manage own search history" ON public.search_history;

CREATE POLICY "Users can manage own search history" ON public.search_history
  FOR ALL USING (user_id = auth.uid());

-- Update recent documents policies
DROP POLICY IF EXISTS "Users can manage own recent documents" ON public.recent_documents;

CREATE POLICY "Users can manage own recent documents" ON public.recent_documents
  FOR ALL USING (user_id = auth.uid());

-- Update bookmarks policies
DROP POLICY IF EXISTS "Users can manage own bookmarks" ON public.bookmarks;

CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks
  FOR ALL USING (user_id = auth.uid());

-- Update notes policies
DROP POLICY IF EXISTS "Users can manage own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can view public notes" ON public.notes;

CREATE POLICY "Users can manage own notes" ON public.notes
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view public notes" ON public.notes
  FOR SELECT USING (is_public = true);

-- Update user sessions policies
DROP POLICY IF EXISTS "Users can view own sessions" ON public.user_sessions;

CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Add a function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    new.id, 
    new.email,
    new.created_at,
    new.created_at
  );
  
  -- Also create default preferences
  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();