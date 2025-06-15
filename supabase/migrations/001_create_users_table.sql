-- Create users table to sync with Clerk
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  full_name TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create indexes for better performance
CREATE INDEX idx_users_clerk_id ON public.users(clerk_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_created_at ON public.users(created_at DESC);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'system',
  font_size TEXT DEFAULT 'medium',
  line_height TEXT DEFAULT 'normal',
  show_line_numbers BOOLEAN DEFAULT true,
  syntax_highlighting BOOLEAN DEFAULT true,
  auto_save BOOLEAN DEFAULT true,
  keyboard_shortcuts JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_title TEXT,
  document_section TEXT,
  document_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  UNIQUE(user_id, document_id)
);

-- Create search history table
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create recent documents table
CREATE TABLE IF NOT EXISTS public.recent_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_title TEXT,
  document_section TEXT,
  document_summary TEXT,
  last_visited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  visit_count INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}' NOT NULL,
  UNIQUE(user_id, document_id)
);

-- Create bookmarks table
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  section_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  position JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create user sessions table for analytics
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  pages_viewed INTEGER DEFAULT 0,
  searches_performed INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX idx_search_history_user_id ON public.search_history(user_id);
CREATE INDEX idx_search_history_created_at ON public.search_history(created_at DESC);
CREATE INDEX idx_recent_documents_user_id ON public.recent_documents(user_id);
CREATE INDEX idx_recent_documents_last_visited ON public.recent_documents(last_visited_at DESC);
CREATE INDEX idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX idx_notes_user_id ON public.notes(user_id);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_started_at ON public.user_sessions(started_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmarks_updated_at BEFORE UPDATE ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only view and update their own data
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid()::text = clerk_id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid()::text = clerk_id);

-- User preferences policies
CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

-- Favorites policies
CREATE POLICY "Users can manage own favorites" ON public.favorites
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

-- Search history policies
CREATE POLICY "Users can manage own search history" ON public.search_history
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

-- Recent documents policies
CREATE POLICY "Users can manage own recent documents" ON public.recent_documents
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

-- Bookmarks policies
CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

-- Notes policies
CREATE POLICY "Users can manage own notes" ON public.notes
  FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Users can view public notes" ON public.notes
  FOR SELECT USING (is_public = true);

-- User sessions policies
CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.uid()::text));